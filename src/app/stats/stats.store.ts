import { Injectable, computed, inject, signal } from '@angular/core';
import { maxForwardKey, todayKey } from '../core/date.calculations';
import { computeProgress } from '../core/progress.calculations';
import type { PeriodKind, StatsEntry, StatsGoal } from './models/stats.model';
import {
  anchorForKindChange,
  buildDayBuckets,
  canNavigateForward,
  computeChartScale,
  computePeriodAverages,
  computePeriodBounds,
  formatPeriodLabel,
  isPeriodEmpty,
  shiftPeriod,
} from './stats.calculations';
import { StatsService } from './stats.service';

/**
 * Einzige Zustandsquelle des Verlaufs (siehe code-conventions.md,
 * ADR-0014). Der Anker-Tag ist wie in `DiaryStore` ein lokaler
 * `YYYY-MM-DD`-String. Aggregation/Perioden-Arithmetik laufen
 * ausschließlich über `stats.calculations.ts`, hier nur über `computed`
 * exponiert.
 */
@Injectable({ providedIn: 'root' })
export class StatsStore {
  private readonly statsService = inject(StatsService);

  private readonly kindState = signal<PeriodKind>('week');
  private readonly anchorState = signal<string>(todayKey());
  private readonly entriesState = signal<StatsEntry[]>([]);
  private readonly goalState = signal<StatsGoal | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);

  readonly periodKind = this.kindState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly bounds = computed(() => computePeriodBounds(this.kindState(), this.anchorState()));
  readonly periodLabel = computed(() => formatPeriodLabel(this.kindState(), this.bounds()));

  private readonly nextBounds = computed(() =>
    computePeriodBounds(this.kindState(), shiftPeriod(this.kindState(), this.bounds(), 1)),
  );
  readonly canGoForward = computed(() => canNavigateForward(this.nextBounds(), maxForwardKey()));

  readonly buckets = computed(() =>
    buildDayBuckets(this.bounds().dateKeys, this.entriesState(), todayKey()),
  );
  readonly isEmpty = computed(() => isPeriodEmpty(this.buckets()));
  readonly averages = computed(() => computePeriodAverages(this.buckets()));

  readonly goalKcal = computed(() => this.goalState()?.kcal ?? null);
  readonly chartScale = computed(() => computeChartScale(this.buckets(), this.goalKcal()));

  /** Fortschritt je Balken gegen das kcal-Ziel — Grundlage für Füllung/Warnsegment im Chart. */
  readonly barProgress = computed(() =>
    this.buckets().map((bucket) => ({
      bucket,
      progress: computeProgress(bucket.kcal, this.goalState()?.kcal),
    })),
  );

  readonly kcalAverageProgress = computed(() =>
    computeProgress(this.averages().kcal, this.goalState()?.kcal),
  );
  readonly carbsAverageProgress = computed(() =>
    computeProgress(this.averages().carbsG, this.goalState()?.carbsG),
  );
  readonly proteinAverageProgress = computed(() =>
    computeProgress(this.averages().proteinG, this.goalState()?.proteinG),
  );
  readonly fatAverageProgress = computed(() =>
    computeProgress(this.averages().fatG, this.goalState()?.fatG),
  );

  constructor() {
    void this.load();
  }

  /** Wechselt Woche ↔ Monat unter Erhalt des Anker-Tags (design-conventions.md „Kontext-Erhalt"). */
  async setPeriodKind(kind: PeriodKind): Promise<void> {
    if (kind === this.kindState()) return;
    const nextAnchor = anchorForKindChange(this.bounds(), todayKey());
    this.kindState.set(kind);
    this.anchorState.set(nextAnchor);
    await this.load();
  }

  async goToPreviousPeriod(): Promise<void> {
    this.anchorState.set(shiftPeriod(this.kindState(), this.bounds(), -1));
    await this.load();
  }

  async goToNextPeriod(): Promise<void> {
    if (!this.canGoForward()) return;
    this.anchorState.set(shiftPeriod(this.kindState(), this.bounds(), 1));
    await this.load();
  }

  async retry(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);

    const bounds = this.bounds();
    const [entriesResult, goalResult] = await Promise.all([
      this.statsService.loadPeriod(bounds.startKey, bounds.endKey),
      this.statsService.loadGoal(),
    ]);

    this.loadingState.set(false);

    if (!entriesResult.success) {
      this.errorState.set(entriesResult.message);
      return;
    }

    this.entriesState.set(entriesResult.entries);
    // Fehlschlag des Ziel-Ladevorgangs ist nicht kritisch für den Verlauf
    // (nur Zielinie/105-%-Logik betroffen) — defensiv auf „kein Ziel"
    // statt den Perioden-Fehlerzustand zu setzen.
    this.goalState.set(goalResult.success ? goalResult.goal : null);
  }
}
