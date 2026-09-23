import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';
import { CoreFoodsService, type Food } from './foods.service';
import { LOCAL_DB_NAME, LocalDbService } from './local-db.service';

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

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

function makeSelectQuery(response: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(response),
    }),
  };
}

describe('CoreFoodsService (ADR-0012 Punkt 1)', () => {
  let response: { data: unknown; error: unknown };
  let from: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDatabase();
    response = { data: [], error: null };
    from = vi.fn().mockImplementation((table: string) => {
      if (table === 'foods') return makeSelectQuery(response);
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  describe('ensureLoaded / retryLoad (Sitzungs-Cache)', () => {
    it('loads the food list on the first call, maps snake_case rows to the domain model', async () => {
      response.data = [
        {
          id: 'f1',
          name: 'Apfel',
          kcal_100g: 52,
          protein_100g: 0.3,
          carbs_100g: 14,
          fat_100g: 0.2,
          default_portion_g: null,
          source: 'manual',
          barcode: null,
          is_corrected: false,
        },
      ];
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(from).toHaveBeenCalledWith('foods');
      expect(service.foods()).toEqual([
        {
          id: 'f1',
          name: 'Apfel',
          kcal100g: 52,
          proteinG100g: 0.3,
          carbsG100g: 14,
          fatG100g: 0.2,
          defaultPortionG: null,
          source: 'manual',
          barcode: null,
          isCorrected: false,
        },
      ]);
      expect(service.loading()).toBe(false);
      expect(service.loadError()).toBeNull();
    });

    it('does NOT reload on a second call within the same session', async () => {
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();
      await service.ensureLoaded();
      await service.ensureLoaded();

      expect(from).toHaveBeenCalledTimes(1);
    });

    it('sets a load error and does not mark the session as loaded on failure; retryLoad tries again', async () => {
      response = { data: null, error: { message: 'network down' } };
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.loadError()).toBe('Foods konnten nicht geladen werden.');

      response = { data: [], error: null };
      await service.retryLoad();

      expect(from).toHaveBeenCalledTimes(2);
      expect(service.loadError()).toBeNull();
    });
  });

  describe('upsertFood', () => {
    it('appends a new food instead of reloading', async () => {
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();

      service.upsertFood(makeFood({ id: 'new-1', name: 'Kiwi' }));

      expect(service.foods().some((f) => f.id === 'new-1')).toBe(true);
      expect(from).toHaveBeenCalledTimes(1);
    });

    it('updates an existing food in place', async () => {
      response.data = [
        {
          id: 'f1',
          name: 'Apfel',
          kcal_100g: 52,
          protein_100g: 0.3,
          carbs_100g: 14,
          fat_100g: 0.2,
          default_portion_g: null,
          source: 'manual',
          barcode: null,
          is_corrected: false,
        },
      ];
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();

      service.upsertFood(makeFood({ id: 'f1', name: 'Apfel (korrigiert)', kcal100g: 55 }));

      expect(service.foods()).toHaveLength(1);
      expect(service.foods()[0]).toEqual(
        expect.objectContaining({ id: 'f1', name: 'Apfel (korrigiert)', kcal100g: 55 }),
      );
    });
  });

  describe('Lesecache (ADR-0016 Punkt 8)', () => {
    it('writes a snapshot to IndexedDB after a successful load', async () => {
      response.data = [
        {
          id: 'f1',
          name: 'Apfel',
          kcal_100g: 52,
          protein_100g: 0.3,
          carbs_100g: 14,
          fat_100g: 0.2,
          default_portion_g: null,
          source: 'manual',
          barcode: null,
          is_corrected: false,
        },
      ];
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();

      const localDb = TestBed.inject(LocalDbService);
      const snapshot = await localDb.get<Food[]>('foods-snapshot', 'current');

      expect(snapshot).toEqual([expect.objectContaining({ id: 'f1', name: 'Apfel' })]);
    });

    it('falls back to the snapshot instead of an error state when the load fails', async () => {
      const localDb = TestBed.inject(LocalDbService);
      await localDb.put(
        'foods-snapshot',
        [makeFood({ id: 'cached-1', name: 'Zwieback' })],
        'current',
      );

      response = { data: null, error: { message: 'network down' } };
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.loadError()).toBeNull();
      expect(service.loaded()).toBe(true);
      expect(service.foods()).toEqual([makeFood({ id: 'cached-1', name: 'Zwieback' })]);
    });

    it('shows the normal error state when the load fails AND no snapshot exists', async () => {
      response = { data: null, error: { message: 'network down' } };
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.loadError()).toBe('Foods konnten nicht geladen werden.');
      expect(service.foods()).toEqual([]);
    });
  });
});
