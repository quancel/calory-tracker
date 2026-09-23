import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../core/supabase.service';
import { LOCAL_DB_NAME, LocalDbService } from '../core/local-db.service';
import { DiaryService } from './diary.service';

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function makeEntriesQuery(response: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(response),
      }),
    }),
  };
}

function makeGoalsQuery(response: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(response),
    }),
  };
}

describe('DiaryService.loadDay', () => {
  let entriesResponse: { data: unknown; error: unknown };
  let goalResponse: { data: unknown; error: unknown };
  let from: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDatabase();
    entriesResponse = { data: [], error: null };
    goalResponse = { data: null, error: null };

    from = vi.fn().mockImplementation((table: string) => {
      if (table === 'entries') return makeEntriesQuery(entriesResponse);
      if (table === 'goals') return makeGoalsQuery(goalResponse);
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

  it('maps embedded entries and goal from snake_case to the domain model', async () => {
    entriesResponse.data = [
      {
        id: 'e1',
        meal_type: 'breakfast',
        amount_g: 150,
        created_at: '2026-09-20T07:00:00Z',
        foods: {
          id: 'f1',
          name: 'Haferflocken',
          kcal_100g: 370,
          protein_100g: 13,
          carbs_100g: 60,
          fat_100g: 7,
        },
      },
    ];
    goalResponse.data = { kcal: 2200, protein_g: 120, carbs_g: 250, fat_g: 70 };

    const service = TestBed.inject(DiaryService);
    const result = await service.loadDay('2026-09-20');

    expect(result).toEqual({
      success: true,
      entries: [
        {
          id: 'e1',
          mealType: 'breakfast',
          amountG: 150,
          createdAt: '2026-09-20T07:00:00Z',
          syncState: 'synced',
          food: {
            id: 'f1',
            name: 'Haferflocken',
            kcal100g: 370,
            proteinG100g: 13,
            carbsG100g: 60,
            fatG100g: 7,
          },
        },
      ],
      goal: { kcal: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
    });
  });

  it('returns goal: null when no goals row exists', async () => {
    goalResponse.data = null;

    const service = TestBed.inject(DiaryService);
    const result = await service.loadDay('2026-09-20');

    expect(result).toEqual({ success: true, entries: [], goal: null });
  });

  it('returns a generic error message when the entries query fails', async () => {
    entriesResponse = { data: null, error: { message: 'network down' } };
    from.mockImplementation((table: string) => {
      if (table === 'entries') return makeEntriesQuery(entriesResponse);
      return makeGoalsQuery(goalResponse);
    });

    const service = TestBed.inject(DiaryService);
    const result = await service.loadDay('2026-09-20');

    expect(result).toEqual({ success: false, message: 'Tageswerte konnten nicht geladen werden.' });
  });

  it('skips an entry without an embedded food instead of inventing nutrition values', async () => {
    entriesResponse.data = [
      {
        id: 'e1',
        meal_type: 'lunch',
        amount_g: 100,
        created_at: '2026-09-20T12:00:00Z',
        foods: null,
      },
    ];

    const service = TestBed.inject(DiaryService);
    const result = await service.loadDay('2026-09-20');

    expect(result).toEqual({ success: true, entries: [], goal: null });
  });

  describe('Lesecache (ADR-0016 Punkt 8)', () => {
    it('writes a day+goal snapshot to IndexedDB after a successful load', async () => {
      entriesResponse.data = [
        {
          id: 'e1',
          meal_type: 'breakfast',
          amount_g: 150,
          created_at: '2026-09-20T07:00:00Z',
          foods: {
            id: 'f1',
            name: 'Haferflocken',
            kcal_100g: 370,
            protein_100g: 13,
            carbs_100g: 60,
            fat_100g: 7,
          },
        },
      ];
      goalResponse.data = { kcal: 2200, protein_g: 120, carbs_g: 250, fat_g: 70 };

      const service = TestBed.inject(DiaryService);
      await service.loadDay('2026-09-20');

      const localDb = TestBed.inject(LocalDbService);
      const snapshot = await localDb.get<{ date: string }>('day-snapshot', 'current');

      expect(snapshot).toEqual(
        expect.objectContaining({
          date: '2026-09-20',
          goal: { kcal: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
        }),
      );
    });

    it('falls back to the snapshot for the SAME date instead of an error when the load fails', async () => {
      const localDb = TestBed.inject(LocalDbService);
      await localDb.put(
        'day-snapshot',
        {
          date: '2026-09-20',
          entries: [
            {
              id: 'cached-1',
              mealType: 'lunch',
              amountG: 100,
              createdAt: '2026-09-20T12:00:00Z',
              syncState: 'synced',
              food: {
                id: 'f9',
                name: 'Reis',
                kcal100g: 130,
                proteinG100g: 2.7,
                carbsG100g: 28,
                fatG100g: 0.3,
              },
            },
          ],
          goal: null,
        },
        'current',
      );

      entriesResponse = { data: null, error: { message: 'network down' } };
      from.mockImplementation((table: string) => {
        if (table === 'entries') return makeEntriesQuery(entriesResponse);
        return makeGoalsQuery(goalResponse);
      });

      const service = TestBed.inject(DiaryService);
      const result = await service.loadDay('2026-09-20');

      expect(result.success).toBe(true);
      expect(result.success && result.entries[0].id).toBe('cached-1');
    });

    it('does NOT use a snapshot for a DIFFERENT date — regular error state instead', async () => {
      const localDb = TestBed.inject(LocalDbService);
      await localDb.put('day-snapshot', { date: '2026-09-19', entries: [], goal: null }, 'current');

      entriesResponse = { data: null, error: { message: 'network down' } };
      from.mockImplementation((table: string) => {
        if (table === 'entries') return makeEntriesQuery(entriesResponse);
        return makeGoalsQuery(goalResponse);
      });

      const service = TestBed.inject(DiaryService);
      const result = await service.loadDay('2026-09-20');

      expect(result).toEqual({
        success: false,
        message: 'Tageswerte konnten nicht geladen werden.',
      });
    });
  });
});

describe('DiaryService.loadGoal', () => {
  let goalResponse: { data: unknown; error: unknown };
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    goalResponse = { data: null, error: null };

    from = vi.fn().mockImplementation((table: string) => {
      if (table === 'goals') return makeGoalsQuery(goalResponse);
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
  });

  it('maps the goal row from snake_case to the domain model', async () => {
    goalResponse.data = { kcal: 2200, protein_g: 120, carbs_g: 250, fat_g: 70 };

    const service = TestBed.inject(DiaryService);
    const result = await service.loadGoal();

    expect(result).toEqual({
      success: true,
      goal: { kcal: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
    });
  });

  it('returns goal: null when no goals row exists', async () => {
    const service = TestBed.inject(DiaryService);
    const result = await service.loadGoal();

    expect(result).toEqual({ success: true, goal: null });
  });

  it('returns a generic error message when the query fails', async () => {
    goalResponse = { data: null, error: { message: 'network down' } };
    from.mockImplementation(() => makeGoalsQuery(goalResponse));

    const service = TestBed.inject(DiaryService);
    const result = await service.loadGoal();

    expect(result).toEqual({ success: false, message: 'Ziel konnte nicht geladen werden.' });
  });
});

describe('DiaryService.loadCopySource (ADR-0013 Punkt 6 — Kopiervorlage „gestern kopieren")', () => {
  let entriesResponse: { data: unknown; error: unknown };
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    entriesResponse = { data: [], error: null };

    from = vi.fn().mockImplementation((table: string) => {
      if (table === 'entries') return makeEntriesQuery(entriesResponse);
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
  });

  it('maps id/meal_type/amount_g/food_id from snake_case, without embedded foods', async () => {
    entriesResponse.data = [
      { id: 'e1', meal_type: 'breakfast', amount_g: 150, food_id: 'f1' },
      { id: 'e2', meal_type: 'lunch', amount_g: 80, food_id: 'f2' },
    ];

    const service = TestBed.inject(DiaryService);
    const result = await service.loadCopySource('2026-09-20');

    expect(from).toHaveBeenCalledWith('entries');
    expect(result).toEqual({
      success: true,
      entries: [
        { id: 'e1', mealType: 'breakfast', amountG: 150, foodId: 'f1' },
        { id: 'e2', mealType: 'lunch', amountG: 80, foodId: 'f2' },
      ],
    });
  });

  it('returns an empty list when the previous day has no entries', async () => {
    const service = TestBed.inject(DiaryService);
    const result = await service.loadCopySource('2026-09-20');

    expect(result).toEqual({ success: true, entries: [] });
  });

  it('returns a generic error message when the query fails', async () => {
    entriesResponse = { data: null, error: { message: 'network down' } };
    from.mockImplementation(() => makeEntriesQuery(entriesResponse));

    const service = TestBed.inject(DiaryService);
    const result = await service.loadCopySource('2026-09-20');

    expect(result).toEqual({
      success: false,
      message: 'Kopiervorlage konnte nicht geladen werden.',
    });
  });
});
