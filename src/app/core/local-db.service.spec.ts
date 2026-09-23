import { TestBed } from '@angular/core/testing';
import { LOCAL_DB_NAME, LocalDbService } from './local-db.service';

const TEST_STORE = 'entry-queue';

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe('LocalDbService (natives indexedDB, ADR-0016 Punkt 2)', () => {
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

  it('put/get roundtrips a value in a keyPath store', async () => {
    const service = TestBed.inject(LocalDbService);

    await service.put(TEST_STORE, { id: 'e1', amountG: 150 });
    const result = await service.get<{ id: string; amountG: number }>(TEST_STORE, 'e1');

    expect(result).toEqual({ id: 'e1', amountG: 150 });
  });

  it('getAll returns every stored row', async () => {
    const service = TestBed.inject(LocalDbService);

    await service.put(TEST_STORE, { id: 'e1', amountG: 150 });
    await service.put(TEST_STORE, { id: 'e2', amountG: 80 });

    const result = await service.getAll<{ id: string; amountG: number }>(TEST_STORE);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['e1', 'e2']);
  });

  it('delete removes a row', async () => {
    const service = TestBed.inject(LocalDbService);

    await service.put(TEST_STORE, { id: 'e1', amountG: 150 });
    await service.delete(TEST_STORE, 'e1');

    expect(await service.get(TEST_STORE, 'e1')).toBeUndefined();
  });

  it('put with an explicit key works for stores without a keyPath (snapshot stores)', async () => {
    const service = TestBed.inject(LocalDbService);

    await service.put('day-snapshot', { date: '2026-09-22' }, 'current');
    const result = await service.get<{ date: string }>('day-snapshot', 'current');

    expect(result).toEqual({ date: '2026-09-22' });
  });

  it('persists data across service instances within the same database (survives "app restart")', async () => {
    const first = TestBed.inject(LocalDbService);
    await first.put(TEST_STORE, { id: 'e1', amountG: 150 });
    await first.close();

    TestBed.resetTestingModule();
    const second = TestBed.inject(LocalDbService);

    expect(await second.get(TEST_STORE, 'e1')).toEqual({ id: 'e1', amountG: 150 });
  });
});
