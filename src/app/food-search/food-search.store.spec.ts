import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntriesService } from '../core/entries.service';
import { CoreFoodsService, type Food } from '../core/foods.service';
import { CoreMealsService, type Meal } from '../core/meals.service';
import { FoodSearchService } from './food-search.service';
import { FoodSearchStore } from './food-search.store';

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 'f1',
    name: 'Apfel',
    kcal100g: 52,
    proteinG100g: 0.3,
    carbsG100g: 14,
    fatG100g: 0.2,
    defaultPortionG: 150,
    source: 'manual',
    barcode: null,
    isCorrected: false,
    ...overrides,
  };
}

/**
 * Seit Paket 010 (ADR-0012 Punkt 1) liegt der Katalog-Lesepfad/-Cache in
 * `CoreFoodsService`, nicht mehr in `FoodSearchService`/`FoodSearchStore`
 * selbst. Dieser Fake bildet exakt das bisherige Cache-Verhalten
 * (`ensureLoaded` lädt genau einmal je Sitzung, `retryLoad` erzwingt einen
 * erneuten Versuch, `upsertFood` fügt an/aktualisiert in place) über die
 * `search`-Mock-Funktion ab — die Test-Assertions auf `search` bleiben
 * dadurch inhaltlich unverändert (nur die Quelle der Aufrufe verschiebt
 * sich strukturell von `FoodSearchService` zu `CoreFoodsService`).
 */
type SearchFn = (
  query: string,
) => Promise<{ success: true; foods: Food[] } | { success: false; message: string }>;

function makeCoreFoodsServiceFake(search: SearchFn) {
  const foodsState = signal<Food[]>([]);
  const loadedState = signal(false);
  const loadingState = signal(false);
  const loadErrorState = signal<string | null>(null);

  async function load(): Promise<void> {
    loadingState.set(true);
    loadErrorState.set(null);

    const result = await search('');

    loadingState.set(false);

    if (!result.success) {
      loadErrorState.set(result.message);
      return;
    }

    foodsState.set(result.foods);
    loadedState.set(true);
  }

  return {
    foods: foodsState.asReadonly(),
    loading: loadingState.asReadonly(),
    loadError: loadErrorState.asReadonly(),
    loaded: loadedState.asReadonly(),
    async ensureLoaded(): Promise<void> {
      if (loadedState() || loadingState()) return;
      await load();
    },
    async retryLoad(): Promise<void> {
      await load();
    },
    upsertFood(food: Food): void {
      foodsState.update((current) => {
        const index = current.findIndex((existing) => existing.id === food.id);
        if (index === -1) return [...current, food];
        const next = [...current];
        next[index] = food;
        return next;
      });
    },
  };
}

describe('FoodSearchStore', () => {
  let search: ReturnType<typeof vi.fn>;
  let createFood: ReturnType<typeof vi.fn>;
  let lookupBarcode: ReturnType<typeof vi.fn>;
  let updateFood: ReturnType<typeof vi.fn>;
  let loadEntry: ReturnType<typeof vi.fn>;
  let createEntry: ReturnType<typeof vi.fn>;
  let createEntries: ReturnType<typeof vi.fn>;
  let updateEntry: ReturnType<typeof vi.fn>;
  let deleteEntry: ReturnType<typeof vi.fn>;
  let loadRecentFoodIds: ReturnType<typeof vi.fn>;
  let loadMeals: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    search = vi.fn().mockResolvedValue({ success: true, foods: [] });
    createFood = vi.fn().mockResolvedValue({ success: false, message: 'nicht konfiguriert' });
    lookupBarcode = vi.fn().mockResolvedValue({ status: 'not-found' });
    updateFood = vi.fn().mockResolvedValue({ success: false, message: 'nicht konfiguriert' });
    loadEntry = vi.fn().mockResolvedValue({ success: false, message: 'nicht konfiguriert' });
    createEntry = vi.fn().mockResolvedValue({ success: true });
    createEntries = vi.fn().mockResolvedValue({ success: true });
    updateEntry = vi.fn().mockResolvedValue({ success: true });
    deleteEntry = vi.fn().mockResolvedValue({ success: true });
    loadRecentFoodIds = vi.fn().mockResolvedValue([]);
    loadMeals = vi.fn().mockResolvedValue({ success: true, meals: [] });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: FoodSearchService, useValue: { createFood, lookupBarcode, updateFood } },
        {
          provide: CoreFoodsService,
          useFactory: () => makeCoreFoodsServiceFake(search as unknown as SearchFn),
        },
        {
          provide: EntriesService,
          useValue: {
            loadEntry,
            createEntry,
            createEntries,
            updateEntry,
            deleteEntry,
            loadRecentFoodIds,
          },
        },
        { provide: CoreMealsService, useValue: { loadMeals } },
      ],
    });
  });

  describe('ensureLoaded (Sitzungs-Cache, ADR-0008 Punkt 3)', () => {
    it('loads the food list on the first call', async () => {
      search.mockResolvedValue({ success: true, foods: [makeFood()] });
      const store = TestBed.inject(FoodSearchStore);

      await store.ensureLoaded();

      expect(search).toHaveBeenCalledTimes(1);
      store.setQuery('Apfel');
      expect(store.results()).toHaveLength(1);
      expect(store.loading()).toBe(false);
      expect(store.loadError()).toBeNull();
    });

    it('does NOT reload on a second call within the same session', async () => {
      const store = TestBed.inject(FoodSearchStore);

      await store.ensureLoaded();
      await store.ensureLoaded();
      await store.ensureLoaded();

      expect(search).toHaveBeenCalledTimes(1);
    });

    it('sets a load error and does not mark the session as loaded on failure', async () => {
      search.mockResolvedValue({ success: false, message: 'Foods konnten nicht geladen werden.' });
      const store = TestBed.inject(FoodSearchStore);

      await store.ensureLoaded();

      expect(store.loadError()).toBe('Foods konnten nicht geladen werden.');

      // A failed load does not count as "loaded" — retryLoad tries again.
      search.mockResolvedValue({ success: true, foods: [makeFood()] });
      await store.retryLoad();

      expect(search).toHaveBeenCalledTimes(2);
      expect(store.loadError()).toBeNull();
      store.setQuery('Apfel');
      expect(store.results()).toHaveLength(1);
    });
  });

  describe('results / query (In-Memory-Filterung, kein ilike je Tastendruck)', () => {
    it('filters the cached list without calling the service again', async () => {
      search.mockResolvedValue({
        success: true,
        foods: [makeFood({ id: '1', name: 'Apfel' }), makeFood({ id: '2', name: 'Banane' })],
      });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();

      store.setQuery('apf');

      expect(store.results().map((f) => f.id)).toEqual(['1']);
      expect(search).toHaveBeenCalledTimes(1);
    });
  });

  describe('Zuletzt verwendet (max. 10, leere Suche)', () => {
    it('shows the recently used foods, in order, when the query is empty', async () => {
      search.mockResolvedValue({
        success: true,
        foods: [
          makeFood({ id: '1', name: 'Apfel' }),
          makeFood({ id: '2', name: 'Banane' }),
          makeFood({ id: '3', name: 'Curry' }),
        ],
      });
      loadRecentFoodIds.mockResolvedValue(['3', '1']);
      const store = TestBed.inject(FoodSearchStore);

      await store.ensureLoaded();

      expect(loadRecentFoodIds).toHaveBeenCalledWith(10);
      expect(store.isShowingRecent()).toBe(true);
      expect(store.results().map((f) => f.id)).toEqual(['3', '1']);
      expect(store.showNoRecentState()).toBe(false);
    });

    it('shows the no-recent hint when there is no recent-use history yet', async () => {
      search.mockResolvedValue({ success: true, foods: [makeFood()] });
      loadRecentFoodIds.mockResolvedValue([]);
      const store = TestBed.inject(FoodSearchStore);

      await store.ensureLoaded();

      expect(store.isShowingRecent()).toBe(true);
      expect(store.results()).toHaveLength(0);
      expect(store.showNoRecentState()).toBe(true);
    });

    it('switches to full-catalog search results once a query is entered', async () => {
      search.mockResolvedValue({
        success: true,
        foods: [makeFood({ id: '1', name: 'Apfel' }), makeFood({ id: '2', name: 'Banane' })],
      });
      loadRecentFoodIds.mockResolvedValue(['1']);
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();

      store.setQuery('ban');

      expect(store.isShowingRecent()).toBe(false);
      expect(store.results().map((f) => f.id)).toEqual(['2']);
      expect(store.showNoRecentState()).toBe(false);
    });
  });

  describe('showEmptyState', () => {
    it('is false while there is no query, even if the catalog is empty', async () => {
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();

      expect(store.showEmptyState()).toBe(false);
    });

    it('is true for a non-empty query with no matches', async () => {
      search.mockResolvedValue({ success: true, foods: [makeFood({ name: 'Apfel' })] });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();

      store.setQuery('Kiwi');

      expect(store.showEmptyState()).toBe(true);
    });

    it('is false once a match exists for the query', async () => {
      search.mockResolvedValue({ success: true, foods: [makeFood({ name: 'Apfel' })] });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();

      store.setQuery('Apf');

      expect(store.showEmptyState()).toBe(false);
    });
  });

  describe('beginCreate', () => {
    it('prefills the name with the current query, clears the other fields', async () => {
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.setQuery('  Kiwi  ');

      store.beginCreate();

      expect(store.createForm()).toEqual({
        name: 'Kiwi',
        kcal100g: '',
        proteinG100g: '',
        carbsG100g: '',
        fatG100g: '',
        defaultPortionG: '',
        barcode: '',
      });
    });
  });

  describe('canCreate / createFood', () => {
    function fillValidForm(store: FoodSearchStore): void {
      store.setCreateField('name', 'Kiwi');
      store.setCreateField('kcal100g', '61');
      store.setCreateField('proteinG100g', '1.1');
      store.setCreateField('carbsG100g', '15');
      store.setCreateField('fatG100g', '0.5');
    }

    it('canCreate is false while the form is incomplete', async () => {
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCreate();

      expect(store.canCreate()).toBe(false);
    });

    it('canCreate is true once all required fields are valid, optional portion stays empty', async () => {
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCreate();
      fillValidForm(store);

      expect(store.canCreate()).toBe(true);
    });

    it('createFood inserts the food and appends it to the session cache instead of reloading', async () => {
      const created = makeFood({ id: 'new-1', name: 'Kiwi' });
      createFood.mockResolvedValue({ success: true, food: created });

      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCreate();
      fillValidForm(store);

      const result = await store.createFood();

      expect(result).toEqual(created);
      expect(createFood).toHaveBeenCalledWith({
        name: 'Kiwi',
        kcal100g: 61,
        proteinG100g: 1.1,
        carbsG100g: 15,
        fatG100g: 0.5,
        defaultPortionG: null,
        barcode: null,
      });
      expect(search).toHaveBeenCalledTimes(1);
      store.setQuery('Kiwi');
      expect(store.results().some((f) => f.id === 'new-1')).toBe(true);
    });

    it('createFood does nothing for an invalid form (defensive guard)', async () => {
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCreate();

      const result = await store.createFood();

      expect(result).toBeNull();
      expect(createFood).not.toHaveBeenCalled();
    });

    it('createFood sets an error message and does not touch the cache on failure', async () => {
      createFood.mockResolvedValue({
        success: false,
        message: 'Food konnte nicht angelegt werden.',
      });

      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCreate();
      fillValidForm(store);

      const result = await store.createFood();

      expect(result).toBeNull();
      expect(store.createErrorMessage()).toBe('Food konnte nicht angelegt werden.');
      expect(store.results()).toHaveLength(0);
    });
  });

  describe('beginCorrect / setCorrectField / submitCorrect / correctFindings (Step C, ADR-0011 Punkt 6)', () => {
    it('beginCorrect prefills the form from the session cache and returns true', async () => {
      const food = makeFood({
        id: 'f9',
        name: 'Apfel',
        kcal100g: 52,
        proteinG100g: 0.3,
        carbsG100g: 14,
        fatG100g: 0.2,
        defaultPortionG: 150,
        barcode: '123',
      });
      search.mockResolvedValue({ success: true, foods: [food] });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();

      const opened = store.beginCorrect('f9');

      expect(opened).toBe(true);
      expect(store.correctForm()).toEqual({
        name: 'Apfel',
        kcal100g: '52',
        proteinG100g: '0.3',
        carbsG100g: '14',
        fatG100g: '0.2',
        defaultPortionG: '150',
        barcode: '123',
      });
    });

    it('beginCorrect falls back to the active Step-B draft when the food is not yet in the cache (defaultPortionG/barcode unknown)', async () => {
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded(); // leerer Cache
      store.selectFood(makeFood({ id: 'f10', name: 'Birne', defaultPortionG: 200, barcode: '999' }));

      const opened = store.beginCorrect('f10');

      expect(opened).toBe(true);
      expect(store.correctForm().name).toBe('Birne');
      expect(store.correctForm().defaultPortionG).toBe('');
      expect(store.correctForm().barcode).toBe('');
    });

    it('beginCorrect returns false when the food is not found anywhere (defensive guard)', async () => {
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();

      expect(store.beginCorrect('unknown')).toBe(false);
    });

    it('correctFindings reflects the currently edited (unsaved) form values live', async () => {
      const food = makeFood({ id: 'f11', kcal100g: 200, proteinG100g: 50, carbsG100g: 0, fatG100g: 0 });
      search.mockResolvedValue({ success: true, foods: [food] });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCorrect('f11');

      expect(store.correctFindings()).toEqual([]);

      store.setCorrectField('carbsG100g', '60'); // Makrosumme jetzt 110g/100g

      expect(store.correctFindings()).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'macro-sum-exceeded' })]),
      );
    });

    it('submitCorrect writes via FoodSearchService.updateFood, updates the cache in place (no reload)', async () => {
      const original = makeFood({ id: 'f12', name: 'Apfel', kcal100g: 52 });
      search.mockResolvedValue({ success: true, foods: [original] });
      const corrected = makeFood({ id: 'f12', name: 'Apfel', kcal100g: 55, isCorrected: true });
      updateFood.mockResolvedValue({ success: true, food: corrected });

      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCorrect('f12');
      store.setCorrectField('kcal100g', '55');

      const result = await store.submitCorrect();

      expect(result).toEqual(corrected);
      expect(updateFood).toHaveBeenCalledWith(
        'f12',
        expect.objectContaining({ name: 'Apfel', kcal100g: 55 }),
      );
      expect(search).toHaveBeenCalledTimes(1); // kein Neuladen
      store.setQuery('Apfel');
      expect(store.results().find((f) => f.id === 'f12')).toEqual(corrected);
    });

    it('submitCorrect also updates an active Step-B draft of the same food in place', async () => {
      const original = makeFood({ id: 'f13', name: 'Apfel', kcal100g: 52 });
      search.mockResolvedValue({ success: true, foods: [original] });
      const corrected = makeFood({ id: 'f13', name: 'Apfel', kcal100g: 55, isCorrected: true });
      updateFood.mockResolvedValue({ success: true, food: corrected });

      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.selectFood(original);
      store.beginCorrect('f13');
      store.setCorrectField('kcal100g', '55');

      await store.submitCorrect();

      expect(store.stepBFood()?.kcal100g).toBe(55);
    });

    it('submitCorrect sets an error message and does NOT touch the cache on failure', async () => {
      const original = makeFood({ id: 'f14', name: 'Apfel', kcal100g: 52 });
      search.mockResolvedValue({ success: true, foods: [original] });
      updateFood.mockResolvedValue({
        success: false,
        message: 'Food konnte nicht aktualisiert werden.',
      });

      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCorrect('f14');
      store.setCorrectField('kcal100g', '55');

      const result = await store.submitCorrect();

      expect(result).toBeNull();
      expect(store.correctErrorMessage()).toBe('Food konnte nicht aktualisiert werden.');
      store.setQuery('Apfel');
      expect(store.results().find((f) => f.id === 'f14')).toEqual(original);
    });

    it('submitCorrect does nothing for an invalid form (defensive guard)', async () => {
      const food = makeFood({ id: 'f15' });
      search.mockResolvedValue({ success: true, foods: [food] });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginCorrect('f15');
      store.setCorrectField('kcal100g', ''); // macht das Formular ungültig

      const result = await store.submitCorrect();

      expect(result).toBeNull();
      expect(updateFood).not.toHaveBeenCalled();
    });
  });

  describe('beginEntrySession (ADR-0009 Punkt 9)', () => {
    it('resets Step-B state and adopts date/mealType, without touching the food session cache', async () => {
      search.mockResolvedValue({ success: true, foods: [makeFood()] });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.selectFood(makeFood());

      store.beginEntrySession('2026-09-22', 'lunch');

      expect(store.stepBFood()).toBeNull();
      expect(store.amountInput()).toBe('');
      expect(store.mealType()).toBe('lunch');
      expect(store.entryId()).toBeNull();
      expect(store.isEditing()).toBe(false);
      store.setQuery('Apfel');
      expect(store.results()).toHaveLength(1); // Food-Cache unberührt
    });
  });

  describe('selectFood (Step A → Step B)', () => {
    it('adopts the food and prefills the amount with defaultPortionG', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      store.selectFood(makeFood({ defaultPortionG: 150 }));

      expect(store.stepBFood()?.id).toBe('f1');
      expect(store.amountInput()).toBe('150');
    });

    it('falls back to 100 when defaultPortionG is null', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      store.selectFood(makeFood({ defaultPortionG: null }));

      expect(store.amountInput()).toBe('100');
    });
  });

  describe('amountValidation / canSaveEntry / liveNutrition', () => {
    it('rejects empty/0/negative/non-numeric amounts, no upper bound', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      store.selectFood(makeFood());

      store.setAmountInput('');
      expect(store.canSaveEntry()).toBe(false);
      store.setAmountInput('0');
      expect(store.canSaveEntry()).toBe(false);
      store.setAmountInput('-5');
      expect(store.canSaveEntry()).toBe(false);
      store.setAmountInput('abc');
      expect(store.canSaveEntry()).toBe(false);
      store.setAmountInput('100000');
      expect(store.canSaveEntry()).toBe(true);
    });

    it('computes live nutrition scaled by the entered amount, null while invalid', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      store.selectFood(
        makeFood({ kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 }),
      );

      store.setAmountInput('200');
      expect(store.liveNutrition()).toEqual({ kcal: 104, proteinG: 0.6, carbsG: 28, fatG: 0.4 });

      store.setAmountInput('');
      expect(store.liveNutrition()).toBeNull();
    });
  });

  describe('setMealType', () => {
    it('is changeable at any time (Mahlzeit-Chip-Reihe)', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      store.setMealType('dinner');

      expect(store.mealType()).toBe('dinner');
    });
  });

  describe('loadEntryForEdit (ADR-0009 Punkt 5)', () => {
    it('adopts food/amount/mealType/entryId from the loaded entry on success', async () => {
      loadEntry.mockResolvedValue({
        success: true,
        entry: {
          id: 'e1',
          date: '2026-09-20',
          mealType: 'lunch',
          amountG: 175,
          food: {
            id: 'f1',
            name: 'Apfel',
            kcal100g: 52,
            proteinG100g: 0.3,
            carbsG100g: 14,
            fatG100g: 0.2,
            source: 'manual' as const,
          },
        },
      });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      const ok = await store.loadEntryForEdit('e1');

      expect(ok).toBe(true);
      expect(loadEntry).toHaveBeenCalledWith('e1');
      expect(store.entryId()).toBe('e1');
      expect(store.isEditing()).toBe(true);
      expect(store.mealType()).toBe('lunch');
      expect(store.amountInput()).toBe('175');
      expect(store.stepBFood()?.name).toBe('Apfel');
    });

    it('sets stepBLoadError and returns false on failure', async () => {
      loadEntry.mockResolvedValue({
        success: false,
        message: 'Eintrag konnte nicht geladen werden.',
      });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      const ok = await store.loadEntryForEdit('missing');

      expect(ok).toBe(false);
      expect(store.stepBLoadError()).toBe('Eintrag konnte nicht geladen werden.');
      expect(store.entryId()).toBeNull();
    });
  });

  describe('saveEntry', () => {
    it('creates a new entry with food_id/amount_g/meal_type/date, no computed values', async () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      store.selectFood(makeFood({ id: 'f1' }));
      store.setAmountInput('200');

      const ok = await store.saveEntry();

      expect(ok).toBe(true);
      expect(createEntry).toHaveBeenCalledWith({
        foodId: 'f1',
        amountG: 200,
        mealType: 'breakfast',
        date: '2026-09-21',
      });
      expect(updateEntry).not.toHaveBeenCalled();
    });

    it('updates the existing entry instead of creating one once entryId is set', async () => {
      loadEntry.mockResolvedValue({
        success: true,
        entry: {
          id: 'e1',
          date: '2026-09-20',
          mealType: 'lunch',
          amountG: 100,
          food: {
            id: 'f1',
            name: 'Apfel',
            kcal100g: 52,
            proteinG100g: 0.3,
            carbsG100g: 14,
            fatG100g: 0.2,
            source: 'manual' as const,
          },
        },
      });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      await store.loadEntryForEdit('e1');
      store.setAmountInput('250');
      store.setMealType('dinner');

      const ok = await store.saveEntry();

      expect(ok).toBe(true);
      expect(updateEntry).toHaveBeenCalledWith('e1', { amountG: 250, mealType: 'dinner' });
      expect(createEntry).not.toHaveBeenCalled();
    });

    it('is a defensive no-op for an invalid amount', async () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      store.selectFood(makeFood());
      store.setAmountInput('0');

      const ok = await store.saveEntry();

      expect(ok).toBe(false);
      expect(createEntry).not.toHaveBeenCalled();
    });

    it('sets stepBSaveError on failure', async () => {
      createEntry.mockResolvedValue({
        success: false,
        message: 'Eintrag konnte nicht gespeichert werden.',
      });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      store.selectFood(makeFood());
      store.setAmountInput('200');

      const ok = await store.saveEntry();

      expect(ok).toBe(false);
      expect(store.stepBSaveError()).toBe('Eintrag konnte nicht gespeichert werden.');
    });
  });

  describe('deleteEntry', () => {
    it('deletes the loaded entry', async () => {
      loadEntry.mockResolvedValue({
        success: true,
        entry: {
          id: 'e1',
          date: '2026-09-20',
          mealType: 'lunch',
          amountG: 100,
          food: {
            id: 'f1',
            name: 'Apfel',
            kcal100g: 52,
            proteinG100g: 0.3,
            carbsG100g: 14,
            fatG100g: 0.2,
            source: 'manual' as const,
          },
        },
      });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      await store.loadEntryForEdit('e1');

      const ok = await store.deleteEntry();

      expect(ok).toBe(true);
      expect(deleteEntry).toHaveBeenCalledWith('e1');
    });

    it('is a defensive no-op without a loaded entry (create flow)', async () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      store.selectFood(makeFood());

      const ok = await store.deleteEntry();

      expect(ok).toBe(false);
      expect(deleteEntry).not.toHaveBeenCalled();
    });

    it('sets stepBDeleteError on failure', async () => {
      loadEntry.mockResolvedValue({
        success: true,
        entry: {
          id: 'e1',
          date: '2026-09-20',
          mealType: 'lunch',
          amountG: 100,
          food: {
            id: 'f1',
            name: 'Apfel',
            kcal100g: 52,
            proteinG100g: 0.3,
            carbsG100g: 14,
            fatG100g: 0.2,
            source: 'manual' as const,
          },
        },
      });
      deleteEntry.mockResolvedValue({
        success: false,
        message: 'Eintrag konnte nicht gelöscht werden.',
      });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');
      await store.loadEntryForEdit('e1');

      const ok = await store.deleteEntry();

      expect(ok).toBe(false);
      expect(store.stepBDeleteError()).toBe('Eintrag konnte nicht gelöscht werden.');
    });
  });

  describe('handleScanDetected (ADR-0010 Punkt 4/5)', () => {
    it('adopts a local/OFF-complete hit into Step B, inserts it into the session cache, and sets entryOrigin "scan"', async () => {
      const found = makeFood({ id: 'off-1', name: 'Müsli', defaultPortionG: null, source: 'off' });
      lookupBarcode.mockResolvedValue({ status: 'found', food: found });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');

      await store.handleScanDetected('4008400123456');

      expect(lookupBarcode).toHaveBeenCalledWith('4008400123456');
      expect(store.scanPhase()).toBe('resolved');
      expect(store.stepBFood()?.id).toBe('off-1');
      expect(store.amountInput()).toBe('100');
      expect(store.entryOrigin()).toBe('scan');
      store.setQuery('Müsli');
      expect(store.results().some((f) => f.id === 'off-1')).toBe(true);
    });

    it('does not duplicate a hit that is already in the session cache', async () => {
      search.mockResolvedValue({ success: true, foods: [makeFood({ id: 'f1' })] });
      lookupBarcode.mockResolvedValue({ status: 'found', food: makeFood({ id: 'f1' }) });
      const store = TestBed.inject(FoodSearchStore);
      await store.ensureLoaded();
      store.beginEntrySession('2026-09-21', 'lunch');

      await store.handleScanDetected('123');

      store.setQuery('Apfel');
      expect(store.results().filter((f) => f.id === 'f1')).toHaveLength(1);
    });

    it('prefills Step A2 for an incomplete OFF hit — form is NOT persisted', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'off-incomplete',
        prefill: {
          name: 'Unvollständig',
          kcal100g: '250',
          proteinG100g: '',
          carbsG100g: '',
          fatG100g: '',
          defaultPortionG: '',
          barcode: '4008400123456',
        },
      });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');

      await store.handleScanDetected('4008400123456');

      expect(store.scanPhase()).toBe('prefill-create');
      expect(store.createForm()).toEqual({
        name: 'Unvollständig',
        kcal100g: '250',
        proteinG100g: '',
        carbsG100g: '',
        fatG100g: '',
        defaultPortionG: '',
        barcode: '4008400123456',
      });
      expect(createFood).not.toHaveBeenCalled();
    });

    it('distinguishes "not-found" from "api-error"', async () => {
      lookupBarcode.mockResolvedValue({ status: 'not-found' });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');
      await store.handleScanDetected('123');
      expect(store.scanPhase()).toBe('not-found');

      lookupBarcode.mockResolvedValue({
        status: 'error',
        message: 'Open Food Facts ist gerade nicht erreichbar.',
      });
      await store.handleScanDetected('456');
      expect(store.scanPhase()).toBe('api-error');
      expect(store.scanErrorMessage()).toBe('Open Food Facts ist gerade nicht erreichbar.');
    });
  });

  describe('beginScanSession / retryScan / reportCameraError / scanReentry', () => {
    it('counts scan re-entries — context hint only from the second entry onward', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');

      store.beginScanSession();
      expect(store.scanReentry()).toBe(false);

      store.beginScanSession();
      expect(store.scanReentry()).toBe(true);
    });

    it('reportCameraError sets a German message and the camera-error phase', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');

      store.reportCameraError('permission');

      expect(store.scanPhase()).toBe('camera-error');
      expect(store.scanErrorMessage()).toContain('Kamera-Zugriff wurde verweigert');
    });

    it('retryScan clears the error and returns to the camera phase', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');
      store.reportCameraError('unavailable');

      store.retryScan();

      expect(store.scanPhase()).toBe('camera');
      expect(store.scanErrorMessage()).toBeNull();
    });
  });

  describe('goToManualCreateFromScan', () => {
    it('prefills Step A2 with the last scanned barcode, name/nutrients empty', async () => {
      lookupBarcode.mockResolvedValue({ status: 'not-found' });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');
      await store.handleScanDetected('4008400123456');

      store.goToManualCreateFromScan();

      expect(store.createForm()).toEqual({
        name: '',
        kcal100g: '',
        proteinG100g: '',
        carbsG100g: '',
        fatG100g: '',
        defaultPortionG: '',
        barcode: '4008400123456',
      });
    });
  });

  describe('saveEntry — Serien-Erfassung (ADR-0010, entryOrigin "scan")', () => {
    it('captures a saved summary only when the entry originated from a scan', async () => {
      const found = makeFood({ id: 'off-1', name: 'Müsli', kcal100g: 400 });
      lookupBarcode.mockResolvedValue({ status: 'found', food: found });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');
      await store.handleScanDetected('123');
      store.setAmountInput('200');

      const ok = await store.saveEntry();

      expect(ok).toBe(true);
      expect(store.lastSavedSummary()).toEqual({ name: 'Müsli', kcal: 800 });
    });

    it('does not set a saved summary for a search-originated entry', async () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');
      store.selectFood(makeFood());
      store.setAmountInput('100');

      await store.saveEntry();

      expect(store.lastSavedSummary()).toBeNull();
    });
  });

  describe('resetForNextScan (Serien-Erfassung, erhaltene Mahlzeit)', () => {
    it('clears the Step-B draft but keeps the selected mealType and restarts the scan session', async () => {
      const found = makeFood({ id: 'off-1' });
      lookupBarcode.mockResolvedValue({ status: 'found', food: found });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'dinner');
      await store.handleScanDetected('123');
      store.setAmountInput('150');
      await store.saveEntry();

      store.resetForNextScan();

      expect(store.mealType()).toBe('dinner');
      expect(store.stepBFood()).toBeNull();
      expect(store.amountInput()).toBe('');
      expect(store.lastSavedSummary()).toBeNull();
      expect(store.scanPhase()).toBe('camera');
    });
  });

  describe('Segment-Tab "Gespeicherte Mahlzeiten" (ADR-0012 Punkt 3/6, design-conventions.md)', () => {
    function makeMeal(overrides: Partial<Meal> = {}): Meal {
      return {
        id: 'm1',
        name: 'Frühstück-Bowl',
        items: [
          {
            id: 'mi1',
            amountG: 150,
            food: { id: 'f1', name: 'Apfel', kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 },
          },
        ],
        ...overrides,
      };
    }

    it('defaults to the "search" tab and resets to it on beginEntrySession', () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      expect(store.activeTab()).toBe('search');
    });

    it('setActiveTab("saved-meals") loads the list exactly once per session', async () => {
      loadMeals.mockResolvedValue({ success: true, meals: [makeMeal()] });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      store.setActiveTab('saved-meals');
      await store.ensureSavedMealsLoaded();
      store.setActiveTab('search');
      store.setActiveTab('saved-meals');
      await store.ensureSavedMealsLoaded();

      expect(loadMeals).toHaveBeenCalledTimes(1);
      expect(store.savedMeals()).toHaveLength(1);
    });

    it('sets a load error on failure', async () => {
      loadMeals.mockResolvedValue({ success: false, message: 'Fehler' });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'breakfast');

      store.setActiveTab('saved-meals');
      await store.ensureSavedMealsLoaded();

      expect(store.savedMealsLoadError()).toBe('Fehler');
    });

    it('logMeal logs all positions in ONE createEntries call using the sheet-header meal type/date', async () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');

      const ok = await store.logMeal(
        makeMeal({
          items: [
            { id: 'mi1', amountG: 150, food: { id: 'f1', name: 'Apfel', kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 } },
            { id: 'mi2', amountG: 30, food: { id: 'f2', name: 'Honig', kcal100g: 304, proteinG100g: 0.3, carbsG100g: 82, fatG100g: 0 } },
          ],
        }),
      );

      expect(ok).toBe(true);
      expect(createEntries).toHaveBeenCalledTimes(1);
      expect(createEntries).toHaveBeenCalledWith([
        { foodId: 'f1', amountG: 150, mealType: 'lunch', date: '2026-09-21' },
        { foodId: 'f2', amountG: 30, mealType: 'lunch', date: '2026-09-21' },
      ]);
      expect(store.loggedMealSummary()).toEqual({ name: 'Frühstück-Bowl', itemCount: 2 });
    });

    it('logMeal is a defensive no-op for a meal without positions', async () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');

      const ok = await store.logMeal(makeMeal({ items: [] }));

      expect(ok).toBe(false);
      expect(createEntries).not.toHaveBeenCalled();
    });

    it('logMeal returns false and does not set a summary on failure', async () => {
      createEntries.mockResolvedValue({ success: false, message: 'Fehler' });
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');

      const ok = await store.logMeal(makeMeal());

      expect(ok).toBe(false);
      expect(store.loggedMealSummary()).toBeNull();
    });

    it('resetForNextMealLog clears the summary, keeping the meal type (Header-Kontext bleibt erhalten)', async () => {
      const store = TestBed.inject(FoodSearchStore);
      store.beginEntrySession('2026-09-21', 'lunch');
      await store.logMeal(makeMeal());

      store.resetForNextMealLog();

      expect(store.loggedMealSummary()).toBeNull();
      expect(store.mealType()).toBe('lunch');
    });
  });
});
