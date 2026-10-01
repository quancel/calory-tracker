import { Injectable, computed, inject, signal } from '@angular/core';
import { EntriesService } from '../core/entries.service';
import { RECENT_FOODS_LIMIT } from '../core/food-search.constants';
import {
  selectRecentFoods,
  validateAmountField,
  validateNameField,
} from '../core/foods.calculations';
import { CoreFoodsService, type Food } from '../core/foods.service';
import { createHybridFoodSearch } from '../core/hybrid-food-search';
import { CoreMealsService, type Meal } from '../core/meals.service';
import { computeMealTotals, sortMealsByName } from '../core/meals.calculations';
import { MealsService } from './meals.service';

/** Eine Positionszeile im Entwurf (M1) — trägt die Anzeige-Nährwerte des Foods, damit M1 ohne erneute Katalogabfrage rendert. */
export interface DraftMealItem {
  foodId: string;
  amountG: number;
  foodName: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
}

/** M3 kann entweder eine neue Position anhängen (`index === null`, „Hinzufügen") oder die Menge einer bestehenden Position ändern (`index` gesetzt, „Übernehmen" — Nutzerentscheidung 2026-09-21, M2 wird dabei übersprungen). */
export type AmountEditMode = { kind: 'add' } | { kind: 'change'; index: number };

/**
 * Einzige Zustandsquelle von `meals` (Verwaltungsansicht + Mahlzeit-Sheet
 * M1/M2/M3, ADR-0012). Lesepfad der Mahlzeitenliste über
 * `CoreMealsService`, Food-Auswahl in M2 über `CoreFoodsService` und die
 * gemeinsame Hybrid-Suche `createHybridFoodSearch()` (alle `core/`, kein
 * Import aus `food-catalog`). Schreiben ausschließlich über
 * `MealsService` (dieses Feature).
 *
 * Der Sheet-Entwurf (Name, Positionen) ist reiner Client-State, der erst
 * mit „Speichern" (M1) persistiert wird — Entfernen/Ändern einer Position
 * im Entwurf ist keine bestätigungspflichtige Aktion
 * (design-conventions.md „Mahlzeit-Sheet").
 */
@Injectable({ providedIn: 'root' })
export class MealsStore {
  private readonly coreMealsService = inject(CoreMealsService);
  private readonly coreFoodsService = inject(CoreFoodsService);
  private readonly entriesService = inject(EntriesService);
  private readonly mealsService = inject(MealsService);

  // --- Verwaltungsliste ---
  private readonly mealsState = signal<Meal[]>([]);
  private readonly listLoadedState = signal(false);
  private readonly listLoadingState = signal(false);
  private readonly listLoadErrorState = signal<string | null>(null);

  readonly listLoading = this.listLoadingState.asReadonly();
  readonly listLoadError = this.listLoadErrorState.asReadonly();
  readonly listLoaded = this.listLoadedState.asReadonly();

  /** Sortiert wie der Log-Tab (dieselbe Funktion, ADR-0012 Punkt 4) — je Mahlzeit zusätzlich die kcal-Summe für die Zeilendarstellung. */
  readonly meals = computed(() =>
    sortMealsByName(this.mealsState()).map((meal) => ({
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

  // --- M1: Entwurf ---
  private readonly draftMealIdState = signal<string | null>(null);
  private readonly draftNameState = signal('');
  private readonly draftItemsState = signal<DraftMealItem[]>([]);
  private readonly draftSavingState = signal(false);
  private readonly draftSaveErrorState = signal<string | null>(null);
  private readonly draftDeletingState = signal(false);
  private readonly draftDeleteErrorState = signal<string | null>(null);

  readonly draftMealId = this.draftMealIdState.asReadonly();
  readonly isEditingMeal = computed(() => this.draftMealIdState() !== null);
  readonly draftName = this.draftNameState.asReadonly();
  readonly draftItems = this.draftItemsState.asReadonly();
  readonly draftSaving = this.draftSavingState.asReadonly();
  readonly draftSaveError = this.draftSaveErrorState.asReadonly();
  readonly draftDeleting = this.draftDeletingState.asReadonly();
  readonly draftDeleteError = this.draftDeleteErrorState.asReadonly();

  readonly nameValidation = computed(() => validateNameField(this.draftNameState()));
  /** Speichern-Button (M1) gesperrt bei leerem Namen oder leerer Positionsliste (ADR-0012 Punkt 8, deckt „Mahlzeit ohne Positionen" bereits auf Anlage-Ebene ab). */
  readonly canSaveMeal = computed(
    () =>
      this.nameValidation().valid &&
      this.draftItemsState().length > 0 &&
      !this.draftSavingState(),
  );

  // --- M2: Food-Suche (nur bestehende Foods, kein Anlegen/Scan — Nutzerentscheidung 2026-09-21) ---
  // Hybrid wie Step A (ADR-0021 Punkt 10); bei LEERER Suche „Zuletzt verwendet"
  // (Nutzerentscheidung 2026-09-30), nicht der ganze lokale Bestand.
  private readonly m2Search = createHybridFoodSearch();
  private readonly m2RecentFoodIdsState = signal<string[]>([]);

  readonly m2Query = this.m2Search.query;
  /** `true` bei leerer Suche: dann zeigt `m2Results` die „Zuletzt verwendet"-Liste. */
  readonly m2ShowingRecent = computed(() => this.m2Search.query().trim() === '');
  readonly m2Results = computed(() => {
    if (this.m2ShowingRecent()) {
      return selectRecentFoods(this.coreFoodsService.foods(), this.m2RecentFoodIdsState());
    }
    return this.m2Search.results();
  });
  /** Anzahl lokaler Zeilen in `m2Results` — Zeilen ab diesem Index sind Server-Treffer. */
  readonly m2LocalResultCount = computed(() => this.m2Search.localResults().length);
  readonly m2SearchStatus = this.m2Search.status;
  readonly m2SearchStatusReserved = this.m2Search.statusReserved;
  readonly m2SearchAnnouncement = this.m2Search.announcement;
  /** Leerzustand von M2 (nur die Zeile, kein Anlegen-Button): `null`, solange Zeilen da sind oder die Serversuche läuft. */
  readonly m2EmptyState = this.m2Search.emptyState;
  /** Bei leerer Suche und leerer „Zuletzt verwendet"-Liste: nicht-alarmierender Hinweis wie in Step A. */
  readonly m2ShowNoRecent = computed(
    () =>
      !this.coreFoodsService.initialLoading() &&
      this.m2ShowingRecent() &&
      this.m2Results().length === 0,
  );
  /** Skeleton: 2 Zeilen beim ersten Laden ohne lokalen Bestand bzw. bei laufender Serversuche ohne lokalen Treffer. */
  readonly m2SkeletonRows = computed(() => {
    if (this.coreFoodsService.initialLoading() && this.m2Results().length === 0) return 2;
    if (
      !this.m2ShowingRecent() &&
      this.m2Search.serverPhase() === 'pending' &&
      this.m2Results().length === 0
    ) {
      return 2;
    }
    return 0;
  });

  // --- M3: Menge (Hinzufügen oder Ändern) ---
  private readonly m3FoodState = signal<Food | null>(null);
  private readonly m3AmountInputState = signal('');
  private readonly m3ModeState = signal<AmountEditMode>({ kind: 'add' });

  readonly m3Food = this.m3FoodState.asReadonly();
  readonly m3AmountInput = this.m3AmountInputState.asReadonly();
  readonly m3Mode = this.m3ModeState.asReadonly();
  /** M3 im Ändern-Modus: CTA „Übernehmen" statt „Hinzufügen" (design-conventions.md). */
  readonly isChangeMode = computed(() => this.m3ModeState().kind === 'change');

  readonly m3AmountValidation = computed(() => validateAmountField(this.m3AmountInputState()));
  readonly canConfirmAmount = computed(() => this.m3AmountValidation().valid);

  async ensureListLoaded(): Promise<void> {
    if (this.listLoadedState() || this.listLoadingState()) return;
    await this.loadList();
  }

  async retryListLoad(): Promise<void> {
    await this.loadList();
  }

  /** Baut den lokalen Bestand auf (einmal je Sitzung) und lädt die „Zuletzt verwendet"-Liste neu (bei jedem Öffnen, wie in Step A). */
  async ensureFoodsLoaded(): Promise<void> {
    await Promise.all([this.coreFoodsService.ensureLoaded(), this.loadRecentFoodIds()]);
  }

  /** „Erneut versuchen" der Statuszeile in M2. */
  async retryM2Search(): Promise<void> {
    await this.m2Search.retry();
  }

  private async loadRecentFoodIds(): Promise<void> {
    const ids = await this.entriesService.loadRecentFoodIds(RECENT_FOODS_LIMIT);
    this.m2RecentFoodIdsState.set(ids);
  }

  /** Bereitet M1 für „neu anlegen" vor (leer). */
  beginNewMeal(): void {
    this.draftMealIdState.set(null);
    this.draftNameState.set('');
    this.draftItemsState.set([]);
    this.draftSaveErrorState.set(null);
    this.draftSavingState.set(false);
    this.draftDeleteErrorState.set(null);
    this.draftDeletingState.set(false);
  }

  /** Bereitet M1 für „bearbeiten" vor — Name/Positionen aus der bereits geladenen Mahlzeit vorbelegt. `false`, wenn die Mahlzeit nicht gefunden wird (defensiver Guard). */
  beginEditMeal(mealId: string): boolean {
    const meal = this.mealsState().find((m) => m.id === mealId);
    if (!meal) return false;

    this.draftMealIdState.set(meal.id);
    this.draftNameState.set(meal.name);
    this.draftItemsState.set(
      meal.items.map((item) => ({
        foodId: item.food.id,
        amountG: item.amountG,
        foodName: item.food.name,
        kcal100g: item.food.kcal100g,
        proteinG100g: item.food.proteinG100g,
        carbsG100g: item.food.carbsG100g,
        fatG100g: item.food.fatG100g,
      })),
    );
    this.draftSaveErrorState.set(null);
    this.draftSavingState.set(false);
    this.draftDeleteErrorState.set(null);
    this.draftDeletingState.set(false);
    return true;
  }

  setDraftName(value: string): void {
    this.draftNameState.set(value);
  }

  /** Entfernt eine Position aus dem Entwurf — reine Entwurfs-Bearbeitung, kein Bestätigungsdialog (design-conventions.md). */
  removeDraftItem(index: number): void {
    this.draftItemsState.update((items) => items.filter((_, i) => i !== index));
  }

  setM2Query(value: string): void {
    this.m2Search.setQuery(value);
  }

  /** „Food hinzufügen" → M2 → M3 im Hinzufügen-Modus. */
  beginAddItem(): void {
    this.m2Search.setQuery('');
    this.m3ModeState.set({ kind: 'add' });
    this.m3FoodState.set(null);
    this.m3AmountInputState.set('');
  }

  /** Tap auf eine M2-Trefferzeile: übernimmt das Food (auch einen Server-Treffer) in den lokalen Bestand, belegt die Menge mit `defaultPortionG`/100 vor. */
  selectM2Food(food: Food): void {
    this.coreFoodsService.upsertFood(food);
    this.m3FoodState.set(food);
    this.m3AmountInputState.set(food.defaultPortionG !== null ? `${food.defaultPortionG}` : '100');
  }

  /**
   * Tap auf eine bestehende Positionszeile in M1 (Nutzerentscheidung
   * 2026-09-21, ABWEICHEND von „nur entfernen"): öffnet M3 direkt im
   * Ändern-Modus, vorbelegt mit der hinterlegten Menge dieser Position —
   * M2 wird übersprungen, das Food ist nicht wechselbar.
   */
  beginChangeItem(index: number): void {
    const item = this.draftItemsState()[index];
    if (!item) return;

    this.m3ModeState.set({ kind: 'change', index });
    this.m3FoodState.set({
      id: item.foodId,
      name: item.foodName,
      kcal100g: item.kcal100g,
      proteinG100g: item.proteinG100g,
      carbsG100g: item.carbsG100g,
      fatG100g: item.fatG100g,
      defaultPortionG: null,
      source: 'manual',
      barcode: null,
      isCorrected: false,
      offPopularity: 0,
    });
    this.m3AmountInputState.set(`${item.amountG}`);
  }

  setM3AmountInput(value: string): void {
    this.m3AmountInputState.set(value);
  }

  /**
   * CTA „Hinzufügen"/„Übernehmen" in M3: schreibt nur in den Entwurf,
   * persistiert nichts (design-conventions.md). `false` bei ungültiger
   * Menge/fehlendem Food (defensiver Guard, CTA ist ohnehin disabled).
   */
  confirmAmount(): boolean {
    const validation = this.m3AmountValidation();
    const food = this.m3FoodState();
    if (!validation.valid || food === null) return false;

    const draftItem: DraftMealItem = {
      foodId: food.id,
      amountG: validation.value,
      foodName: food.name,
      kcal100g: food.kcal100g,
      proteinG100g: food.proteinG100g,
      carbsG100g: food.carbsG100g,
      fatG100g: food.fatG100g,
    };

    const mode = this.m3ModeState();
    if (mode.kind === 'add') {
      this.draftItemsState.update((items) => [...items, draftItem]);
    } else {
      this.draftItemsState.update((items) =>
        items.map((existing, i) => (i === mode.index ? draftItem : existing)),
      );
    }
    return true;
  }

  /** Speichert M1 (anlegen oder ändern). `false` bei defensivem Guard (Button ist ohnehin disabled) oder Server-Fehler. */
  async saveMeal(): Promise<boolean> {
    if (!this.canSaveMeal()) return false;

    this.draftSavingState.set(true);
    this.draftSaveErrorState.set(null);

    const nameValidation = this.nameValidation();
    const input = {
      name: nameValidation.valid ? nameValidation.value : '',
      items: this.draftItemsState().map((item) => ({ foodId: item.foodId, amountG: item.amountG })),
    };

    const mealId = this.draftMealIdState();
    const result = mealId
      ? await this.mealsService.updateMeal(mealId, input)
      : await this.mealsService.createMeal(input);

    this.draftSavingState.set(false);

    if (!result.success) {
      this.draftSaveErrorState.set(result.message);
      return false;
    }

    await this.loadList();
    return true;
  }

  /** Löscht die aktuell im Entwurf geladene Mahlzeit (nach Bestätigung im projektweiten Dialog). `false` ohne geladene Mahlzeit (Neu-anlegen-Flow) oder bei Server-Fehler. */
  async deleteMeal(): Promise<boolean> {
    const mealId = this.draftMealIdState();
    if (mealId === null || this.draftDeletingState()) return false;

    this.draftDeletingState.set(true);
    this.draftDeleteErrorState.set(null);

    const result = await this.mealsService.deleteMeal(mealId);

    this.draftDeletingState.set(false);

    if (!result.success) {
      this.draftDeleteErrorState.set(result.message);
      return false;
    }

    await this.loadList();
    return true;
  }

  private async loadList(): Promise<void> {
    this.listLoadingState.set(true);
    this.listLoadErrorState.set(null);

    const result = await this.coreMealsService.loadMeals();

    this.listLoadingState.set(false);

    if (!result.success) {
      this.listLoadErrorState.set(result.message);
      return;
    }

    this.mealsState.set(result.meals);
    this.listLoadedState.set(true);
  }
}
