import { TestBed } from '@angular/core/testing';
import { EntryQueueService, type QueueEntry } from './entry-queue.service';
import { LOCAL_DB_NAME, LocalDbService } from './local-db.service';

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

describe('EntryQueueService (ADR-0016)', () => {
  beforeEach(async () => {
    await resetDatabase();
    TestBed.resetTestingModule();
  });

  afterEach(async () => {
    // Verbindung schließen, bevor der nächste Testfall die Datenbank löscht
    // — sonst blockiert `indexedDB.deleteDatabase()` an der offenen
    // Verbindung aus diesem Testfall.
    await TestBed.inject(LocalDbService).close();
  });

  it('starts empty and loads persisted rows from IndexedDB on construction (survives app restart)', async () => {
    const first = TestBed.inject(EntryQueueService);
    await first.enqueue(makeQueueEntry());

    await TestBed.inject(LocalDbService).close();
    TestBed.resetTestingModule();
    const second = TestBed.inject(EntryQueueService);
    await second.whenReady();

    expect(second.entries()).toEqual([makeQueueEntry()]);
  });

  it('enqueue appends and sorts by createdAt (Anlegereihenfolge)', async () => {
    const service = TestBed.inject(EntryQueueService);

    await service.enqueue(makeQueueEntry({ id: 'e2', createdAt: 2000 }));
    await service.enqueue(makeQueueEntry({ id: 'e1', createdAt: 1000 }));

    expect(service.entries().map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('updateLocal changes amount/mealType in place — no second queue entry', async () => {
    const service = TestBed.inject(EntryQueueService);
    await service.enqueue(makeQueueEntry());

    const ok = await service.updateLocal('e1', { amountG: 200, mealType: 'lunch' });

    expect(ok).toBe(true);
    expect(service.entries()).toHaveLength(1);
    expect(service.entries()[0]).toEqual(
      expect.objectContaining({ amountG: 200, mealType: 'lunch' }),
    );
  });

  it('updateLocal returns false for an unknown id', async () => {
    const service = TestBed.inject(EntryQueueService);
    const ok = await service.updateLocal('missing', { amountG: 1, mealType: 'snack' });
    expect(ok).toBe(false);
  });

  it('removeLocal deletes without a sync attempt', async () => {
    const service = TestBed.inject(EntryQueueService);
    await service.enqueue(makeQueueEntry());

    const ok = await service.removeLocal('e1');

    expect(ok).toBe(true);
    expect(service.getById('e1')).toBeUndefined();
  });

  it('markSynced removes the entry permanently', async () => {
    const service = TestBed.inject(EntryQueueService);
    await service.enqueue(makeQueueEntry());

    await service.markSynced('e1');

    expect(service.entries()).toEqual([]);
  });

  it('setSyncState updates syncState and attempts', async () => {
    const service = TestBed.inject(EntryQueueService);
    await service.enqueue(makeQueueEntry());

    await service.setSyncState('e1', 'failed', 3);

    expect(service.getById('e1')).toEqual(
      expect.objectContaining({ syncState: 'failed', attempts: 3 }),
    );
  });

  it('setSyncState is a no-op for an unknown id', async () => {
    const service = TestBed.inject(EntryQueueService);
    await expect(service.setSyncState('missing', 'failed', 1)).resolves.toBeUndefined();
  });
});
