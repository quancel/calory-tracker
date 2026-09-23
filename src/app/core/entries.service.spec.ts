import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';
import { EntryQueueService, type QueueEntry } from './entry-queue.service';
import { EntrySyncService, SYNC_RETRY_DELAY } from './entry-sync.service';
import { EntriesService } from './entries.service';
import { CoreFoodsService, type Food } from './foods.service';
import { LOCAL_DB_NAME, LocalDbService } from './local-db.service';
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
    name: 'Haferflocken',
    kcal100g: 370,
    proteinG100g: 13,
    carbsG100g: 60,
    fatG100g: 7,
    defaultPortionG: null,
    source: 'manual',
    barcode: null,
    isCorrected: false,
    ...overrides,
  };
}

function makeQueueEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'e1',
    date: '2026-09-21',
    mealType: 'breakfast',
    amountG: 150,
    foodId: 'f1',
    food: {
      id: 'f1',
      name: 'Haferflocken',
      kcal100g: 370,
      proteinG100g: 13,
      carbsG100g: 60,
      fatG100g: 7,
      source: 'manual',
    },
    syncState: 'pending',
    attempts: 0,
    createdAt: 1000,
    ...overrides,
  };
}

/**
 * `from`-Stub, dessen `select(...)`-Kette über `overrides` bestimmt wird und
 * der zusätzlich einen neutralen `insert`-Handler mitbringt. Ohne ihn läuft
 * der beim Konstruktor von `EntriesService` angestoßene Hintergrund-Sync
 * (`EntrySyncService.startOnlinePhase()`, ADR-0016 Punkt 9) bei `online: true`
 * ins Leere, sobald die Queue noch einen Eintrag aus einem vorherigen Testfall
 * trägt — `client.from(...).insert is not a function` als unbehandelte
 * Promise-Rejection (Testrauschen, kein rotes Assertion-Ergebnis).
 */
function selectFrom(overrides: { select: ReturnType<typeof vi.fn> }) {
  return vi.fn().mockReturnValue({
    ...overrides,
    insert: vi.fn().mockResolvedValue({ error: null, status: 201 }),
  });
}

function configureModule(options: {
  from: ReturnType<typeof vi.fn>;
  userId?: () => string | null;
  online?: boolean;
}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: { client: { from: options.from }, userId: options.userId ?? (() => 'u1') },
      },
      { provide: ConnectivityService, useValue: { online: () => options.online ?? true } },
      { provide: SYNC_RETRY_DELAY, useValue: () => Promise.resolve() },
    ],
  });
}

async function seedFoods(foods: Food[]): Promise<void> {
  const coreFoods = TestBed.inject(CoreFoodsService);
  for (const food of foods) coreFoods.upsertFood(food);
}

describe('EntriesService.loadEntry', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('maps a loaded entry with its embedded food from snake_case, syncState "synced"', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'e1',
        date: '2026-09-21',
        meal_type: 'breakfast',
        amount_g: 150,
        foods: {
          id: 'f1',
          name: 'Haferflocken',
          kcal_100g: 370,
          protein_100g: 13,
          carbs_100g: 60,
          fat_100g: 7,
          source: 'off',
        },
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = selectFrom({ select });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const result = await service.loadEntry('e1');

    expect(from).toHaveBeenCalledWith('entries');
    expect(eq).toHaveBeenCalledWith('id', 'e1');
    expect(result).toEqual({
      success: true,
      entry: {
        id: 'e1',
        date: '2026-09-21',
        mealType: 'breakfast',
        amountG: 150,
        syncState: 'synced',
        food: {
          id: 'f1',
          name: 'Haferflocken',
          kcal100g: 370,
          proteinG100g: 13,
          carbsG100g: 60,
          fatG100g: 7,
          source: 'off',
        },
      },
    });
  });

  it('defaults a null embedded source to "manual" (legacy rows before this column existed)', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'e1',
        date: '2026-09-21',
        meal_type: 'breakfast',
        amount_g: 150,
        foods: {
          id: 'f1',
          name: 'Haferflocken',
          kcal_100g: 370,
          protein_100g: 13,
          carbs_100g: 60,
          fat_100g: 7,
          source: null,
        },
      },
      error: null,
    });
    const from = selectFrom({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const result = await service.loadEntry('e1');

    expect(result.success && result.entry.food.source).toBe('manual');
  });

  it('returns a generic error message when the query fails', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } });
    const from = selectFrom({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const result = await service.loadEntry('missing');

    expect(result).toEqual({ success: false, message: 'Eintrag konnte nicht geladen werden.' });
  });

  it('returns a generic error message when no row exists', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = selectFrom({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const result = await service.loadEntry('missing');

    expect(result).toEqual({ success: false, message: 'Eintrag konnte nicht geladen werden.' });
  });

  it('serves a still-buffered id from the queue instead of PostgREST (ADR-0016 Punkt 6)', async () => {
    const from = vi.fn();
    configureModule({ from, online: false });
    await seedFoods([makeFood()]);
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry({ syncState: 'failed', attempts: 3 }));

    const service = TestBed.inject(EntriesService);
    const result = await service.loadEntry('e1');

    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      entry: {
        id: 'e1',
        date: '2026-09-21',
        mealType: 'breakfast',
        amountG: 150,
        syncState: 'failed',
        food: {
          id: 'f1',
          name: 'Haferflocken',
          kcal100g: 370,
          proteinG100g: 13,
          carbsG100g: 60,
          fatG100g: 7,
          source: 'manual',
        },
      },
    });
  });
});

describe('EntriesService.createEntry (ADR-0016 — client-vergebene ID, Offline-Puffer)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('inserts id/food_id/amount_g/meal_type/date/user_id and bumps revision on success', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null, status: 201 });
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from, userId: () => 'u1' });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.createEntry({
      foodId: 'f1',
      amountG: 150,
      mealType: 'breakfast',
      date: '2026-09-21',
    });

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('entries');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'f1',
        amount_g: 150,
        meal_type: 'breakfast',
        date: '2026-09-21',
        user_id: 'u1',
      }),
    );
    const [[insertedPayload]] = insert.mock.calls;
    expect(typeof insertedPayload.id).toBe('string');
    expect(insertedPayload.id.length).toBeGreaterThan(0);
    expect(service.revision()).toBe(before + 1);
  });

  it('returns a domain error without calling the client when no user is signed in', async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from, userId: () => null });
    const service = TestBed.inject(EntriesService);

    const result = await service.createEntry({
      foodId: 'f1',
      amountG: 150,
      mealType: 'breakfast',
      date: '2026-09-21',
    });

    expect(result).toEqual({ success: false, message: 'Nicht angemeldet.' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns success:false without buffering on a PERMANENT error (4xx, not 408/429)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '23514' }, status: 400 });
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.createEntry({
      foodId: 'f1',
      amountG: 150,
      mealType: 'breakfast',
      date: '2026-09-21',
    });

    expect(result.success).toBe(false);
    expect(service.revision()).toBe(before);

    const queue = TestBed.inject(EntryQueueService);
    expect(queue.entries()).toEqual([]);
  });

  it('buffers on a TEMPORARY error (5xx) while online: returns success:true, bumps revision, enqueues a snapshot from the food cache', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '' }, status: 500 });
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from });
    await seedFoods([makeFood()]);
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.createEntry({
      foodId: 'f1',
      amountG: 150,
      mealType: 'breakfast',
      date: '2026-09-21',
    });

    expect(result).toEqual({ success: true });
    expect(service.revision()).toBe(before + 1);

    const queue = TestBed.inject(EntryQueueService);
    expect(queue.entries()).toHaveLength(1);
    expect(queue.entries()[0]).toEqual(
      expect.objectContaining({
        date: '2026-09-21',
        mealType: 'breakfast',
        amountG: 150,
        foodId: 'f1',
        syncState: 'pending',
        food: expect.objectContaining({ id: 'f1', name: 'Haferflocken' }),
      }),
    );

    // Drain den von `createEntry()` angestoßenen Hintergrund-Sync
    // (`void entrySync.runQueue()`), bevor der Testfall endet — sonst
    // laufen die 3 automatischen Versuche über `afterEach()`s
    // `LocalDbService.close()` hinaus weiter und pollutieren den nächsten
    // Testfall (`runQueue()` teilt sich den bereits laufenden Lauf).
    await TestBed.inject(EntrySyncService).runQueue();
  });

  it('buffers immediately without a network attempt when offline', async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from, online: false });
    await seedFoods([makeFood()]);
    const service = TestBed.inject(EntriesService);

    const result = await service.createEntry({
      foodId: 'f1',
      amountG: 150,
      mealType: 'breakfast',
      date: '2026-09-21',
    });

    expect(result).toEqual({ success: true });
    expect(insert).not.toHaveBeenCalled();

    const queue = TestBed.inject(EntryQueueService);
    expect(queue.entries()).toHaveLength(1);
    expect(queue.entries()[0].attempts).toBe(0);
  });

  it('returns a domain error when the food is not in the cache and it cannot be buffered (defensive fallback)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '' }, status: 500 });
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from });
    // Kein seedFoods() — Food nicht im Sitzungs-Cache.
    const service = TestBed.inject(EntriesService);

    const result = await service.createEntry({
      foodId: 'unknown',
      amountG: 150,
      mealType: 'breakfast',
      date: '2026-09-21',
    });

    expect(result).toEqual({ success: false, message: 'Eintrag konnte nicht gespeichert werden.' });
  });
});

describe('EntriesService.createEntries (ADR-0012 Punkt 6 / ADR-0013 Punkt 1 / ADR-0016)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('inserts all positions as ONE array insert with client ids, bumps revision once', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: 'e1' }, { id: 'e2' }],
      error: null,
    });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from, userId: () => 'u1' });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.createEntries([
      { foodId: 'f1', amountG: 150, mealType: 'breakfast', date: '2026-09-21' },
      { foodId: 'f2', amountG: 50, mealType: 'breakfast', date: '2026-09-21' },
    ]);

    expect(result).toEqual({ success: true, ids: ['e1', 'e2'] });
    expect(from).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    const [[insertedRows]] = insert.mock.calls;
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toEqual(
      expect.objectContaining({
        food_id: 'f1',
        amount_g: 150,
        meal_type: 'breakfast',
        date: '2026-09-21',
        user_id: 'u1',
      }),
    );
    expect(typeof insertedRows[0].id).toBe('string');
    expect(select).toHaveBeenCalledWith('id');
    expect(service.revision()).toBe(before + 1);
  });

  it('is a defensive no-op for an empty list', async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const result = await service.createEntries([]);

    expect(result).toEqual({ success: false, message: 'Keine Positionen zum Loggen.' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns a domain error without calling the client when no user is signed in', async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from, userId: () => null });
    const service = TestBed.inject(EntriesService);

    const result = await service.createEntries([
      { foodId: 'f1', amountG: 150, mealType: 'breakfast', date: '2026-09-21' },
    ]);

    expect(result).toEqual({ success: false, message: 'Nicht angemeldet.' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns success:false without buffering on a PERMANENT batch error', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { code: '23514' }, status: 400 });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.createEntries([
      { foodId: 'f1', amountG: 150, mealType: 'breakfast', date: '2026-09-21' },
    ]);

    expect(result).toEqual({
      success: false,
      message: 'Einträge konnten nicht gespeichert werden.',
    });
    expect(service.revision()).toBe(before);
  });

  it('buffers each position individually on a TEMPORARY batch error, returning the client-generated ids', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { code: '' }, status: 500 });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    configureModule({ from });
    await seedFoods([makeFood({ id: 'f1' }), makeFood({ id: 'f2', name: 'Banane' })]);
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.createEntries([
      { foodId: 'f1', amountG: 150, mealType: 'breakfast', date: '2026-09-21' },
      { foodId: 'f2', amountG: 50, mealType: 'breakfast', date: '2026-09-21' },
    ]);

    expect(result.success).toBe(true);
    expect(result.success && result.ids).toHaveLength(2);
    expect(service.revision()).toBe(before + 1);

    const queue = TestBed.inject(EntryQueueService);
    expect(queue.entries()).toHaveLength(2);

    // Drain den Hintergrund-Sync (siehe Kommentar oben) vor Testende.
    await TestBed.inject(EntrySyncService).runQueue();
  });
});

describe('EntriesService.updateEntry', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('updates only amount_g/meal_type and bumps revision for an already-synced entry', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.updateEntry('e1', { amountG: 200, mealType: 'lunch' });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ amount_g: 200, meal_type: 'lunch' });
    expect(eq).toHaveBeenCalledWith('id', 'e1');
    expect(service.revision()).toBe(before + 1);
  });

  it('returns a generic error and does not bump revision when the update fails', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'down' } });
    const from = vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.updateEntry('e1', { amountG: 200, mealType: 'lunch' });

    expect(result).toEqual({ success: false, message: 'Eintrag konnte nicht gespeichert werden.' });
    expect(service.revision()).toBe(before);
  });

  it('updates a still-buffered entry locally, without a network call (ADR-0016 Punkt 5)', async () => {
    const from = vi.fn();
    configureModule({ from, online: false });
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry());

    const service = TestBed.inject(EntriesService);
    const before = service.revision();
    const result = await service.updateEntry('e1', { amountG: 200, mealType: 'lunch' });

    expect(result).toEqual({ success: true });
    expect(from).not.toHaveBeenCalled();
    expect(service.revision()).toBe(before + 1);
    expect(queue.getById('e1')).toEqual(
      expect.objectContaining({ amountG: 200, mealType: 'lunch' }),
    );
  });
});

describe('EntriesService.deleteEntry', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('deletes by id and bumps revision for an already-synced entry', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq }) });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.deleteEntry('e1');

    expect(result).toEqual({ success: true });
    expect(eq).toHaveBeenCalledWith('id', 'e1');
    expect(service.revision()).toBe(before + 1);
  });

  it('returns a generic error and does not bump revision when the delete fails', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'down' } });
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq }) });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.deleteEntry('e1');

    expect(result).toEqual({ success: false, message: 'Eintrag konnte nicht gelöscht werden.' });
    expect(service.revision()).toBe(before);
  });

  it('removes a still-buffered entry from the queue, without a network call or transmission attempt', async () => {
    const from = vi.fn();
    configureModule({ from, online: false });
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry());

    const service = TestBed.inject(EntriesService);
    const before = service.revision();
    const result = await service.deleteEntry('e1');

    expect(result).toEqual({ success: true });
    expect(from).not.toHaveBeenCalled();
    expect(service.revision()).toBe(before + 1);
    expect(queue.getById('e1')).toBeUndefined();
  });
});

describe('EntriesService.deleteEntries (ADR-0013 Punkt 2 / ADR-0016)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('deletes all given ids in ONE request via .in() and bumps revision exactly once', async () => {
    const inFn = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ in: inFn }) });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.deleteEntries(['e1', 'e2', 'e3']);

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledTimes(1);
    expect(inFn).toHaveBeenCalledWith('id', ['e1', 'e2', 'e3']);
    expect(service.revision()).toBe(before + 1);
  });

  it('silently skips ids that were already deleted elsewhere (no error, no vor-check)', async () => {
    const inFn = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ in: inFn }) });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const result = await service.deleteEntries(['already-gone', 'e2']);

    expect(result).toEqual({ success: true });
  });

  it('is a defensive no-op for an empty list, no request', async () => {
    const inFn = vi.fn();
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ in: inFn }) });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const result = await service.deleteEntries([]);

    expect(result).toEqual({ success: false, message: 'Keine Einträge zum Löschen.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns a generic error and does not bump revision when the delete fails', async () => {
    const inFn = vi.fn().mockResolvedValue({ error: { message: 'down' } });
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ in: inFn }) });

    configureModule({ from });
    const service = TestBed.inject(EntriesService);

    const before = service.revision();
    const result = await service.deleteEntries(['e1']);

    expect(result).toEqual({ success: false, message: 'Einträge konnten nicht gelöscht werden.' });
    expect(service.revision()).toBe(before);
  });

  it('removes buffered ids locally AND deletes the rest remotely in one mixed call, bumping revision once', async () => {
    const inFn = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ in: inFn }) });

    configureModule({ from });
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry({ id: 'pending-1' }));

    const service = TestBed.inject(EntriesService);
    const before = service.revision();
    const result = await service.deleteEntries(['pending-1', 'remote-1']);

    expect(result).toEqual({ success: true });
    expect(inFn).toHaveBeenCalledWith('id', ['remote-1']);
    expect(queue.getById('pending-1')).toBeUndefined();
    expect(service.revision()).toBe(before + 1);
  });
});

describe('EntriesService.retryEntry', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('delegates to EntrySyncService.retryOne for exactly the given id', async () => {
    const from = vi.fn();
    configureModule({ from, online: false });
    const service = TestBed.inject(EntriesService);
    const entrySync = TestBed.inject(EntrySyncService);
    const spy = vi.spyOn(entrySync, 'retryOne').mockResolvedValue();

    await service.retryEntry('e1');

    expect(spy).toHaveBeenCalledWith('e1');
  });
});
