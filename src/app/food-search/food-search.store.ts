import { Injectable, computed, inject, signal } from '@angular/core';
import { EntriesService } from '../core/entries.service';
import {
  computeKcalFromMacros,
  computeLiveNutrition,
  filterFoodsByQuery,
  findPlausibilityFindings,
  resolveDefaultAmount,
  validateAmountField,
} from '../core/foods.calculations';
import { CoreFoodsService, type Food, type FoodSource } from '../core/foods.service';
import type { MealType } from '../core/meal-type.constants';
import { computeMealTotals, sortMealsByName } from '../core/meals.calculations';
import { CoreMealsService, type Meal } from '../core/meals.service';
import {
  type CameraErrorReason,
  type CreateFoodFormValues,
  cameraErrorMessage,
  foodToCorrectFormValues,
  nutritionDraftFromFormValues,
  selectRecentFoods,
  validateCreateFoodForm,
} from './food-search.calculations';
import { FoodSearchService } from './food-search.service';

/** Obergrenze der „Zuletzt verwendet"-Liste bei leerer Suche (statt des vollständigen Katalogs). */
const RECENT_FOODS_LIMIT = 10;

function emptyCreateForm(): CreateFoodFormValues {
  return {
    name: '',
    kcal100g: '',
    proteinG100g: '',
    carbsG100g: '',
    fatG100g: '',
    defaultPortionG: '',
    barcode: '',
  };
}

/** Gemeinsamer Nährwert-Ausschnitt für Step B — sowohl aus `Food` (Anlegen/Auswahl) als auch aus `EntryFood` (Bearbeiten, `core/entries.service.ts`) ableitbar. */
export interface StepBFood {
  id: string;
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
  /** Trägt den Quellenhinweis in Step B (ADR-0010 Punkt 5): erscheint bei JEDEM persistierten `source === 'off'`-Food, nicht nur bei frischen Scan-Treffern. */
  source: FoodSource;
}

/** Zustand des Barcode-Scan-Zustands im Sheet (ADR-0010). */
export type ScanPhase =
  | 'camera'
  | 'looking-up'
  | 'resolved'
  | 'prefill-create'
  | 'not-found'
  | 'api-error'
  | 'camera-error';

/** `scan`, solange der aktuelle Step-B-Entwurf aus einem Barcode-Scan stammt — steuert die Erfolgsansicht mit Serien-Erfassung nach dem Speichern (design-conventions.md „Erfolgsrückmeldung mit primärer + sekundärer Folgeaktion"). */
export type EntryOrigin = 'search' | 'scan';

export interface ScanSavedSummary {
  name: string;
  kcal: number;
}

/** Zwei Segment-Tabs in Step A (design-conventions.md „Segment-Tabs im Eintrags-Sheet"). */
export type StepATab = 'search' | 'saved-meals';

export interface LoggedMealSummary {
  name: string;
  itemCount: number;
}

/**
 * Einzige Zustandsquelle von `food-catalog` für das Eingabe-Sheet
 * (ADR-0008). `providedIn: 'root'`, damit der Sitzungs-Cache über
 * mehrfaches Öffnen/Schließen des Sheets hinweg bestehen bleibt (Punkt 3):
 * `foods` wird nur beim allerersten `ensureLoaded()`-Aufruf einer Sitzung
 * geladen, jede Tastatureingabe danach filtert rein im Speicher über
 * `food-search.calculations.ts` (kein `ilike` je Tastendruck, kein
 * Debounce, kein Skeleton während des Tippens).
 *
 * Seit Paket PO-2026-09-20-007 hält dieser Store zusätzlich den
 * Step-B-Zustand (Food, Menge, Mahlzeit, `entryId` — ADR-0009 Punkt 9):
 * Food/Menge/Mahlzeit/entryId werden bei jedem Sheet-Öffnen über
 * `beginEntrySession()` zurückgesetzt, der Food-Sitzungs-Cache bleibt davon
 * unberührt. Schreibvorgänge laufen ausschließlich über
 * `core/entries.service.ts` (ADR-0009 Punkt 2) — dieser Store baut keinen
 * eigenen Schreibweg auf `entries`.
 *
 * Seit Paket PO-2026-09-20-008 hält dieser Store zusätzlich den
 * Barcode-Scan-Zustand (`scanPhase`, ADR-0010). Ein Scan-Ergebnis
 * (`FoodSearchStore.handleScanDetected()`) führt in genau einen von vier
 * Folgezuständen: Step B vorbelegt (lokaler/OFF-vollständiger Treffer,
 * `scanPhase = 'resolved'`), Step A2 vorbelegt (OFF-unvollständig,
 * `scanPhase = 'prefill-create'`), oder ein Fehlerzustand
 * (`'not-found'`/`'api-error'`/`'camera-error'`), den der Sheet-Component
 * über `store.scanPhase()` rendert. `entryOrigin` unterscheidet, ob der
 * aktuelle Step-B-Entwurf aus einem Scan stammt — nur dann zeigt das
 * Sheet nach dem Speichern die Serien-Erfassungs-Erfolgsansicht
 * ("Nächsten Barcode scannen"/"Fertig") statt einfach zu schließen; die
 * gewählte Mahlzeit bleibt dabei über `resetForNextScan()` erhalten
 * (`mealTypeState` wird dort NICHT zurückgesetzt).
 *
 * Seit Paket PO-2026-09-20-009 hält dieser Store zusätzlich den
 * Step-C-Zustand (Korrektur eines bestehenden Foods, ADR-0011 Punkt 6):
 * `beginCorrect()` sucht das Food im Sitzungs-Cache, `submitCorrect()`
 * schreibt über `FoodSearchService.updateFood()` und aktualisiert Cache
 * sowie einen ggf. aktiven Step-B-Entwurf in place. `correctFindings`
 * liefert die Plausibilitäts-/Vollständigkeitsbefunde für das Banner der
 * Korrekturansicht — eine reine, live aus den aktuellen Formularwerten
 * abgeleitete Darstellung (ADR-0011 Punkt 5), nichts davon wird
 * persistiert.
 */
@Injectable({ providedIn: 'root' })
export class FoodSearchStore {
  private readonly foodSearchService = inject(FoodSearchService);
  private readonly entriesService = inject(EntriesService);
  private readonly coreFoodsService = inject(CoreFoodsService);
  private readonly coreMealsService = inject(CoreMealsService);

  private readonly queryState = signal('');
  /** „Zuletzt verwendet"-IDs (jüngste zuerst), einmal je Sheet-Öffnen geladen (`ensureLoaded()`) — leer, solange noch nichts geloggt wurde oder das Laden fehlschlägt (dann bleibt die Suche trotzdem benutzbar). */
  private readonly recentFoodIdsState = signal<string[]>([]);

  private readonly createFormState = signal<CreateFoodFormValues>(emptyCreateForm());
  private readonly createSavingState = signal(false);
  private readonly createErrorState = signal<string | null>(null);

  // --- Step C: Korrektur eines bestehenden Foods (ADR-0011 Punkt 6) ---
  private readonly correctFormState = signal<CreateFoodFormValues>(emptyCreateForm());
  private readonly correctFoodIdState = signal<string | null>(null);
  private readonly correctSavingState = signal(false);
  private readonly correctErrorState = signal<string | null>(null);

  // --- Step B (ADR-0009 Punkt 9) ---
  private readonly stepBFoodState = signal<StepBFood | null>(null);
  private readonly amountInputState = signal('');
  private readonly mealTypeState = signal<MealType>('snack');
  private readonly entryDateState = signal('');
  private readonly entryIdState = signal<string | null>(null);
  private readonly stepBLoadingState = signal(false);
  private readonly stepBLoadErrorState = signal<string | null>(null);
  private readonly stepBSavingState = signal(false);
  private readonly stepBSaveErrorState = signal<string | null>(null);
  private readonly stepBDeletingState = signal(false);
  private readonly stepBDeleteErrorState = signal<string | null>(null);

  // --- Barcode-Scan (ADR-0010) ---
  private readonly scanPhaseState = signal<ScanPhase>('camera');
  private readonly scanErrorMessageState = signal<string | null>(null);
  private readonly lastScannedBarcodeState = signal<string | null>(null);
  /** Zählt, wie oft in dieser Sheet-Sitzung der Scan-Step betreten wurde — ab dem zweiten Mal (Serien-Erfassung) zeigt die Kamera-Ansicht den Kontext-Hinweis "Wird hinzugefügt zu: {Mahlzeit}" (design-conventions.md). */
  private readonly scanCountState = signal(0);
  private readonly entryOriginState = signal<EntryOrigin>('search');
  private readonly lastSavedSummaryState = signal<ScanSavedSummary | null>(null);

  // --- Segment-Tab „Gespeicherte Mahlzeiten" (Loggen, ADR-0012 Punkt 3/6) ---
  private readonly activeTabState = signal<StepATab>('search');
  private readonly savedMealsState = signal<Meal[]>([]);
  private readonly savedMealsLoadedState = signal(false);
  private readonly savedMealsLoadingState = signal(false);
  private readonly savedMealsLoadErrorState = signal<string | null>(null);
  private readonly loggingMealState = signal(false);
  private readonly loggedMealSummaryState = signal<LoggedMealSummary | null>(null);

  /** `true` nur während des allerersten Ladevorgangs einer Sitzung (Skeleton-Bedingung) — delegiert an den zentralen Food-Cache (ADR-0012 Punkt 1). */
  readonly loading = this.coreFoodsService.loading;
  readonly loadError = this.coreFoodsService.loadError;
  readonly query = this.queryState.asReadonly();
  readonly createForm = this.createFormState.asReadonly();
  readonly createSaving = this.createSavingState.asReadonly();
  readonly createErrorMessage = this.createErrorState.asReadonly();

  /** `true` bei leerer Suche: dann zeigt `results` die „Zuletzt verwendet"-Liste statt des vollständigen Katalogs (der mit wachsendem Bestand unhandlich würde) — der Rest bleibt über die Suche erreichbar. */
  readonly isShowingRecent = computed(() => this.queryState().trim() === '');

  readonly results = computed(() => {
    if (this.isShowingRecent()) {
      return selectRecentFoods(this.coreFoodsService.foods(), this.recentFoodIdsState());
    }
    return filterFoodsByQuery(this.coreFoodsService.foods(), this.queryState());
  });

  /** `true` nur bei leerer Suche UND leerer „Zuletzt verwendet"-Liste (z.B. noch nie etwas geloggt) — eigener, nicht-alarmierender Hinweis statt eines leeren Listenbereichs. */
  readonly showNoRecentState = computed(
    () =>
      this.coreFoodsService.loaded() &&
      !this.coreFoodsService.loading() &&
      this.isShowingRecent() &&
      this.results().length === 0,
  );

  /** Leerzustand (design-conventions.md „Step A"): nur bei einer nicht-leeren Suche ohne Treffer, nie beim ersten Öffnen ohne Eingabe. */
  readonly showEmptyState = computed(
    () =>
      this.coreFoodsService.loaded() &&
      !this.coreFoodsService.loading() &&
      !this.isShowingRecent() &&
      this.results().length === 0,
  );

  readonly createValidation = computed(() => validateCreateFoodForm(this.createFormState()));
  readonly canCreate = computed(
    () => this.createValidation().value !== null && !this.createSavingState(),
  );
  /** Live-Hilfswert fürs kcal-Feld: aus den bereits eingegebenen Makros berechnete Energie, `null` solange nicht alle drei vorhanden sind — reine Eingabehilfe, keine Bewertung. */
  readonly createComputedKcal = computed(() =>
    computeKcalFromMacros(nutritionDraftFromFormValues(this.createFormState())),
  );

  readonly correctForm = this.correctFormState.asReadonly();
  readonly correctSaving = this.correctSavingState.asReadonly();
  readonly correctErrorMessage = this.correctErrorState.asReadonly();
  readonly correctValidation = computed(() => validateCreateFoodForm(this.correctFormState()));
  readonly canSubmitCorrect = computed(
    () => this.correctValidation().value !== null && !this.correctSavingState(),
  );
  /** Alle Befunde für das Banner der Korrekturansicht (design-conventions.md „Anzeige in der Detailansicht") — reine, live aus den aktuellen Formularwerten abgeleitete Darstellung, nirgends persistiert (ADR-0011 Punkt 5). */
  readonly correctFindings = computed(() =>
    findPlausibilityFindings(nutritionDraftFromFormValues(this.correctFormState())),
  );
  /** Live-Hilfswert fürs kcal-Feld, analog createComputedKcal. */
  readonly correctComputedKcal = computed(() =>
    computeKcalFromMacros(nutritionDraftFromFormValues(this.correctFormState())),
  );

  readonly stepBFood = this.stepBFoodState.asReadonly();
  readonly amountInput = this.amountInputState.asReadonly();
  readonly mealType = this.mealTypeState.asReadonly();
  readonly entryId = this.entryIdState.asReadonly();
  /** `true` sobald ein bestehender Eintrag geladen wurde (ADR-0009 Punkt 5) — steuert „Löschen" und den Rücksprung zu Step A. */
  readonly isEditing = computed(() => this.entryIdState() !== null);
  readonly stepBLoading = this.stepBLoadingState.asReadonly();
  readonly stepBLoadError = this.stepBLoadErrorState.asReadonly();
  readonly stepBSaving = this.stepBSavingState.asReadonly();
  readonly stepBSaveError = this.stepBSaveErrorState.asReadonly();
  readonly stepBDeleting = this.stepBDeletingState.asReadonly();
  readonly stepBDeleteError = this.stepBDeleteErrorState.asReadonly();

  readonly amountValidation = computed(() => validateAmountField(this.amountInputState()));
  readonly canSaveEntry = computed(() => this.amountValidation().valid && !this.stepBSavingState());

  /** Live-Berechnung (design-conventions.md „Step B"): `null` ohne gewähltes Food oder bei ungültiger Menge — Update ohne Transition/Delay, reine Skalierung, nie persistiert. */
  readonly liveNutrition = computed(() => {
    const food = this.stepBFoodState();
    const validation = this.amountValidation();
    if (food === null || !validation.valid) return null;
    return computeLiveNutrition(food, validation.value);
  });

  readonly scanPhase = this.scanPhaseState.asReadonly();
  readonly scanErrorMessage = this.scanErrorMessageState.asReadonly();
  /** Serien-Erfassung: Kontext-Hinweis "Wird hinzugefügt zu: {Mahlzeit}" erscheint erst beim Wiedereintritt in den Scan-Step, nicht beim ersten Mal. */
  readonly scanReentry = computed(() => this.scanCountState() > 1);
  readonly entryOrigin = this.entryOriginState.asReadonly();
  readonly lastSavedSummary = this.lastSavedSummaryState.asReadonly();

  readonly activeTab = this.activeTabState.asReadonly();
  readonly savedMealsLoading = this.savedMealsLoadingState.asReadonly();
  readonly savedMealsLoadError = this.savedMealsLoadErrorState.asReadonly();
  readonly loggingMeal = this.loggingMealState.asReadonly();
  readonly loggedMealSummary = this.loggedMealSummaryState.asReadonly();
  /** Leerzustand des Log-Tabs (design-conventions.md „Segment-Tabs im Eintrags-Sheet"). */
  readonly showSavedMealsEmptyState = computed(
    () =>
      this.savedMealsLoadedState() &&
      !this.savedMealsLoadingState() &&
      this.savedMealsState().length === 0,
  );
  /** Sortiert wie die Verwaltungsliste (dieselbe Funktion, ADR-0012 Punkt 3/4), markierungsfrei (design-conventions.md). */
  readonly savedMeals = computed(() =>
    sortMealsByName(this.savedMealsState()).map((meal) => ({
      meal,
      totals: computeMealTotals(
        meal.items.map((item) => ({
          amountG: item.amountG,
          kcal100g: item.food.kcal100g,
          proteinG100g: item.food.proteinG100g,
          carbsG100g: item.food.carbsG100g,
          fatG100g: item.food.fatG100g,
        })),
      ),
    })),
  );

  /**
   * Lädt den Food-Bestand genau einmal je Sitzung — delegiert an den
   * zentralen Food-Cache (ADR-0012 Punkt 1, ehemals ADR-0008 Punkt 3).
   * Erneuter Aufruf ohne `retryLoad()` ist ein No-op für den Katalog.
   *
   * Die „Zuletzt verwendet"-Liste wird dagegen bei JEDEM Sheet-Öffnen neu
   * geladen (kein Sitzungs-Cache) — sie soll auch widerspiegeln, was seit
   * dem letzten Öffnen geloggt wurde.
   */
  async ensureLoaded(): Promise<void> {
    await Promise.all([
      this.coreFoodsService.ensureLoaded(),
      this.loadRecentFoodIds(),
    ]);
  }

  private async loadRecentFoodIds(): Promise<void> {
    const ids = await this.entriesService.loadRecentFoodIds(RECENT_FOODS_LIMIT);
    this.recentFoodIdsState.set(ids);
  }

  /** Erneuter Ladeversuch nach einem Fehler (Retry-Button im Fehlerzustand). */
  async retryLoad(): Promise<void> {
    await this.coreFoodsService.retryLoad();
  }

  setActiveTab(tab: StepATab): void {
    this.activeTabState.set(tab);
    if (tab === 'saved-meals') {
      void this.ensureSavedMealsLoaded();
    }
  }

  /** Lädt die gespeicherten Mahlzeiten genau einmal je Sitzung (gleiches Muster wie `ensureLoaded()`). */
  async ensureSavedMealsLoaded(): Promise<void> {
    if (this.savedMealsLoadedState() || this.savedMealsLoadingState()) return;
    await this.loadSavedMeals();
  }

  async retrySavedMealsLoad(): Promise<void> {
    await this.loadSavedMeals();
  }

  /**
   * Loggt alle Positionen einer gespeicherten Mahlzeit mit hinterlegter
   * Menge in einem Vorgang (`EntriesService.createEntries()`, ADR-0012
   * Punkt 6) — kein Step B, die Mengen stehen bereits fest. Die Sektion/der
   * Tag kommen aus dem Sheet-Header-Kontext (`mealTypeState`/
   * `entryDateState`, wie beim Anlegen). `false` bei leerer Positionsliste
   * (defensiver Guard, die Zeile ist in diesem Fall bereits nicht-
   * interaktiv dargestellt) oder Server-Fehler.
   */
  async logMeal(meal: Meal): Promise<boolean> {
    if (meal.items.length === 0 || this.loggingMealState()) return false;

    this.loggingMealState.set(true);

    const mealType = this.mealTypeState();
    const date = this.entryDateState();
    const result = await this.entriesService.createEntries(
      meal.items.map((item) => ({ foodId: item.food.id, amountG: item.amountG, mealType, date })),
    );

    this.loggingMealState.set(false);

    if (!result.success) {
      return false;
    }

    this.loggedMealSummaryState.set({ name: meal.name, itemCount: meal.items.length });
    return true;
  }

  /** Primäraktion der Erfolgsansicht „Weitere Mahlzeit loggen" — Sektionswahl bleibt über den Header-Kontext erhalten (design-conventions.md). */
  resetForNextMealLog(): void {
    this.loggedMealSummaryState.set(null);
  }

  setQuery(value: string): void {
    this.queryState.set(value);
  }

  /** Bereitet Step A2 vor: Name mit dem aktuellen Suchbegriff vorbelegt, übrige Felder leer (design-conventions.md „Step A2"). */
  beginCreate(): void {
    this.createErrorState.set(null);
    this.createFormState.set({ ...emptyCreateForm(), name: this.queryState().trim() });
  }

  setCreateField<K extends keyof CreateFoodFormValues>(key: K, value: string): void {
    this.createFormState.update((current) => ({ ...current, [key]: value }));
  }

  /**
   * Legt das Food an und fügt es bei Erfolg in den Sitzungs-Cache ein,
   * statt die Liste neu zu laden (ADR-0008 Punkt 3). `null` bei
   * ungültiger Eingabe (defensive guard, Submit-Button ist ohnehin
   * disabled) oder Server-Fehler (`createErrorMessage` zeigt die Meldung).
   * Speichert immer mit `source: 'manual'` (`food-search.service.ts`) —
   * auch wenn das Formular aus einem unvollständigen OFF-Treffer vorbelegt
   * wurde (ADR-0010 Punkt 5: der Nutzer hat die fehlenden Werte selbst
   * ergänzt, das ist keine automatische OFF-Übernahme mehr).
   */
  async createFood(): Promise<Food | null> {
    const validation = this.createValidation();
    if (validation.value === null || this.createSavingState()) return null;

    this.createSavingState.set(true);
    this.createErrorState.set(null);

    const result = await this.foodSearchService.createFood(validation.value);

    this.createSavingState.set(false);

    if (!result.success) {
      this.createErrorState.set(result.message);
      return null;
    }

    this.coreFoodsService.upsertFood(result.food);
    return result.food;
  }

  /**
   * Bereitet Step C (Korrektur, ADR-0011 Punkt 6) vor: sucht das Food im
   * Sitzungs-Cache (`ensureLoaded()` lädt bei Sheet-Öffnen den gesamten
   * Katalog, ADR-0008 Punkt 3 — das Food ist im Normalfall bereits dort).
   * Fallback auf den aktuellen Step-B-Entwurf, falls der Cache beim
   * Bearbeiten-Flow (`entryId`-Route) noch nicht geladen ist, wenn der
   * Nutzer das Bleistift-Icon antippt — `defaultPortionG`/`barcode` sind in
   * diesem Fallback unbekannt (`StepBFood` trägt sie nicht) und bleiben
   * leer, alles andere ist vorbefüllt. `false`, wenn das Food in keinem der
   * beiden Fälle auffindbar ist (defensiver Guard).
   */
  beginCorrect(foodId: string): boolean {
    const cached = this.coreFoodsService.foods().find((food) => food.id === foodId);
    const stepBFood = this.stepBFoodState();
    const food =
      cached ??
      (stepBFood && stepBFood.id === foodId
        ? { ...stepBFood, defaultPortionG: null, barcode: null }
        : null);

    if (food === null) return false;

    this.correctFoodIdState.set(food.id);
    this.correctErrorState.set(null);
    this.correctFormState.set(foodToCorrectFormValues(food));
    return true;
  }

  setCorrectField<K extends keyof CreateFoodFormValues>(key: K, value: string): void {
    this.correctFormState.update((current) => ({ ...current, [key]: value }));
  }

  /**
   * Speichert Step C (ADR-0011 Punkt 6) über `FoodSearchService.updateFood`
   * — schreibt Nährwerte/Name/Standardportion/Barcode UND `is_corrected =
   * true` im selben Statement. Aktualisiert bei Erfolg den Sitzungs-Cache
   * IN PLACE (kein Neuladen, ADR-0011 Punkt 6) und, falls das korrigierte
   * Food gerade in Step B aktiv ist, auch `stepBFoodState` — damit
   * `liveNutrition` sofort die neuen Werte zeigt, ohne dass der Nutzer neu
   * auswählen muss. `null` bei ungültiger Eingabe (defensiver Guard) oder
   * Server-Fehler (`correctErrorMessage` zeigt die Meldung).
   */
  async submitCorrect(): Promise<Food | null> {
    const validation = this.correctValidation();
    const foodId = this.correctFoodIdState();
    if (validation.value === null || foodId === null || this.correctSavingState()) return null;

    this.correctSavingState.set(true);
    this.correctErrorState.set(null);

    const result = await this.foodSearchService.updateFood(foodId, validation.value);

    this.correctSavingState.set(false);

    if (!result.success) {
      this.correctErrorState.set(result.message);
      return null;
    }

    this.coreFoodsService.upsertFood(result.food);

    const stepBFood = this.stepBFoodState();
    if (stepBFood !== null && stepBFood.id === result.food.id) {
      this.stepBFoodState.set({
        id: result.food.id,
        name: result.food.name,
        kcal100g: result.food.kcal100g,
        proteinG100g: result.food.proteinG100g,
        carbsG100g: result.food.carbsG100g,
        fatG100g: result.food.fatG100g,
        source: result.food.source,
      });
    }

    return result.food;
  }

  /**
   * Bereitet eine neue Sheet-Sitzung vor (ADR-0009 Punkt 9): setzt den
   * kompletten Step-B- und Scan-Zustand zurück (Food, Menge, entryId,
   * Lade-/Speicher-/Löschfehler, Scan-Phase, Serien-Zähler) und übernimmt
   * Tag + Mahlzeit aus den Sheet-Routenparametern. Der Food-Sitzungs-Cache
   * (`CoreFoodsService`, ADR-0012 Punkt 1) bleibt davon unberührt. Aufgerufen von
   * `FoodEntrySheetComponent.ngOnInit()` bei jedem Sheet-Öffnen — der
   * Store ist `providedIn: 'root'` und überlebt das Schließen des Sheets.
   */
  beginEntrySession(date: string, mealType: MealType): void {
    this.stepBFoodState.set(null);
    this.amountInputState.set('');
    this.mealTypeState.set(mealType);
    this.entryDateState.set(date);
    this.entryIdState.set(null);
    this.stepBLoadingState.set(false);
    this.stepBLoadErrorState.set(null);
    this.stepBSavingState.set(false);
    this.stepBSaveErrorState.set(null);
    this.stepBDeletingState.set(false);
    this.stepBDeleteErrorState.set(null);

    this.scanPhaseState.set('camera');
    this.scanErrorMessageState.set(null);
    this.lastScannedBarcodeState.set(null);
    this.scanCountState.set(0);
    this.entryOriginState.set('search');
    this.lastSavedSummaryState.set(null);

    this.correctFormState.set(emptyCreateForm());
    this.correctFoodIdState.set(null);
    this.correctSavingState.set(false);
    this.correctErrorState.set(null);

    this.activeTabState.set('search');
    this.loggedMealSummaryState.set(null);
  }

  setMealType(mealType: MealType): void {
    this.mealTypeState.set(mealType);
  }

  setAmountInput(value: string): void {
    this.amountInputState.set(value);
  }

  /**
   * Tap auf eine Trefferzeile (Step A → Step B, ADR-0009 Punkt 1). Übernimmt
   * das gewählte Food unverändert aus dem Sitzungs-Cache (keine erneute
   * Katalogabfrage) und belegt die Menge mit `defaultPortionG`, sonst `100`
   * (ADR-0009 Punkt 10, reine UI-Vorbelegung, nie zurückgeschrieben).
   */
  selectFood(food: Food): void {
    this.entryOriginState.set('search');
    this.stepBFoodState.set(food);
    this.amountInputState.set(resolveDefaultAmount(food));
  }

  /**
   * Lädt einen bestehenden Eintrag zum Bearbeiten (ADR-0009 Punkt 5) über
   * `core/entries.service.ts`. Bei Erfolg werden Food, Menge und Mahlzeit
   * aus dem geladenen Eintrag übernommen (Menge ist bereits gesetzt, keine
   * `defaultPortionG`-Vorbelegung). `false` bei Fehler — `stepBLoadError`
   * zeigt die Meldung.
   */
  async loadEntryForEdit(entryId: string): Promise<boolean> {
    this.stepBLoadingState.set(true);
    this.stepBLoadErrorState.set(null);

    const result = await this.entriesService.loadEntry(entryId);

    this.stepBLoadingState.set(false);

    if (!result.success) {
      this.stepBLoadErrorState.set(result.message);
      return false;
    }

    this.entryIdState.set(result.entry.id);
    this.entryDateState.set(result.entry.date);
    this.mealTypeState.set(result.entry.mealType);
    this.amountInputState.set(`${result.entry.amountG}`);
    this.stepBFoodState.set(result.entry.food);
    this.entryOriginState.set('search');
    return true;
  }

  /**
   * Speichert Step B — legt einen neuen Eintrag an (`entryId` unbesetzt)
   * oder aktualisiert den bereits geladenen (ADR-0009 Punkt 2). Gespeichert
   * werden ausschließlich `food_id`, `amount_g`, `meal_type`, `date`,
   * `user_id` — nie berechnete Werte (kcal/Makros aus `liveNutrition` sind
   * reine Anzeige). `false` bei ungültiger Menge (defensiver Guard, der
   * Speichern-Button ist ohnehin disabled) oder Server-Fehler
   * (`stepBSaveError` zeigt die Meldung). Stammt der Entwurf aus einem
   * Barcode-Scan (`entryOrigin === 'scan'`), wird zusätzlich eine
   * Zusammenfassung für die Serien-Erfassungs-Erfolgsansicht abgelegt
   * (`lastSavedSummary`) — die Sheet-Komponente entscheidet anhand von
   * `entryOrigin`, ob sie schließt oder die Erfolgsansicht zeigt.
   */
  async saveEntry(): Promise<boolean> {
    const validation = this.amountValidation();
    const food = this.stepBFoodState();
    if (!validation.valid || food === null || this.stepBSavingState()) return false;

    this.stepBSavingState.set(true);
    this.stepBSaveErrorState.set(null);

    const entryId = this.entryIdState();
    const mealType = this.mealTypeState();
    const result = entryId
      ? await this.entriesService.updateEntry(entryId, { amountG: validation.value, mealType })
      : await this.entriesService.createEntry({
          foodId: food.id,
          amountG: validation.value,
          mealType,
          date: this.entryDateState(),
        });

    this.stepBSavingState.set(false);

    if (!result.success) {
      this.stepBSaveErrorState.set(result.message);
      return false;
    }

    if (this.entryOriginState() === 'scan') {
      const nutrition = computeLiveNutrition(food, validation.value);
      this.lastSavedSummaryState.set({ name: food.name, kcal: nutrition.kcal });
    }

    return true;
  }

  /** Löscht den geladenen Eintrag (Bearbeiten-Modus, nach Bestätigung im projektweiten Dialog). `false` ohne `entryId` (defensiver Guard) oder bei Server-Fehler (`stepBDeleteError`). */
  async deleteEntry(): Promise<boolean> {
    const entryId = this.entryIdState();
    if (entryId === null || this.stepBDeletingState()) return false;

    this.stepBDeletingState.set(true);
    this.stepBDeleteErrorState.set(null);

    const result = await this.entriesService.deleteEntry(entryId);

    this.stepBDeletingState.set(false);

    if (!result.success) {
      this.stepBDeleteErrorState.set(result.message);
      return false;
    }

    return true;
  }

  /**
   * Betritt den Scan-Step (erstmalig über das Kamera-Icon neben dem
   * Suchfeld, oder erneut über „Nächsten Barcode scannen" via
   * `resetForNextScan()`). Zählt den Wiedereintritt für den
   * Kontext-Hinweis (`scanReentry`).
   */
  beginScanSession(): void {
    this.scanCountState.update((count) => count + 1);
    this.scanPhaseState.set('camera');
    this.scanErrorMessageState.set(null);
    this.lastScannedBarcodeState.set(null);
  }

  /** Kamera-Fehler (Berechtigung verweigert/nicht verfügbar/nicht unterstützt) — meldet `FoodSearchScannerService.start()`. */
  reportCameraError(reason: CameraErrorReason): void {
    this.scanErrorMessageState.set(cameraErrorMessage(reason));
    this.scanPhaseState.set('camera-error');
  }

  /** „Erneut versuchen" nach einem Fehlerzustand (Kamera/OFF) — kein neuer Wiedereintritts-Zähler, derselbe Scan-Besuch wird nur wiederholt. */
  retryScan(): void {
    this.scanPhaseState.set('camera');
    this.scanErrorMessageState.set(null);
  }

  /**
   * Löst einen erkannten Barcode auf (ADR-0010 Punkt 4/5). Ignoriert einen
   * erneuten Aufruf, während bereits ein Lookup läuft (doppelte
   * Erkennung desselben Frames). Setzt je nach Ergebnis `scanPhase`:
   * `'resolved'` (Step B vorbelegt, lokal ODER vollständiger OFF-Treffer,
   * bereits in den Sitzungs-Cache eingefügt), `'prefill-create'`
   * (Step A2 vorbelegt, OFF unvollständig — Nährwerte bleiben leer),
   * `'not-found'` oder `'api-error'` (Fehlertext, kein Treffer bzw.
   * Netzwerk-/API-Fehler unterschieden, Akzeptanz).
   */
  async handleScanDetected(barcode: string): Promise<void> {
    if (this.scanPhaseState() === 'looking-up') return;

    this.lastScannedBarcodeState.set(barcode);
    this.scanErrorMessageState.set(null);
    this.scanPhaseState.set('looking-up');

    const result = await this.foodSearchService.lookupBarcode(barcode);

    switch (result.status) {
      case 'found':
      case 'off-complete':
        this.insertIntoCacheIfMissing(result.food);
        this.entryOriginState.set('scan');
        this.stepBFoodState.set(result.food);
        this.amountInputState.set(resolveDefaultAmount(result.food));
        this.scanPhaseState.set('resolved');
        break;
      case 'off-incomplete':
        this.createErrorState.set(null);
        this.createFormState.set(result.prefill);
        this.scanPhaseState.set('prefill-create');
        break;
      case 'not-found':
        this.scanPhaseState.set('not-found');
        break;
      case 'error':
        this.scanErrorMessageState.set(result.message);
        this.scanPhaseState.set('api-error');
        break;
    }
  }

  /**
   * „Manuell anlegen" aus einem Scan-Fehlerzustand (kein Treffer/API-/
   * Kamera-Fehler): bereitet Step A2 leer vor, mit dem gescannten Barcode
   * vorbelegt (falls vorhanden — bei einem Kamera-Fehler wurde noch kein
   * Code erkannt).
   */
  goToManualCreateFromScan(): void {
    const barcode = this.lastScannedBarcodeState();
    this.createErrorState.set(null);
    this.createFormState.set({ ...emptyCreateForm(), barcode: barcode ?? '' });
  }

  /**
   * „Nächsten Barcode scannen" nach einer gespeicherten Erfolgsansicht
   * (Serien-Erfassung, design-conventions.md „Erfolgsrückmeldung mit
   * primärer + sekundärer Folgeaktion"). Setzt den Step-B-Entwurf zurück,
   * lässt `mealTypeState`/`entryDateState` aber ausdrücklich UNBERÜHRT —
   * die zuletzt gewählte Mahlzeit bleibt für den nächsten Scan-Durchlauf
   * erhalten (Akzeptanz „Serien-Erfassung mit erhaltener Mahlzeit").
   */
  resetForNextScan(): void {
    this.stepBFoodState.set(null);
    this.amountInputState.set('');
    this.entryIdState.set(null);
    this.stepBSaveErrorState.set(null);
    this.stepBSavingState.set(false);
    this.lastSavedSummaryState.set(null);
    this.beginScanSession();
  }

  private insertIntoCacheIfMissing(food: Food): void {
    if (this.coreFoodsService.foods().some((existing) => existing.id === food.id)) return;
    this.coreFoodsService.upsertFood(food);
  }

  private async loadSavedMeals(): Promise<void> {
    this.savedMealsLoadingState.set(true);
    this.savedMealsLoadErrorState.set(null);

    const result = await this.coreMealsService.loadMeals();

    this.savedMealsLoadingState.set(false);

    if (!result.success) {
      this.savedMealsLoadErrorState.set(result.message);
      return;
    }

    this.savedMealsState.set(result.meals);
    this.savedMealsLoadedState.set(true);
  }
}
