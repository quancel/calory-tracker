import { TestBed } from '@angular/core/testing';
import { EntriesService } from '../core/entries.service';
import { CoreFoodsService, type Food, type ServerSearchResult } from '../core/foods.service';
import { CoreMealsService, type Meal } from '../core/meals.service';
import { MealsService } from './meals.service';
import { MealsStore } from './meals.store';

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
    offPopularity: 0,
    ...overrides,
  };
}

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

describe('MealsStore', () => {
  let loadMeals: ReturnType<typeof vi.fn>;
  let createMeal: ReturnType<typeof vi.fn>;
  let updateMeal: ReturnType<typeof vi.fn>;
  let deleteMealFn: ReturnType<typeof vi.fn>;
  let foods: Food[];
  let loadRecentFoodIds: ReturnType<typeof vi.fn>;
  let searchServer: ReturnType<typeof vi.fn>;
  let upsertFood: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    loadRecentFoodIds = vi.fn().mockResolvedValue([]);
    searchServer = vi.fn<() => Promise<ServerSearchResult>>().mockResolvedValue({ status: 'success', hits: [] });
    upsertFood = vi.fn();
    loadMeals = vi.fn().mockResolvedValue({ success: true, meals: [] });
    createMeal = vi.fn().mockResolvedValue({ success: true, mealId: 'new-1' });
    updateMeal = vi.fn().mockResolvedValue({ success: true });
    deleteMealFn = vi.fn().mockResolvedValue({ success: true });
    foods = [makeFood()];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CoreMealsService, useValue: { loadMeals } },
        {
          provide: CoreFoodsService,
          useValue: {
            foods: () => foods,
            ownUseCounts: () => new Map<string, number>(),
            localState: () => 'ready',
            initialLoading: () => false,
            ensureLoaded: vi.fn().mockResolvedValue(undefined),
            retryLoad: vi.fn().mockResolvedValue(undefined),
            searchServer,
            upsertFood,
          },
        },
        { provide: EntriesService, useValue: { loadRecentFoodIds } },
        { provide: MealsService, useValue: { createMeal, updateMeal, deleteMeal: deleteMealFn } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ensureListLoaded / meals (Sortierung + Summen, ADR-0012 Punkt 3/4)', () => {
    it('loads once, sorts alphabetically and computes kcal totals per meal', async () => {
      loadMeals.mockResolvedValue({
        success: true,
        meals: [makeMeal({ id: 'm2', name: 'Zwischenmahlzeit' }), makeMeal({ id: 'm1', name: 'Apfelsnack' })],
      });
      const store = TestBed.inject(MealsStore);

      await store.ensureListLoaded();
      await store.ensureListLoaded();

      expect(loadMeals).toHaveBeenCalledTimes(1);
      expect(store.meals().map((entry) => entry.meal.id)).toEqual(['m1', 'm2']);
      expect(store.meals()[0].totals.kcal).toBeCloseTo(78, 5); // 150g * 52kcal/100g
    });

    it('sets a load error on failure', async () => {
      loadMeals.mockResolvedValue({ success: false, message: 'Fehler' });
      const store = TestBed.inject(MealsStore);

      await store.ensureListLoaded();

      expect(store.listLoadError()).toBe('Fehler');
    });
  });

  describe('beginNewMeal / canSaveMeal', () => {
    it('is disabled for an empty name/no items', () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();

      expect(store.canSaveMeal()).toBe(false);
    });

    it('is disabled with a valid name but no items', () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();
      store.setDraftName('Salat');

      expect(store.canSaveMeal()).toBe(false);
    });

    it('is enabled once name is valid AND at least one item exists', () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();
      store.setDraftName('Salat');
      store.beginAddItem();
      store.selectM2Food(makeFood());
      store.confirmAmount();

      expect(store.canSaveMeal()).toBe(true);
    });
  });

  describe('beginEditMeal', () => {
    it('prefills name and items from the loaded meal', async () => {
      loadMeals.mockResolvedValue({ success: true, meals: [makeMeal()] });
      const store = TestBed.inject(MealsStore);
      await store.ensureListLoaded();

      const ok = store.beginEditMeal('m1');

      expect(ok).toBe(true);
      expect(store.draftName()).toBe('Frühstück-Bowl');
      expect(store.draftItems()).toEqual([
        { foodId: 'f1', amountG: 150, foodName: 'Apfel', kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 },
      ]);
      expect(store.isEditingMeal()).toBe(true);
    });

    it('returns false for an unknown meal (defensive guard)', () => {
      const store = TestBed.inject(MealsStore);
      expect(store.beginEditMeal('unknown')).toBe(false);
    });
  });

  describe('removeDraftItem', () => {
    it('removes the item at the given index without confirmation', () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();
      store.beginAddItem();
      store.selectM2Food(makeFood({ id: 'f1' }));
      store.confirmAmount();
      store.beginAddItem();
      store.selectM2Food(makeFood({ id: 'f2', name: 'Banane' }));
      store.confirmAmount();

      store.removeDraftItem(0);

      expect(store.draftItems().map((i) => i.foodId)).toEqual(['f2']);
    });
  });

  describe('M2 (nur Auswahl bestehender Foods, Nutzerentscheidung 2026-09-21; Hybrid-Suche ADR-0021)', () => {
    it('filters the local stock case-insensitively', () => {
      foods = [makeFood({ id: '1', name: 'Apfel' }), makeFood({ id: '2', name: 'Banane' })];
      const store = TestBed.inject(MealsStore);

      store.setM2Query('BAN');

      expect(store.m2Results().map((f) => f.id)).toEqual(['2']);
    });

    it('shows "Zuletzt verwendet" — not the whole local stock — for an empty query (Nutzerentscheidung 2026-09-30)', async () => {
      foods = [
        makeFood({ id: '1', name: 'Apfel' }),
        makeFood({ id: '2', name: 'Banane' }),
        makeFood({ id: '3', name: 'Curry' }),
      ];
      loadRecentFoodIds.mockResolvedValue(['3', '1']);
      const store = TestBed.inject(MealsStore);

      await store.ensureFoodsLoaded();

      expect(loadRecentFoodIds).toHaveBeenCalledWith(10);
      expect(store.m2ShowingRecent()).toBe(true);
      expect(store.m2Results().map((f) => f.id)).toEqual(['3', '1']);
    });

    it('shows the no-recent hint instead of the whole stock when nothing was logged yet', async () => {
      foods = [makeFood({ id: '1' })];
      const store = TestBed.inject(MealsStore);

      await store.ensureFoodsLoaded();

      expect(store.m2Results()).toEqual([]);
      expect(store.m2ShowNoRecent()).toBe(true);
    });

    it('appends server hits after the local ones from 2 characters on, after the debounce', async () => {
      foods = [makeFood({ id: '1', name: 'Apfelmus' })];
      searchServer.mockResolvedValue({
        status: 'success',
        hits: [{ food: makeFood({ id: 'srv', name: 'Apfelsaft' }), ownUseCount: 0 }],
      });
      const store = TestBed.inject(MealsStore);

      store.setM2Query('apf');
      expect(searchServer).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(250);

      expect(store.m2Results().map((f) => f.id)).toEqual(['1', 'srv']);
      expect(store.m2LocalResultCount()).toBe(1);
    });

    it('shows the empty line only after the server search ended without a hit', async () => {
      const store = TestBed.inject(MealsStore);

      store.setM2Query('kiwi');
      expect(store.m2EmptyState()).toBeNull();
      expect(store.m2SkeletonRows()).toBe(2);
      await vi.advanceTimersByTimeAsync(250);

      expect(store.m2EmptyState()).toEqual({ kind: 'no-hit', minCharsHint: false });
      expect(store.m2SkeletonRows()).toBe(0);
    });

    it('beginAddItem clears the M2 query', () => {
      const store = TestBed.inject(MealsStore);
      store.setM2Query('abc');

      store.beginAddItem();

      expect(store.m2Query()).toBe('');
    });
  });

  describe('M3 — Hinzufügen vs. Ändern-Modus (Nutzerentscheidung 2026-09-21, ABWEICHEND von „nur entfernen")', () => {
    it('beginAddItem starts in "add" mode with no preselected food', () => {
      const store = TestBed.inject(MealsStore);
      store.beginAddItem();

      expect(store.isChangeMode()).toBe(false);
      expect(store.m3Food()).toBeNull();
    });

    it('selectM2Food adopts the food (also a server hit) into the local stock', () => {
      const store = TestBed.inject(MealsStore);
      const food = makeFood({ id: 'srv' });

      store.selectM2Food(food);

      expect(upsertFood).toHaveBeenCalledWith(food);
    });

    it('selectM2Food (add mode) prefills amount from defaultPortionG', () => {
      const store = TestBed.inject(MealsStore);
      store.beginAddItem();
      store.selectM2Food(makeFood({ defaultPortionG: 200 }));

      expect(store.m3AmountInput()).toBe('200');
    });

    it('confirmAmount in "add" mode appends a new draft item', () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();
      store.beginAddItem();
      store.selectM2Food(makeFood({ id: 'f1' }));
      store.setM3AmountInput('120');

      const ok = store.confirmAmount();

      expect(ok).toBe(true);
      expect(store.draftItems()).toHaveLength(1);
      expect(store.draftItems()[0].amountG).toBe(120);
    });

    it('beginChangeItem opens M3 directly in "change" mode, prefilled with the stored amount, SKIPPING M2', async () => {
      loadMeals.mockResolvedValue({ success: true, meals: [makeMeal()] });
      const store = TestBed.inject(MealsStore);
      await store.ensureListLoaded();
      store.beginEditMeal('m1');

      store.beginChangeItem(0);

      expect(store.isChangeMode()).toBe(true);
      expect(store.m3Food()?.id).toBe('f1');
      expect(store.m3AmountInput()).toBe('150');
    });

    it('confirmAmount in "change" mode REPLACES only that position\'s amount, food stays fixed', async () => {
      loadMeals.mockResolvedValue({ success: true, meals: [makeMeal()] });
      const store = TestBed.inject(MealsStore);
      await store.ensureListLoaded();
      store.beginEditMeal('m1');
      store.beginChangeItem(0);
      store.setM3AmountInput('250');

      const ok = store.confirmAmount();

      expect(ok).toBe(true);
      expect(store.draftItems()).toHaveLength(1);
      expect(store.draftItems()[0]).toEqual(
        expect.objectContaining({ foodId: 'f1', amountG: 250 }),
      );
    });

    it('confirmAmount is a defensive no-op for an invalid amount', () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();
      store.beginAddItem();
      store.selectM2Food(makeFood());
      store.setM3AmountInput('0');

      expect(store.confirmAmount()).toBe(false);
      expect(store.draftItems()).toHaveLength(0);
    });
  });

  describe('saveMeal', () => {
    it('creates a new meal via MealsService.createMeal and reloads the list', async () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();
      store.setDraftName('Salat');
      store.beginAddItem();
      store.selectM2Food(makeFood({ id: 'f1' }));
      store.setM3AmountInput('100');
      store.confirmAmount();

      const ok = await store.saveMeal();

      expect(ok).toBe(true);
      expect(createMeal).toHaveBeenCalledWith({
        name: 'Salat',
        items: [{ foodId: 'f1', amountG: 100 }],
      });
      expect(updateMeal).not.toHaveBeenCalled();
      expect(loadMeals).toHaveBeenCalledTimes(1);
    });

    it('updates an existing meal via MealsService.updateMeal once a mealId is loaded', async () => {
      loadMeals.mockResolvedValue({ success: true, meals: [makeMeal()] });
      const store = TestBed.inject(MealsStore);
      await store.ensureListLoaded();
      store.beginEditMeal('m1');
      store.setDraftName('Neuer Name');

      const ok = await store.saveMeal();

      expect(ok).toBe(true);
      expect(updateMeal).toHaveBeenCalledWith('m1', {
        name: 'Neuer Name',
        items: [{ foodId: 'f1', amountG: 150 }],
      });
      expect(createMeal).not.toHaveBeenCalled();
    });

    it('is a defensive no-op while canSaveMeal is false', async () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();

      const ok = await store.saveMeal();

      expect(ok).toBe(false);
      expect(createMeal).not.toHaveBeenCalled();
    });

    it('sets draftSaveError on failure', async () => {
      createMeal.mockResolvedValue({ success: false, message: 'Fehler beim Speichern' });
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();
      store.setDraftName('Salat');
      store.beginAddItem();
      store.selectM2Food(makeFood());
      store.confirmAmount();

      const ok = await store.saveMeal();

      expect(ok).toBe(false);
      expect(store.draftSaveError()).toBe('Fehler beim Speichern');
    });
  });

  describe('deleteMeal', () => {
    it('deletes the loaded meal and reloads the list', async () => {
      loadMeals.mockResolvedValue({ success: true, meals: [makeMeal()] });
      const store = TestBed.inject(MealsStore);
      await store.ensureListLoaded();
      store.beginEditMeal('m1');

      const ok = await store.deleteMeal();

      expect(ok).toBe(true);
      expect(deleteMealFn).toHaveBeenCalledWith('m1');
      expect(loadMeals).toHaveBeenCalledTimes(2); // initial + reload after delete
    });

    it('is a defensive no-op in the "new meal" flow (no mealId)', async () => {
      const store = TestBed.inject(MealsStore);
      store.beginNewMeal();

      const ok = await store.deleteMeal();

      expect(ok).toBe(false);
      expect(deleteMealFn).not.toHaveBeenCalled();
    });
  });
});
