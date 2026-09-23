import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { addDaysToKey, formatDateLabel, maxForwardKey, todayKey } from '../core/date.calculations';
import { EntriesService } from '../core/entries.service';
import { EntryQueueService } from '../core/entry-queue.service';
import { MEAL_TYPE_ORDER, type MealType } from '../core/meal-type.constants';
import { computeProgress } from '../core/progress.calculations';
import {
  computeDayTotals,
  computeMealSections,
  suggestedMealTypeForHour,
} from './diary.calculations';
import { DiaryService } from './diary.service';
import type {
  CopyContext,
  CopyFeedbackView,
  CopySourceEntry,
  CopyUndoState,
  DiaryEntry,
  DiaryGoal,
} from './models/diary.model';

/**
 * Einzige Zustandsquelle der Tagesansicht (siehe code-conventions.md,
 * ADR-0006). Der Tagesschlüssel ist ein lokaler `YYYY-MM-DD`-String, nie
 * ein `Date`-Objekt. Aggregation/Fortschritt laufen ausschließlich über
 * `diary.calculations.ts`, hier nur über `computed` exponiert.
 */
@Injectable({ providedIn: 'root' })
export class DiaryStore {
  private readonly diaryService = inject(DiaryService);
  private readonly entriesService = inject(EntriesService);
  private readonly entryQueue = inject(EntryQueueService);

  private readonly dateState = signal<string>(todayKey());
  private readonly entriesState = signal<DiaryEntry[]>([]);
  private readonly goalState = signal<DiaryGoal | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);

  /**
   * Schlanke Kopiervorlage des Bezugstags (`angezeigter Tag − 1`,
   * ADR-0013 Punkt 6/7) — speist Zähler des globalen Auslösers und der
   * Sektions-Badges.
   */
  private readonly copySourceState = signal<CopySourceEntry[]>([]);

  /**
   * Undo-Zustand je Kontext (ADR-0013 Punkt 4): reiner Client-State, nie
   * persistiert. Höchstens ein Eintrag pro Kontext — eine neue Kopieraktion
   * desselben Kontexts ersetzt ihn (`Map.set` überschreibt den Schlüssel).
   * Wird geleert bei bestätigtem Rückgängigmachen, Schließen über „x",
   * Datumswechsel (`goToPreviousDay`/`goToNextDay`) und Verlassen der Seite
   * (`clearAllFeedback`, aufgerufen aus `DiaryShellComponent.ngOnDestroy`).
   * Der `revision`-Reload-Pfad (`loadCurrentDay`) fasst diesen Zustand
   * bewusst nicht an (ADR-0013 Punkt 5).
   */
  private readonly undoState = signal<ReadonlyMap<CopyContext, CopyUndoState>>(new Map());

  readonly currentDate = this.dateState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Vorwärtsgrenze der Datumsnavigation: heute + 7 Tage. Zurück ist unbegrenzt. */
  readonly maxDate = computed(() => maxForwardKey());
  readonly canGoForward = computed(() => this.dateState() < this.maxDate());
  readonly dateLabel = computed(() => formatDateLabel(this.dateState()));

  /** Beschriftung des Bezugstags (`angezeigter Tag − 1`) — dynamisch wie die Datumsnavigation, nicht zwingend „Gestern" (ADR-0013 Punkt 7). */
  readonly previousDayLabel = computed(
    () => formatDateLabel(addDaysToKey(this.dateState(), -1)).text,
  );
  readonly copyDayCount = computed(() => this.copySourceState().length);
  readonly canCopyDay = computed(() => this.copyDayCount() > 0);

  /** Anzahl kopierbarer Vortags-Einträge je Sektion, für die Sektions-Badges. */
  readonly copySectionCounts = computed<Readonly<Record<MealType, number>>>(() => {
    const counts = Object.fromEntries(MEAL_TYPE_ORDER.map((mealType) => [mealType, 0])) as Record<
      MealType,
      number
    >;
    for (const entry of this.copySourceState()) {
      counts[entry.mealType] += 1;
    }
    return counts;
  });

  /** Inline-Rückmeldung des globalen Auslösers, `null` ohne aktiven Undo-Zustand. */
  readonly globalCopyFeedback = computed(() => this.feedbackFor('global'));

  /**
   * Gepufferte Einträge des angezeigten Tages, aus der Puffer-Queue
   * eingemischt (ADR-0016 Punkt 7) — Quelle: `EntryQueueService.entries()`
   * (Signal), nicht das `revision`-Signal. `diary.service.ts` liefert bereits
   * `syncState: 'synced'` für jeden Server-Eintrag.
   */
  private readonly pendingEntriesForDate = computed<DiaryEntry[]>(() =>
    this.entryQueue
      .entries()
      .filter((entry) => entry.date === this.dateState())
      .map((entry) => ({
        id: entry.id,
        mealType: entry.mealType,
        amountG: entry.amountG,
        createdAt: new Date(entry.createdAt).toISOString(),
        syncState: entry.syncState,
        food: {
          id: entry.food.id,
          name: entry.food.name,
          kcal100g: entry.food.kcal100g,
          proteinG100g: entry.food.proteinG100g,
          carbsG100g: entry.food.carbsG100g,
          fatG100g: entry.food.fatG100g,
        },
      })),
  );

  /**
   * Server-Einträge + gepufferte Einträge des angezeigten Tages, EIN
   * Rechenweg für Liste, Sektionen und Tagessummen — ein ungesynchter
   * Eintrag zählt damit zwangsläufig wie ein synchronisierter (ADR-0016
   * Punkt 7). Keine Sonderbehandlung in `diary.calculations.ts`.
   */
  private readonly displayEntries = computed<DiaryEntry[]>(() => [
    ...this.entriesState(),
    ...this.pendingEntriesForDate(),
  ]);

  readonly totals = computed(() => computeDayTotals(this.displayEntries()));
  readonly sections = computed(() => computeMealSections(this.displayEntries()));
  readonly isEmpty = computed(() => this.displayEntries().length === 0);

  readonly kcalProgress = computed(() =>
    computeProgress(this.totals().kcal, this.goalState()?.kcal),
  );
  readonly carbsProgress = computed(() =>
    computeProgress(this.totals().carbsG, this.goalState()?.carbsG),
  );
  readonly proteinProgress = computed(() =>
    computeProgress(this.totals().proteinG, this.goalState()?.proteinG),
  );
  readonly fatProgress = computed(() =>
    computeProgress(this.totals().fatG, this.goalState()?.fatG),
  );

  constructor() {
    // Initialer Ladevorgang UND jede spätere Aktualisierung laufen über
    // denselben Pfad: `entriesService.revision` wird beim ersten `effect`-
    // Lauf mit ihrem Startwert gelesen (kein separater Konstruktor-Aufruf
    // nötig) und erhöht sich nach jedem erfolgreichen Schreibvorgang auf
    // `entries` über `core/entries.service.ts` (ADR-0009 Punkt 4). Richtung
    // der Abhängigkeit bleibt `diary` → `core`; kein optimistisches
    // Einfügen, der ganze Tag wird neu geladen.
    effect(() => {
      this.entriesService.revision();
      void this.loadCurrentDay();
    });
  }

  async goToPreviousDay(): Promise<void> {
    this.dateState.set(addDaysToKey(this.dateState(), -1));
    this.clearAllFeedback();
    await this.loadCurrentDay();
  }

  async goToNextDay(): Promise<void> {
    if (!this.canGoForward()) return;
    this.dateState.set(addDaysToKey(this.dateState(), 1));
    this.clearAllFeedback();
    await this.loadCurrentDay();
  }

  /** Erneuter Ladeversuch für das aktuelle Datum (Fehlerzustand). */
  async retry(): Promise<void> {
    await this.loadCurrentDay();
  }

  /**
   * Manueller Einzel-Retry für GENAU diesen gepufferten Eintrag
   * (design-conventions.md „Erneut versuchen", nur im Zustand „dauerhaft
   * gescheitert" sichtbar). Kein Reload nötig — die Queue ist ein Signal,
   * `pendingEntriesForDate` aktualisiert sich von selbst.
   */
  async retrySync(entryId: string): Promise<void> {
    await this.entriesService.retryEntry(entryId);
  }

  /**
   * Lädt ausschließlich die Zielzeile neu, ohne die Einträge des Tages
   * erneut abzufragen (ADR-0007 Punkt 5) — aufgerufen von `DiaryShellComponent`
   * beim Aktivieren der Tagebuch-Route, damit ein in der Ziele-Ansicht
   * geändertes Ziel nach der Rückkehr sichtbar wird. `DiaryStore` ist
   * `providedIn: 'root'` und lädt sonst nur im Konstruktor. Ein Fehler hier
   * überschreibt bewusst nicht den bestehenden Fehlerzustand des Tages
   * (Einträge bleiben unberührt und sichtbar).
   */
  async reloadGoal(): Promise<void> {
    const result = await this.diaryService.loadGoal();
    if (result.success) {
      this.goalState.set(result.goal);
    }
  }

  /** Tageszeit-Vorauswahl für den globalen FAB (design-conventions.md „Eingabe-Einstieg"). */
  suggestedMealType(): MealType {
    return suggestedMealTypeForHour(new Date().getHours());
  }

  /** Inline-Rückmeldung einer Sektion, `null` ohne aktiven Undo-Zustand für diese Sektion. */
  sectionCopyFeedback(mealType: MealType): CopyFeedbackView | null {
    return this.feedbackFor(mealType);
  }

  /**
   * Inline-Rückmeldung eines beliebigen Kontexts (`'global'` oder ein
   * `MealType`) — für den Bestätigungsdialog, der context-unabhängig
   * denselben Zustand (Quelle: Bezugstag, Anzahl) braucht, um Titel/
   * Beschreibungstext zu bauen.
   */
  feedbackFor(context: CopyContext): CopyFeedbackView | null {
    const state = this.undoState().get(context);
    if (!state) return null;
    return { sourceDateLabel: formatDateLabel(state.sourceDateKey).text, count: state.count };
  }

  /**
   * Kopiert den gesamten Bezugstag additiv in den angezeigten Tag
   * (ADR-0013). Ohne kopierbare Vortags-Einträge ein No-op (der Auslöser
   * ist dann bereits deaktiviert — design_notes „leerer Vortag").
   */
  async copyDay(): Promise<void> {
    await this.performCopy('global', this.copySourceState());
  }

  /** Kopiert nur die Vortags-Einträge einer Sektion in dieselbe Sektion des angezeigten Tages. */
  async copySection(mealType: MealType): Promise<void> {
    await this.performCopy(
      mealType,
      this.copySourceState().filter((entry) => entry.mealType === mealType),
    );
  }

  /**
   * Bestätigte Rücknahme einer Kopieraktion (ADR-0013 Punkt 2): löscht
   * ausschließlich über die getrackten IDs, nie über eine Merkmalssuche.
   * Bereits anderweitig gelöschte IDs werden von `deleteEntries` still-
   * schweigend übersprungen. Der Undo-Zustand wird nur bei Erfolg entfernt.
   */
  async confirmUndo(context: CopyContext): Promise<void> {
    const state = this.undoState().get(context);
    if (!state) return;

    const result = await this.entriesService.deleteEntries(state.entryIds);
    if (!result.success) return;

    this.removeUndoState(context);
  }

  /** Schließen-Affordanz („x"): verwirft die Rückmeldung, die Datensätze bleiben bestehen. */
  dismissFeedback(context: CopyContext): void {
    this.removeUndoState(context);
  }

  /**
   * Leert sämtliche Undo-Zustände — aufgerufen bei Datumswechsel und beim
   * Verlassen der Tagebuch-Seite (`DiaryShellComponent.ngOnDestroy`,
   * ADR-0013 Punkt 4).
   */
  clearAllFeedback(): void {
    this.undoState.set(new Map());
  }

  private async performCopy(
    context: CopyContext,
    sourceEntries: readonly CopySourceEntry[],
  ): Promise<void> {
    if (sourceEntries.length === 0) return;

    const sourceDateKey = addDaysToKey(this.dateState(), -1);
    const targetDateKey = this.dateState();

    const result = await this.entriesService.createEntries(
      sourceEntries.map((entry) => ({
        foodId: entry.foodId,
        amountG: entry.amountG,
        mealType: entry.mealType,
        date: targetDateKey,
      })),
    );

    if (!result.success) return;

    this.setUndoState(context, {
      sourceDateKey,
      entryIds: result.ids,
      count: result.ids.length,
    });
  }

  private setUndoState(context: CopyContext, state: CopyUndoState): void {
    const next = new Map(this.undoState());
    next.set(context, state);
    this.undoState.set(next);
  }

  private removeUndoState(context: CopyContext): void {
    if (!this.undoState().has(context)) return;
    const next = new Map(this.undoState());
    next.delete(context);
    this.undoState.set(next);
  }

  private async loadCurrentDay(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);

    const previousDateKey = addDaysToKey(this.dateState(), -1);
    const [result, copySourceResult] = await Promise.all([
      this.diaryService.loadDay(this.dateState()),
      this.diaryService.loadCopySource(previousDateKey),
    ]);

    this.loadingState.set(false);

    if (!result.success) {
      this.errorState.set(result.message);
      return;
    }

    this.entriesState.set(result.entries);
    this.goalState.set(result.goal);
    // Fehlschlag der Kopiervorlage ist nicht kritisch für die Tagesansicht
    // (nur Zähler/Auslöser betroffen) — defensiv auf leer statt den
    // Tages-Fehlerzustand zu setzen.
    this.copySourceState.set(copySourceResult.success ? copySourceResult.entries : []);
  }
}
