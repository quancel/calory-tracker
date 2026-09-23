import { Injectable, type Signal, computed, inject, signal } from '@angular/core';
import { addDaysToKey, todayKey } from '../core/date.calculations';
import { type WeightEntryValidation, validateWeightEntry } from '../core/weight.calculations';
import { type WeightLogEntry, WeightLogsService } from '../core/weight-logs.service';
import { GoalsService } from './goals.service';
import { GoalsStore } from './goals.store';
import type { CalorieSuggestionResult, IntakeDay } from './models/weight.model';
import {
  WEIGHT_CHART_WINDOW_DAYS,
  WEIGHT_TREND_WINDOW_DAYS,
  type WeightChartSegment,
  type WeightChartYDomain,
  buildWeightChartSegments,
  computeCalorieSuggestion,
  computeWeightChartYDomain,
  filterWeightChartWindow,
} from './weight.calculations';

interface PendingReplace {
  readonly existingWeightKg: number;
  readonly newWeightKg: number;
}

/**
 * Zweiter Signal-Store des Features `goals` (ADR-0017 Punkt 5, ausdrückliche
 * Ausnahme von „kein zweiter Store je Feature ohne ADR"). Zuständig für
 * Gewichtsliste, Erfassen-Sheet-Zustand, Bestätigungsdialog beim Ersetzen
 * und den Kalorienziel-Vorschlag samt „verworfen"-Zustand (ADR-0017 Punkt 6).
 *
 * Injiziert `GoalsStore` **nur** zum Lesen des aktuellen Zielgewichts
 * (ADR-0018 Punkt 6) und zur Übernahme eines Vorschlags in das
 * Kalorien-Feld (`GoalsStore.setInput('kcal', …)` + `save('kcal')`,
 * ADR-0017 Punkt 5) — `goals.service.ts` bleibt der einzige Schreibweg auf
 * `goals`, `WeightStore` schreibt dort nie selbst. Messungen lesen/schreiben
 * läuft seit ADR-0019 über `core/weight-logs.service.ts`.
 */
@Injectable({ providedIn: 'root' })
export class WeightStore {
  private readonly goalsService = inject(GoalsService);
  private readonly weightLogsService = inject(WeightLogsService);
  private readonly goalsStore = inject(GoalsStore);

  private readonly logsState = signal<WeightLogEntry[]>([]);
  private readonly intakeState = signal<IntakeDay[]>([]);
  private readonly loadingState = signal(true);
  private readonly loadErrorState = signal<string | null>(null);

  private readonly sheetOpenState = signal(false);
  private readonly weightInputState = signal('');
  private readonly savingState = signal(false);
  private readonly submitErrorState = signal<string | null>(null);
  private readonly pendingReplaceState = signal<PendingReplace | null>(null);

  /** Verworfener kcal-Wert (ADR-0017 Punkt 6) — reiner Client-State, nicht persistiert, wird beim Verlassen der Route nicht extra geleert (Store ist `providedIn: 'root'`, lebt mit der Sitzung). */
  private readonly dismissedSuggestionKcalState = signal<number | null>(null);

  readonly loading = this.loadingState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  readonly hasEntries = computed(() => this.logsState().length > 0);

  readonly sheetOpen = this.sheetOpenState.asReadonly();
  readonly saving = this.savingState.asReadonly();
  readonly submitError = this.submitErrorState.asReadonly();
  readonly pendingReplace = this.pendingReplaceState.asReadonly();

  readonly weightInput = this.weightInputState.asReadonly();
  readonly weightValidation: Signal<WeightEntryValidation> = computed(() =>
    validateWeightEntry(this.weightInputState()),
  );
  readonly canSubmit = computed(() => this.weightValidation().valid);

  /** Diagrammpunkte im 90-Tage-Fenster, aufsteigend nach Datum (ADR-0017 Punkt 7). */
  readonly chartPoints = computed(() => filterWeightChartWindow(this.logsState(), todayKey()));
  readonly chartSegments: Signal<readonly WeightChartSegment[]> = computed(() =>
    buildWeightChartSegments(this.chartPoints()),
  );
  readonly chartYDomain: Signal<WeightChartYDomain> = computed(() =>
    computeWeightChartYDomain(this.chartPoints()),
  );

  /**
   * Rohes Vorschlagsergebnis der Rechenregel (Zustands-Priorität,
   * ADR-0018 Punkt 4). `targetWeightKg` kommt ausschließlich aus dem
   * bereits geladenen `GoalsStore` — kein zweiter Ladepfad.
   */
  readonly suggestion: Signal<CalorieSuggestionResult> = computed(() =>
    computeCalorieSuggestion({
      measurements: this.logsState(),
      intakeDays: this.intakeState(),
      targetWeightKg: this.goalsStore.savedValue('targetWeightKg')(),
      referenceDateKey: todayKey(),
    }),
  );

  /**
   * Wie `suggestion()`, aber ausgeblendet, solange der aktuelle Vorschlag
   * exakt dem zuletzt verworfenen kcal-Wert entspricht (ADR-0017 Punkt 6:
   * gemerkt wird der **Wert**, nicht ein Boolean — ein neuer/geänderter
   * Vorschlag erscheint automatisch wieder). Nur der Ausprägung
   * `{ kind: 'suggestion' }` betroffen; die übrigen Zustände (kein
   * Zielgewicht, zu wenig Daten) werden nie durch „Verwerfen" versteckt.
   */
  readonly visibleSuggestion: Signal<CalorieSuggestionResult | null> = computed(() => {
    const result = this.suggestion();
    if (typeof result === 'object' && result.kcal === this.dismissedSuggestionKcalState()) {
      return null;
    }
    return result;
  });

  /**
   * Lädt Gewichtsmessungen (90-Tage-Diagrammfenster, deckt das 28-Tage-
   * Trendfenster vollständig ab) und die Ist-Zufuhr (28-Tage-Trendfenster)
   * parallel. Aufgerufen beim Aktivieren der Ziele-Route, analog
   * `GoalsStore.load()` — seit ADR-0019 die Gewicht-Route `/gewicht`.
   */
  async load(): Promise<void> {
    this.loadingState.set(true);
    this.loadErrorState.set(null);

    const today = todayKey();
    const chartStartKey = addDaysToKey(today, -(WEIGHT_CHART_WINDOW_DAYS - 1));
    const trendStartKey = addDaysToKey(today, -(WEIGHT_TREND_WINDOW_DAYS - 1));

    const [logsResult, intakeResult] = await Promise.all([
      this.weightLogsService.loadWeightLogs(chartStartKey, today),
      this.goalsService.loadIntake(trendStartKey, today),
    ]);

    this.loadingState.set(false);

    if (!logsResult.success) {
      this.loadErrorState.set(logsResult.message);
      return;
    }
    if (!intakeResult.success) {
      this.loadErrorState.set(intakeResult.message);
      return;
    }

    this.logsState.set(logsResult.logs);
    this.intakeState.set(intakeResult.days);
  }

  async retry(): Promise<void> {
    await this.load();
  }

  openSheet(): void {
    this.weightInputState.set('');
    this.submitErrorState.set(null);
    this.pendingReplaceState.set(null);
    this.sheetOpenState.set(true);
  }

  closeSheet(): void {
    this.sheetOpenState.set(false);
    this.pendingReplaceState.set(null);
  }

  setWeightInput(value: string): void {
    this.weightInputState.set(value);
  }

  /**
   * Speichert die Eingabe für **heute** (design-conventions.md
   * „Erfassen-Sheet": kein Datumsfeld). Existiert für heute bereits ein
   * Wert, öffnet sich statt des direkten Speicherns der Bestätigungsdialog
   * (`pendingReplace`) — Ersetzen zählt als destruktive Aktion
   * (design-conventions.md „Ein Gewichtswert pro Kalendertag").
   */
  async submit(): Promise<void> {
    const validation = this.weightValidation();
    if (!validation.valid) return;

    const today = todayKey();
    const existing = this.logsState().find((log) => log.dateKey === today);
    if (existing) {
      this.pendingReplaceState.set({
        existingWeightKg: existing.weightKg,
        newWeightKg: validation.value,
      });
      return;
    }

    await this.performSave(validation.value);
  }

  async confirmReplace(): Promise<void> {
    const pending = this.pendingReplaceState();
    if (!pending) return;
    await this.performSave(pending.newWeightKg);
  }

  cancelReplace(): void {
    this.pendingReplaceState.set(null);
  }

  private async performSave(weightKg: number): Promise<void> {
    this.savingState.set(true);
    this.submitErrorState.set(null);

    const result = await this.weightLogsService.upsertWeightLog(todayKey(), weightKg);

    this.savingState.set(false);
    this.pendingReplaceState.set(null);

    if (!result.success) {
      this.submitErrorState.set(result.message);
      return;
    }

    this.sheetOpenState.set(false);
    this.weightInputState.set('');
    await this.load();
  }

  /**
   * „Übernehmen" (design-conventions.md „Vorschlagskarte"): schreibt
   * **sichtbar** in den bestehenden Kalorien-Feldblock — gleicher
   * Speichervorgang, gleiche „Gespeichert"-Rückmeldung wie eine manuelle
   * Eingabe dort (ADR-0017 Punkt 5). Kein zweiter Schreibweg, kein stiller
   * Hintergrund-Save.
   */
  async adoptSuggestion(): Promise<void> {
    const result = this.suggestion();
    if (typeof result !== 'object' || result.kind !== 'suggestion') return;

    this.goalsStore.setInput('kcal', `${result.kcal}`);
    await this.goalsStore.save('kcal');
  }

  /**
   * „Verwerfen" (design-conventions.md „Vorschlagskarte"): reiner
   * Client-State für die laufende Sitzung, keine Persistenz, kein
   * Übernahme-Verlauf (ADR-0017 Punkt 6).
   */
  dismissSuggestion(): void {
    const result = this.suggestion();
    if (typeof result !== 'object' || result.kind !== 'suggestion') return;
    this.dismissedSuggestionKcalState.set(result.kcal);
  }
}
