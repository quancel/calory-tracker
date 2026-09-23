import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';
import { EntryQueueService, type QueueEntry } from './entry-queue.service';
import {
  EntrySyncService,
  SYNC_RETRY_DELAY,
  attemptInsertEntry,
  classifyEntryWriteError,
} from './entry-sync.service';
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

function makeQueueEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'e1',
    date: '2026-09-22',
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

describe('classifyEntryWriteError (ADR-0016 Punkt 9)', () => {
  it('treats a unique violation on the own id as success regardless of status', () => {
    expect(classifyEntryWriteError(409, '23505')).toBe('success');
  });

  it('treats network failure (status 0) as temporary', () => {
    expect(classifyEntryWriteError(0, '')).toBe('temporary');
  });

  it.each([408, 429])('treats %i as temporary despite being 4xx', (status) => {
    expect(classifyEntryWriteError(status, 'PGRST000')).toBe('temporary');
  });

  it.each([400, 401, 403, 404, 422])('treats %i as permanent', (status) => {
    expect(classifyEntryWriteError(status, '23514')).toBe('permanent');
  });

  it.each([500, 502, 503])('treats %i as temporary', (status) => {
    expect(classifyEntryWriteError(status, '')).toBe('temporary');
  });
});

describe('attemptInsertEntry', () => {
  const payload = {
    id: 'e1',
    foodId: 'f1',
    amountG: 150,
    mealType: 'breakfast' as const,
    date: '2026-09-22',
  };

  it('sends id/food_id/amount_g/meal_type/date/user_id and reports success', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null, status: 201 });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as any;

    const outcome = await attemptInsertEntry(client, 'u1', payload);

    expect(from).toHaveBeenCalledWith('entries');
    expect(insert).toHaveBeenCalledWith({
      id: 'e1',
      food_id: 'f1',
      amount_g: 150,
      meal_type: 'breakfast',
      date: '2026-09-22',
      user_id: 'u1',
    });
    expect(outcome).toEqual({ kind: 'success' });
  });

  it('classifies a permanent error and returns a message', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '23514' }, status: 400 });
    const client = { from: vi.fn().mockReturnValue({ insert }) } as any;

    const outcome = await attemptInsertEntry(client, 'u1', payload);

    expect(outcome.kind).toBe('permanent');
  });

  it('treats a 23505 unique violation as success', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505' }, status: 409 });
    const client = { from: vi.fn().mockReturnValue({ insert }) } as any;

    const outcome = await attemptInsertEntry(client, 'u1', payload);

    expect(outcome).toEqual({ kind: 'success' });
  });
});

describe('EntrySyncService', () => {
  let connectivityOnline: boolean;
  let insert: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDatabase();
    connectivityOnline = true;
    insert = vi.fn();
    from = vi.fn().mockReturnValue({ insert });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { from }, userId: () => 'u1' } },
        { provide: ConnectivityService, useValue: { online: () => connectivityOnline } },
        { provide: SYNC_RETRY_DELAY, useValue: () => Promise.resolve() },
      ],
    });
  });

  afterEach(async () => {
    // Verbindung schließen, bevor der nächste Testfall die Datenbank löscht
    // — sonst blockiert `indexedDB.deleteDatabase()` an der offenen
    // Verbindung aus diesem Testfall.
    await TestBed.inject(LocalDbService).close();
  });

  it('startOnlinePhase syncs a pending entry and removes it from the queue on success', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry());
    insert.mockResolvedValue({ error: null, status: 201 });

    const sync = TestBed.inject(EntrySyncService);
    await sync.startOnlinePhase();

    expect(queue.entries()).toEqual([]);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('retries a temporary failure up to 3 times per online phase, then marks it failed', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry());
    insert.mockResolvedValue({ error: { code: '' }, status: 500 });

    const sync = TestBed.inject(EntrySyncService);
    await sync.startOnlinePhase();

    expect(insert).toHaveBeenCalledTimes(3);
    expect(queue.getById('e1')).toEqual(
      expect.objectContaining({ syncState: 'failed', attempts: 3 }),
    );
  });

  it('marks a permanent error as failed immediately, without further attempts', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry());
    insert.mockResolvedValue({ error: { code: '23514' }, status: 400 });

    const sync = TestBed.inject(EntrySyncService);
    await sync.startOnlinePhase();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(queue.getById('e1')).toEqual(
      expect.objectContaining({ syncState: 'failed', attempts: 1 }),
    );
  });

  it('aborts remaining attempts when connectivity drops mid-run, leaving the entry pending', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry());
    insert.mockImplementation(async () => {
      connectivityOnline = false;
      return { error: { code: '' }, status: 500 };
    });

    const sync = TestBed.inject(EntrySyncService);
    await sync.startOnlinePhase();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(queue.getById('e1')).toEqual(
      expect.objectContaining({ syncState: 'pending', attempts: 1 }),
    );
  });

  it('re-arms a failed entry on the next online phase (fresh attempts budget)', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry({ syncState: 'failed', attempts: 3 }));
    insert.mockResolvedValue({ error: null, status: 201 });

    const sync = TestBed.inject(EntrySyncService);
    await sync.startOnlinePhase();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(queue.entries()).toEqual([]);
  });

  it('retryOne performs exactly one attempt for a failed entry and clears it on success', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry({ syncState: 'failed', attempts: 3 }));
    insert.mockResolvedValue({ error: null, status: 201 });

    const sync = TestBed.inject(EntrySyncService);
    await sync.retryOne('e1');

    expect(insert).toHaveBeenCalledTimes(1);
    expect(queue.entries()).toEqual([]);
  });

  it('retryOne is a no-op for a pending (not yet failed) entry', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry({ syncState: 'pending' }));

    const sync = TestBed.inject(EntrySyncService);
    await sync.retryOne('e1');

    expect(insert).not.toHaveBeenCalled();
  });

  it('runQueue shares a single in-flight run (single-flight) when called concurrently', async () => {
    const queue = TestBed.inject(EntryQueueService);
    await queue.enqueue(makeQueueEntry());
    let resolveInsert!: (value: { error: null; status: number }) => void;
    insert.mockReturnValue(
      new Promise((resolve) => {
        resolveInsert = resolve;
      }),
    );

    const sync = TestBed.inject(EntrySyncService);
    const first = sync.runQueue();
    const second = sync.runQueue();

    resolveInsert({ error: null, status: 201 });
    await Promise.all([first, second]);

    expect(insert).toHaveBeenCalledTimes(1);
  });
});
