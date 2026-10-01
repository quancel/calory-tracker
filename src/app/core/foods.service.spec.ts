import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LOCAL_TOP_N } from './food-search.constants';
import {
  CoreFoodsService,
  FOODS_SNAPSHOT_SCHEMA,
  POSTGREST_PAGE_SIZE,
  SEARCH_FOODS_REQUEST_LIMIT,
  SEARCH_FOODS_TIMEOUT_MS,
  TOP_FINGERPRINT_SIZE,
  type Food,
  type RawFoodRow,
} from './foods.service';
import { FOODS_SNAPSHOT_STORE, LOCAL_DB_NAME, LocalDbService } from './local-db.service';
import { SupabaseService } from './supabase.service';

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
    offPopularity: 0,
    ...overrides,
  };
}

function makeRow(id: string, overrides: Partial<RawFoodRow> = {}): RawFoodRow {
  return {
    id,
    name: `Food ${id}`,
    kcal_100g: 100,
    protein_100g: 1,
    carbs_100g: 2,
    fat_100g: 3,
    default_portion_g: null,
    source: 'off',
    barcode: null,
    is_corrected: false,
    off_popularity: 0,
    ...overrides,
  };
}

interface Response {
  data: unknown;
  error: unknown;
}

/** Zustand, den die Supabase-Attrappe ausliefert — pro Test veränderbar. */
interface Backend {
  /** Sortierte Top-Zeilen (`top_foods`). */
  top: RawFoodRow[];
  shared: RawFoodRow[];
  entries: { food_id: string; foods: RawFoodRow | null }[];
  mealItems: { foods: RawFoodRow | null }[];
  /** PostgREST-`max_rows`: so viele Zeilen liefert eine Seite höchstens. */
  maxRows: number;
  failTop: boolean;
  /** Ab dem n-ten `top_foods`-Aufruf (1-basiert) scheitert die Attrappe. */
  failTopFromCall: number | null;
  failShared: boolean;
  failUser: boolean;
  searchRows: unknown[];
  searchError: boolean;
  searchHang: boolean;
}

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
  range?: [number, number];
}

function page<T>(rows: readonly T[], range: [number, number] | undefined, maxRows: number): T[] {
  if (!range) return rows.slice(0, maxRows);
  const [from, to] = range;
  return rows.slice(from, Math.min(to + 1, from + maxRows));
}

function makeSupabase(backend: Backend) {
  const rpcCalls: RpcCall[] = [];
  let topCalls = 0;

  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    const exec = (range?: [number, number], signal?: AbortSignal): Promise<Response> => {
      rpcCalls.push({ name, args, range });
      if (name === 'search_foods') {
        if (backend.searchHang) {
          return new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        if (backend.searchError) return Promise.resolve({ data: null, error: { message: 'x' } });
        return Promise.resolve({ data: backend.searchRows, error: null });
      }
      topCalls += 1;
      if (
        backend.failTop ||
        (backend.failTopFromCall !== null && topCalls >= backend.failTopFromCall)
      ) {
        return Promise.resolve({ data: null, error: { message: 'offline' } });
      }
      const rows = backend.top.slice(0, args['p_limit'] as number);
      return Promise.resolve({ data: page(rows, range, backend.maxRows), error: null });
    };
    return {
      range: (from: number, to: number) => exec([from, to]),
      abortSignal: (signal: AbortSignal) => exec(undefined, signal),
      then: (resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) =>
        exec().then(resolve, reject),
    };
  });

  const from = vi.fn((table: string) => ({
    select: () => {
      const chain = {
        or: () => chain,
        order: () => chain,
        range: (a: number, b: number): Promise<Response> => {
          if (table === 'foods') {
            if (backend.failShared) return Promise.resolve({ data: null, error: { message: 'x' } });
            return Promise.resolve({
              data: page(backend.shared, [a, b], backend.maxRows),
              error: null,
            });
          }
          if (backend.failUser) return Promise.resolve({ data: null, error: { message: 'x' } });
          const rows = table === 'entries' ? backend.entries : backend.mealItems;
          return Promise.resolve({ data: page(rows, [a, b], backend.maxRows), error: null });
        },
      };
      return chain;
    },
  }));

  return { rpc, from, rpcCalls };
}

describe('CoreFoodsService (ADR-0021)', () => {
  let backend: Backend;
  let supabase: ReturnType<typeof makeSupabase>;
  let userId: ReturnType<typeof signal<string | null>>;

  beforeEach(async () => {
    await resetDatabase();
    backend = {
      top: [],
      shared: [],
      entries: [],
      mealItems: [],
      maxRows: POSTGREST_PAGE_SIZE,
      failTop: false,
      failTopFromCall: null,
      failShared: false,
      failUser: false,
      searchRows: [],
      searchError: false,
      searchHang: false,
    };
    supabase = makeSupabase(backend);
    userId = signal<string | null>('u1');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { rpc: supabase.rpc, from: supabase.from }, userId },
        },
      ],
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await TestBed.inject(LocalDbService).close();
  });

  function stored<T>(key: string): Promise<T | undefined> {
    return TestBed.inject(LocalDbService).get<T>(FOODS_SNAPSHOT_STORE, key);
  }

  function putStored(key: string, value: unknown): Promise<void> {
    return TestBed.inject(LocalDbService).put(FOODS_SNAPSHOT_STORE, value, key);
  }

  /** fake-indexeddb klont Tausende Objekte quadratisch langsam — für reine Paging-Tests wird das Schreiben übersprungen. */
  function skipPersistence(): void {
    vi.spyOn(TestBed.inject(LocalDbService), 'put').mockResolvedValue();
  }

  function topSnapshot(foods: Food[], overrides: Record<string, unknown> = {}) {
    return {
      schema: FOODS_SNAPSHOT_SCHEMA,
      topN: LOCAL_TOP_N,
      fingerprint: 'x',
      foods,
      ...overrides,
    };
  }

  describe('Aufbau des lokalen Bestands', () => {
    it('merges top, shared and user foods by id and maps rows to the domain model', async () => {
      backend.top = [makeRow('t1', { name: 'Top', off_popularity: 7 }), makeRow('both')];
      backend.shared = [makeRow('s1', { source: null, name: 'Manuell' }), makeRow('both')];
      backend.entries = [
        { food_id: 'u1', foods: makeRow('u1', { name: 'Aus Eintrag' }) },
        { food_id: 'u1', foods: makeRow('u1', { name: 'Aus Eintrag' }) },
      ];
      backend.mealItems = [{ foods: makeRow('m1', { name: 'Aus Mahlzeit' }) }];
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(
        service
          .foods()
          .map((food) => food.id)
          .sort(),
      ).toEqual(['both', 'm1', 's1', 't1', 'u1']);
      expect(service.foods().find((food) => food.id === 't1')).toEqual(
        expect.objectContaining({
          name: 'Top',
          offPopularity: 7,
          source: 'off',
          defaultPortionG: null,
        }),
      );
      // `source = null` wird als 'manual' gelesen (foods.source ist nullable).
      expect(service.foods().find((food) => food.id === 's1')?.source).toBe('manual');
      expect(service.ownUseCounts().get('u1')).toBe(2);
      expect(service.localState()).toBe('ready');
    });

    it('ensureLoaded runs once per session', async () => {
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();
      const calls = supabase.rpc.mock.calls.length + supabase.from.mock.calls.length;
      await service.ensureLoaded();

      expect(supabase.rpc.mock.calls.length + supabase.from.mock.calls.length).toBe(calls);
    });

    it('a stored part never overwrites a freshly loaded version of the same id', async () => {
      await putStored('shared', {
        schema: FOODS_SNAPSHOT_SCHEMA,
        foods: [makeFood({ id: 'x', name: 'veraltet', isCorrected: false })],
      });
      backend.top = [makeRow('x', { name: 'frisch', is_corrected: true })];
      backend.failShared = true;
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.foods()).toHaveLength(1);
      expect(service.foods()[0]).toEqual(
        expect.objectContaining({ name: 'frisch', isCorrected: true }),
      );
    });

    it('is "initially loading" only while loading with no food at all', async () => {
      await putStored('top', topSnapshot([makeFood()]));
      const service = TestBed.inject(CoreFoodsService);
      expect(service.initialLoading()).toBe(false);

      const load = service.ensureLoaded();
      expect(service.localState()).toBe('loading');
      expect(service.initialLoading()).toBe(true);
      await load;
      expect(service.initialLoading()).toBe(false);
    });
  });

  describe('Paging (ADR-0021 Punkt 5)', () => {
    it('loads the top part in pages and advances by the rows actually delivered', async () => {
      // `max_rows` 400 < Seitengröße: „Seite kürzer als 1000 ⇒ Ende" würde hier still abschneiden.
      backend.maxRows = 400;
      backend.top = Array.from({ length: 1000 }, (_, i) => makeRow(`t${i}`));
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.foods()).toHaveLength(1000);
      const ranges = supabase.rpcCalls
        .filter((call) => call.name === 'top_foods' && call.range)
        .map((call) => call.range);
      expect(ranges[0]).toEqual([0, POSTGREST_PAGE_SIZE - 1]);
      expect(ranges[1]).toEqual([400, 400 + POSTGREST_PAGE_SIZE - 1]);
      expect(ranges[2]).toEqual([800, 800 + POSTGREST_PAGE_SIZE - 1]);
    });

    it('asks top_foods for LOCAL_TOP_N and stops there', async () => {
      backend.top = Array.from({ length: LOCAL_TOP_N + 300 }, (_, i) => makeRow(`t${i}`));
      skipPersistence();
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      const paged = supabase.rpcCalls.filter((call) => call.name === 'top_foods' && call.range);
      expect(paged.every((call) => call.args['p_limit'] === LOCAL_TOP_N)).toBe(true);
      expect(service.foods()).toHaveLength(LOCAL_TOP_N);
    });

    it('pages the shared part with more rows than one page', async () => {
      backend.shared = Array.from({ length: 2500 }, (_, i) => makeRow(`s${i}`, { source: null }));
      skipPersistence();
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.foods()).toHaveLength(2500);
    });
  });

  describe('Fingerabdruck des Top-Teils (ADR-0021 Punkt 4)', () => {
    it('writes top, shared and user parts to IndexedDB with the schema and the fingerprint', async () => {
      backend.top = [makeRow('t1', { off_popularity: 5 })];
      backend.shared = [makeRow('s1', { source: null })];
      backend.entries = [{ food_id: 'e1', foods: makeRow('e1') }];
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(await stored('top')).toEqual({
        schema: FOODS_SNAPSHOT_SCHEMA,
        topN: LOCAL_TOP_N,
        fingerprint: 't1:5',
        foods: [expect.objectContaining({ id: 't1' })],
      });
      expect((await stored<{ foods: Food[] }>('shared'))?.foods.map((food) => food.id)).toEqual([
        's1',
      ]);
      expect(await stored('user:u1')).toEqual(
        expect.objectContaining({ schema: FOODS_SNAPSHOT_SCHEMA, useCounts: { e1: 1 } }),
      );
    });

    it('keeps the stored top part and does NOT page when schema, topN and fingerprint match', async () => {
      await putStored(
        'top',
        topSnapshot([makeFood({ id: 't1', name: 'Gespeichert' })], { fingerprint: 't1:5' }),
      );
      backend.top = [makeRow('t1', { off_popularity: 5 })];
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(supabase.rpcCalls.filter((call) => call.name === 'top_foods')).toEqual([
        { name: 'top_foods', args: { p_limit: TOP_FINGERPRINT_SIZE }, range: undefined },
      ]);
      expect(service.foods().find((food) => food.id === 't1')?.name).toBe('Gespeichert');
    });

    it.each([
      ['a different fingerprint', { fingerprint: 'other' }],
      ['a different topN', { fingerprint: 't1:5', topN: LOCAL_TOP_N - 1 }],
      ['a different schema', { fingerprint: 't1:5', schema: FOODS_SNAPSHOT_SCHEMA + 1 }],
    ])('reloads the whole top part on %s and replaces the stored one', async (_label, diff) => {
      await putStored('top', topSnapshot([makeFood({ id: 'old-only', name: 'Alt' })], diff));
      backend.top = [makeRow('t1', { off_popularity: 5 })];
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.foods().map((food) => food.id)).toEqual(['t1']);
      expect((await stored<{ foods: Food[] }>('top'))?.foods.map((food) => food.id)).toEqual([
        't1',
      ]);
    });

    it('keeps the old top part when a reload fails midway (no partial swap)', async () => {
      await putStored('top', topSnapshot([makeFood({ id: 'old' })], { fingerprint: 'old' }));
      backend.top = [makeRow('t1'), makeRow('t2')];
      backend.maxRows = 1;
      // 1. Aufruf = Fingerabdruck, 2. = erste Seite, 3. = zweite Seite scheitert.
      backend.failTopFromCall = 3;
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.foods().map((food) => food.id)).toEqual(['old']);
      expect((await stored<{ foods: Food[] }>('top'))?.foods.map((food) => food.id)).toEqual([
        'old',
      ]);
      expect(service.localState()).toBe('ready');
    });

    it('treats a stored snapshot with a foreign schema as "not present"', async () => {
      await putStored('shared', { schema: 999, foods: [makeFood({ id: 'x' })] });
      backend.failShared = true;
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.foods().some((food) => food.id === 'x')).toBe(false);
      expect(service.localState()).toBe('unavailable');
    });
  });

  describe('Ladezustand (ADR-0021 Punkt 6)', () => {
    it('is unavailable when a part has neither fresh nor stored data, and retryLoad loads the missing part', async () => {
      backend.failShared = true;
      backend.top = [makeRow('t1')];
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.localState()).toBe('unavailable');

      backend.failShared = false;
      backend.shared = [makeRow('s1', { source: null })];
      await service.retryLoad();

      expect(service.localState()).toBe('ready');
      expect(
        service
          .foods()
          .map((food) => food.id)
          .sort(),
      ).toEqual(['s1', 't1']);
    });

    it('stays ready offline when every part has stored data (the stored parts are the stock)', async () => {
      await putStored('top', topSnapshot([makeFood({ id: 'a' })]));
      await putStored('shared', { schema: FOODS_SNAPSHOT_SCHEMA, foods: [makeFood({ id: 'b' })] });
      await putStored('user:u1', {
        schema: FOODS_SNAPSHOT_SCHEMA,
        foods: [makeFood({ id: 'c' })],
        useCounts: { c: 4 },
      });
      backend.failTop = true;
      backend.failShared = true;
      backend.failUser = true;
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.localState()).toBe('ready');
      expect(
        service
          .foods()
          .map((food) => food.id)
          .sort(),
      ).toEqual(['a', 'b', 'c']);
      expect(service.ownUseCounts().get('c')).toBe(4);
    });

    it('needs no user part without a signed-in user', async () => {
      userId.set(null);
      backend.top = [makeRow('t1')];
      const service = TestBed.inject(CoreFoodsService);

      await service.ensureLoaded();

      expect(service.localState()).toBe('ready');
      expect(supabase.from).not.toHaveBeenCalledWith('entries');
    });
  });

  describe('findFood (ADR-0021 Punkt 6/8)', () => {
    it('reads the stored parts without touching the network', async () => {
      await putStored('top', topSnapshot([makeFood({ id: 'a', name: 'Aus Speicher' })]));
      const service = TestBed.inject(CoreFoodsService);

      const food = await service.findFood('a');

      expect(food?.name).toBe('Aus Speicher');
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('resolves to null for an unknown id', async () => {
      const service = TestBed.inject(CoreFoodsService);

      expect(await service.findFood('nope')).toBeNull();
    });
  });

  describe('upsertFood / recordUse (ADR-0021 Punkt 2/8)', () => {
    it('adopts a food immediately and persists it in the user part', async () => {
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();

      service.upsertFood(makeFood({ id: 'new-1', name: 'Kiwi' }));

      expect(service.foods().some((food) => food.id === 'new-1')).toBe(true);
      const snapshot = await stored<{ foods: Food[] }>('user:u1');
      expect(snapshot?.foods.some((food) => food.id === 'new-1')).toBe(true);
    });

    it('replaces an existing version in place', async () => {
      backend.top = [makeRow('f1', { name: 'Apfel' })];
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();

      service.upsertFood(makeFood({ id: 'f1', name: 'Apfel (korrigiert)', kcal100g: 55 }));

      expect(service.foods()).toHaveLength(1);
      expect(service.foods()[0]).toEqual(
        expect.objectContaining({ name: 'Apfel (korrigiert)', kcal100g: 55 }),
      );
    });

    it('a stored part never overwrites a food upserted before the stored read finished', async () => {
      await putStored('top', topSnapshot([makeFood({ id: 'a', name: 'Alt' })]));
      const service = TestBed.inject(CoreFoodsService);
      service.upsertFood(makeFood({ id: 'a', name: 'Neu' }));

      await service.findFood('a');

      expect(service.foods().find((food) => food.id === 'a')?.name).toBe('Neu');
    });

    it('recordUse raises the own use count and persists it', async () => {
      backend.entries = [{ food_id: 'f1', foods: makeRow('f1') }];
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();

      await service.recordUse(['f1', 'f2', 'f2']);

      expect(service.ownUseCounts().get('f1')).toBe(2);
      expect(service.ownUseCounts().get('f2')).toBe(2);
      expect((await stored<{ useCounts: Record<string, number> }>('user:u1'))?.useCounts).toEqual({
        f1: 2,
        f2: 2,
      });
    });
  });

  describe('Nutzerwechsel (ADR-0021 Punkt 7)', () => {
    it('drops the user part and own use counts, loads the new user and deletes the other user key', async () => {
      backend.top = [makeRow('t1')];
      backend.entries = [{ food_id: 'only-a', foods: makeRow('only-a') }];
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();
      expect(await stored('user:u1')).toBeDefined();
      expect(service.ownUseCounts().get('only-a')).toBe(1);

      backend.entries = [{ food_id: 'only-b', foods: makeRow('only-b') }];
      userId.set('u2');
      TestBed.tick();
      await vi.waitFor(() =>
        expect(service.foods().some((food) => food.id === 'only-b')).toBe(true),
      );
      await vi.waitFor(() => expect(service.localState()).toBe('ready'));

      const ids = service.foods().map((food) => food.id);
      expect(ids).not.toContain('only-a');
      expect(ids).toContain('t1');
      expect(service.ownUseCounts().get('only-a')).toBeUndefined();
      expect(service.ownUseCounts().get('only-b')).toBe(1);
      expect(await stored('user:u1')).toBeUndefined();
      expect(await stored('user:u2')).toBeDefined();
    });

    it('deletes a leftover user key of another user', async () => {
      await putStored('user:other', {
        schema: FOODS_SNAPSHOT_SCHEMA,
        foods: [makeFood({ id: 'x' })],
        useCounts: {},
      });
      const service = TestBed.inject(CoreFoodsService);
      await service.ensureLoaded();
      userId.set('u2');
      TestBed.tick();

      await vi.waitFor(async () => expect(await stored('user:other')).toBeUndefined());
    });
  });

  describe('searchServer (ADR-0021 Punkt 9)', () => {
    it('calls search_foods with the trimmed query and the request limit and maps the rows', async () => {
      backend.searchRows = [
        { ...makeRow('h1', { name: 'Treffer', off_popularity: 3 }), own_use_count: 4 },
      ];
      const service = TestBed.inject(CoreFoodsService);

      const result = await service.searchServer('  joghurt ', new AbortController().signal);

      expect(supabase.rpcCalls).toContainEqual({
        name: 'search_foods',
        args: { p_query: 'joghurt', p_limit: SEARCH_FOODS_REQUEST_LIMIT },
        range: undefined,
      });
      expect(SEARCH_FOODS_REQUEST_LIMIT).toBe(50);
      expect(result).toEqual({
        status: 'success',
        hits: [{ food: expect.objectContaining({ id: 'h1', offPopularity: 3 }), ownUseCount: 4 }],
      });
    });

    it('returns error on a server error', async () => {
      backend.searchError = true;
      const service = TestBed.inject(CoreFoodsService);

      expect(await service.searchServer('joghurt', new AbortController().signal)).toEqual({
        status: 'error',
      });
    });

    it('returns aborted — never error — when the caller aborts', async () => {
      backend.searchHang = true;
      const service = TestBed.inject(CoreFoodsService);
      const controller = new AbortController();

      const pending = service.searchServer('joghurt', controller.signal);
      controller.abort();

      expect(await pending).toEqual({ status: 'aborted' });
    });

    it('returns aborted without a request when the signal is already aborted', async () => {
      const service = TestBed.inject(CoreFoodsService);
      const controller = new AbortController();
      controller.abort();

      expect(await service.searchServer('joghurt', controller.signal)).toEqual({
        status: 'aborted',
      });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('returns error when the time limit is hit', async () => {
      vi.useFakeTimers();
      backend.searchHang = true;
      const service = TestBed.inject(CoreFoodsService);

      const pending = service.searchServer('joghurt', new AbortController().signal);
      await vi.advanceTimersByTimeAsync(SEARCH_FOODS_TIMEOUT_MS + 1);

      expect(await pending).toEqual({ status: 'error' });
    });
  });
});
