import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';
import { LOCAL_RESULT_LIMIT, SERVER_RESULT_LIMIT } from './food-search.constants';
import type { LocalFoodsState } from './foods.calculations';
import { CoreFoodsService, type Food, type ServerSearchResult } from './foods.service';
import { SERVER_SEARCH_DEBOUNCE_MS, createHybridFoodSearch } from './hybrid-food-search';

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 'f1',
    name: 'Apfel',
    kcal100g: 52,
    proteinG100g: 0.3,
    carbsG100g: 14,
    fatG100g: 0.2,
    defaultPortionG: null,
    source: 'off',
    barcode: null,
    isCorrected: false,
    offPopularity: 0,
    ...overrides,
  };
}

function hit(food: Food) {
  return { food, ownUseCount: 0 };
}

describe('createHybridFoodSearch (ADR-0021 Punkt 10)', () => {
  let foods: ReturnType<typeof signal<Food[]>>;
  let localState: ReturnType<typeof signal<LocalFoodsState>>;
  let online: ReturnType<typeof signal<boolean>>;
  let searchServer: ReturnType<typeof vi.fn>;
  let retryLoad: ReturnType<typeof vi.fn>;

  function create() {
    return TestBed.runInInjectionContext(() => createHybridFoodSearch());
  }

  beforeEach(() => {
    vi.useFakeTimers();
    foods = signal<Food[]>([]);
    localState = signal<LocalFoodsState>('ready');
    online = signal(true);
    searchServer = vi
      .fn<(query: string, signal: AbortSignal) => Promise<ServerSearchResult>>()
      .mockResolvedValue({ status: 'success', hits: [] });
    retryLoad = vi.fn().mockResolvedValue(undefined);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CoreFoodsService,
          useValue: {
            foods,
            ownUseCounts: signal<ReadonlyMap<string, number>>(new Map()),
            localState,
            searchServer,
            retryLoad,
          },
        },
        { provide: ConnectivityService, useValue: { online } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows local hits at once from a single character, without any server call', async () => {
    foods.set([makeFood({ id: '1', name: 'Apfel' }), makeFood({ id: '2', name: 'Banane' })]);
    const search = create();

    search.setQuery('a');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS * 2);

    expect(search.results().map((f) => f.id)).toEqual(['1', '2']);
    expect(searchServer).not.toHaveBeenCalled();
    expect(search.serverPhase()).toBe('idle');
    expect(search.status()).toEqual({ kind: 'none' });
  });

  it('debounces: a burst of keystrokes causes ONE server call for the last query, after 250 ms', async () => {
    const search = create();

    search.setQuery('jo');
    await vi.advanceTimersByTimeAsync(100);
    search.setQuery('jog');
    await vi.advanceTimersByTimeAsync(100);
    search.setQuery('jogh');
    expect(searchServer).not.toHaveBeenCalled();
    expect(search.status()).toEqual({ kind: 'searching' });
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);

    expect(searchServer).toHaveBeenCalledTimes(1);
    expect(searchServer.mock.calls[0][0]).toBe('jogh');
  });

  it('trims the query and ignores whitespace-only input for the server', async () => {
    const search = create();

    search.setQuery('   a  ');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS * 2);

    expect(searchServer).not.toHaveBeenCalled();
  });

  it('appends deduplicated server hits (at most SERVER_RESULT_LIMIT) after the local ones', async () => {
    foods.set([makeFood({ id: 'local', name: 'Joghurt' })]);
    searchServer.mockResolvedValue({
      status: 'success',
      hits: [
        hit(makeFood({ id: 'local', name: 'Joghurt' })),
        ...Array.from({ length: 40 }, (_, i) =>
          hit(makeFood({ id: `s${i}`, name: `Joghurt ${i}` })),
        ),
      ],
    });
    const search = create();

    search.setQuery('joghurt');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);

    expect(search.localResults().map((f) => f.id)).toEqual(['local']);
    expect(search.serverResults()).toHaveLength(SERVER_RESULT_LIMIT);
    expect(search.results()[0].id).toBe('local');
    expect(search.results()).toHaveLength(1 + SERVER_RESULT_LIMIT);
    expect(search.announcement()).toBe(`${SERVER_RESULT_LIMIT} Treffer online`);
  });

  it('shows at most LOCAL_RESULT_LIMIT local hits, but dedupes server hits against ALL local hits', async () => {
    foods.set(
      Array.from({ length: 70 }, (_, i) =>
        makeFood({
          id: `l${i}`,
          name: `Joghurt ${String(i).padStart(2, '0')}`,
          barcode: i === 65 ? '4001' : null,
        }),
      ),
    );
    searchServer.mockResolvedValue({
      status: 'success',
      hits: [
        hit(makeFood({ id: 'l69', name: 'Joghurt 69' })), // nur wegen der Kürzung nicht angezeigt
        hit(makeFood({ id: 'other', name: 'Joghurt Barcode', barcode: '4001' })), // Barcode von l65
        hit(makeFood({ id: 'srv', name: 'Joghurt Server' })),
      ],
    });
    const search = create();

    search.setQuery('joghurt');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);

    expect(search.localResults()).toHaveLength(LOCAL_RESULT_LIMIT);
    expect(search.results().filter((f) => f.id === 'l69')).toEqual([]);
    expect(search.serverResults().map((f) => f.id)).toEqual(['srv']);
    expect(search.results()).toHaveLength(LOCAL_RESULT_LIMIT + 1);
    expect(search.results()[LOCAL_RESULT_LIMIT].id).toBe('srv');
  });

  it('keeps local rows in place when server hits arrive', async () => {
    foods.set([
      makeFood({ id: '1', name: 'Joghurt Natur' }),
      makeFood({ id: '2', name: 'Joghurt Frucht' }),
    ]);
    searchServer.mockResolvedValue({
      status: 'success',
      hits: [hit(makeFood({ id: 'srv', name: 'Joghurt Bio' }))],
    });
    const search = create();

    search.setQuery('joghurt');
    const before = search.results().map((f) => f.id);
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);

    expect(
      search
        .results()
        .map((f) => f.id)
        .slice(0, before.length),
    ).toEqual(before);
    expect(search.results().map((f) => f.id)).toEqual([...before, 'srv']);
  });

  it('drops server hits of the previous input at once and ignores stale answers', async () => {
    const answers: ((result: ServerSearchResult) => void)[] = [];
    searchServer.mockImplementation(
      () => new Promise<ServerSearchResult>((resolve) => answers.push(resolve)),
    );
    const search = create();

    search.setQuery('ab');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);
    const firstSignal = searchServer.mock.calls[0][1] as AbortSignal;

    search.setQuery('abc');
    expect(firstSignal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);

    // Die ERSTE Antwort kommt zuletzt-aber-zu-spät an und darf nichts bewirken.
    answers[1]({ status: 'success', hits: [hit(makeFood({ id: 'new' }))] });
    await vi.advanceTimersByTimeAsync(0);
    answers[0]({ status: 'success', hits: [hit(makeFood({ id: 'stale' }))] });
    await vi.advanceTimersByTimeAsync(0);

    expect(search.serverResults().map((f) => f.id)).toEqual(['new']);
  });

  it('does not treat an abort as an error', async () => {
    searchServer.mockResolvedValue({ status: 'aborted' });
    const search = create();

    search.setQuery('ab');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);

    expect(search.status()).not.toEqual({ kind: 'server-failed' });
  });

  it('clearing the field removes server hits and the status line at once', async () => {
    searchServer.mockResolvedValue({ status: 'success', hits: [hit(makeFood({ id: 'srv' }))] });
    const search = create();
    search.setQuery('ab');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);
    expect(search.serverResults()).toHaveLength(1);

    search.setQuery('');

    expect(search.serverResults()).toEqual([]);
    expect(search.results()).toEqual([]);
    expect(search.status()).toEqual({ kind: 'none' });
    expect(search.statusReserved()).toBe(false);
    expect(search.announcement()).toBeNull();
  });

  it('shows "server failed" on an error and retries the current input at once, without debounce', async () => {
    searchServer.mockResolvedValueOnce({ status: 'error' });
    const search = create();
    search.setQuery('ab');
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);
    expect(search.status()).toEqual({ kind: 'server-failed' });

    searchServer.mockResolvedValueOnce({ status: 'success', hits: [hit(makeFood({ id: 'srv' }))] });
    await search.retry();

    expect(searchServer).toHaveBeenCalledTimes(2);
    expect(search.status()).toEqual({ kind: 'none' });
    expect(search.serverResults().map((f) => f.id)).toEqual(['srv']);
  });

  it('"local unavailable" has priority and its retry reloads the local stock', async () => {
    localState.set('unavailable');
    const search = create();
    expect(search.status()).toEqual({ kind: 'local-unavailable' });
    expect(search.statusReserved()).toBe(true);

    await search.retry();

    expect(retryLoad).toHaveBeenCalledTimes(1);
    expect(searchServer).not.toHaveBeenCalled();
  });

  describe('offline', () => {
    it('does not call the server, shows the offline status and keeps local hits', async () => {
      online.set(false);
      foods.set([makeFood({ id: '1', name: 'Apfel' })]);
      const search = create();

      search.setQuery('apf');
      await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS * 2);

      expect(searchServer).not.toHaveBeenCalled();
      expect(search.serverPhase()).toBe('offline');
      expect(search.status()).toEqual({ kind: 'offline' });
      expect(search.results().map((f) => f.id)).toEqual(['1']);
    });

    it('triggers the search for the existing input when the connection comes back', async () => {
      online.set(false);
      searchServer.mockResolvedValue({ status: 'success', hits: [hit(makeFood({ id: 'srv' }))] });
      const search = create();
      search.setQuery('apf');
      TestBed.tick();

      online.set(true);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);

      expect(searchServer).toHaveBeenCalledTimes(1);
      expect(search.status()).toEqual({ kind: 'none' });
      expect(search.serverResults().map((f) => f.id)).toEqual(['srv']);
    });

    it('aborts a running search when the connection drops', async () => {
      searchServer.mockImplementation(() => new Promise<ServerSearchResult>(() => undefined));
      const search = create();
      search.setQuery('apf');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);
      const signal = searchServer.mock.calls[0][1] as AbortSignal;

      online.set(false);
      TestBed.tick();

      expect(signal.aborted).toBe(true);
      expect(search.status()).toEqual({ kind: 'offline' });
    });
  });

  it('shows the empty state only after the server search ended', async () => {
    const search = create();

    search.setQuery('kiwi');
    expect(search.emptyState()).toBeNull();
    await vi.advanceTimersByTimeAsync(SERVER_SEARCH_DEBOUNCE_MS);

    expect(search.emptyState()).toEqual({ kind: 'no-hit', minCharsHint: false });
  });

  it('gives each instance its own query and answer state', async () => {
    const a = create();
    const b = create();

    a.setQuery('apfel');

    expect(a.query()).toBe('apfel');
    expect(b.query()).toBe('');
  });
});
