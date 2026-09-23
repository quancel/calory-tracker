import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../core/supabase.service';
import { GoalsService } from './goals.service';

function makeGoalsSelectQuery(response: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(response),
    }),
  };
}

describe('GoalsService.loadGoal', () => {
  let response: { data: unknown; error: unknown };
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    response = { data: null, error: null };
    from = vi.fn().mockImplementation((table: string) => {
      if (table === 'goals') return makeGoalsSelectQuery(response);
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { from }, userId: () => 'u1' } },
      ],
    });
  });

  it('maps a partially filled row from snake_case to the domain model, including a set target weight', () => {
    response.data = { kcal: 0, protein_g: 120, carbs_g: 0, fat_g: 70, target_weight_kg: 72.5 };

    return TestBed.inject(GoalsService)
      .loadGoal()
      .then((result) => {
        expect(result).toEqual({
          success: true,
          goal: { kcal: 0, carbsG: 0, proteinG: 120, fatG: 70, targetWeightKg: 72.5 },
        });
      });
  });

  it('maps a null target_weight_kg to targetWeightKg: null ("kein Zielgewicht gesetzt")', async () => {
    response.data = { kcal: 2200, protein_g: 120, carbs_g: 200, fat_g: 70, target_weight_kg: null };

    const service = TestBed.inject(GoalsService);
    const result = await service.loadGoal();

    expect(result).toEqual({
      success: true,
      goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70, targetWeightKg: null },
    });
  });

  it('returns goal: null when no row exists yet', async () => {
    const service = TestBed.inject(GoalsService);
    const result = await service.loadGoal();

    expect(result).toEqual({ success: true, goal: null });
  });

  it('returns a generic error message when the query fails', async () => {
    response = { data: null, error: { message: 'network down' } };
    from.mockImplementation(() => makeGoalsSelectQuery(response));

    const service = TestBed.inject(GoalsService);
    const result = await service.loadGoal();

    expect(result).toEqual({ success: false, message: 'Ziele konnten nicht geladen werden.' });
  });
});

describe('GoalsService.saveField', () => {
  let upsertResponse: { error: unknown };
  let upsert: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upsertResponse = { error: null };
    upsert = vi.fn().mockImplementation(() => Promise.resolve(upsertResponse));
    from = vi.fn().mockReturnValue({ upsert });
  });

  function configureWithUserId(userId: string | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { from }, userId: () => userId } },
      ],
    });
  }

  it('upserts exactly one column plus user_id/updated_at, onConflict user_id', async () => {
    configureWithUserId('u1');
    const service = TestBed.inject(GoalsService);

    const result = await service.saveField('kcal', 2200);

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('goals');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'user_id' });
    expect(payload).toMatchObject({ user_id: 'u1', kcal: 2200 });
    expect(Object.keys(payload).sort()).toEqual(['kcal', 'updated_at', 'user_id']);
  });

  it('maps a macro field to its snake_case column', async () => {
    configureWithUserId('u1');
    const service = TestBed.inject(GoalsService);

    await service.saveField('carbsG', 0);

    const [payload] = upsert.mock.calls[0];
    expect(payload).toMatchObject({ carbs_g: 0 });
  });

  it('returns an error without calling the client when no user is signed in', async () => {
    configureWithUserId(null);
    const service = TestBed.inject(GoalsService);

    const result = await service.saveField('kcal', 2200);

    expect(result).toEqual({ success: false, message: 'Nicht angemeldet.' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns a generic error message when the upsert fails', async () => {
    configureWithUserId('u1');
    upsertResponse = { error: { message: 'constraint violation' } };
    const service = TestBed.inject(GoalsService);

    const result = await service.saveField('kcal', 2200);

    expect(result).toEqual({ success: false, message: 'Ziel konnte nicht gespeichert werden.' });
  });

  it('upserts target_weight_kg: null when the optional field is cleared (ADR-0018 Punkt 2)', async () => {
    configureWithUserId('u1');
    const service = TestBed.inject(GoalsService);

    await service.saveField('targetWeightKg', null);

    const [payload] = upsert.mock.calls[0];
    expect(payload).toMatchObject({ target_weight_kg: null });
  });

  it('upserts target_weight_kg with a set value', async () => {
    configureWithUserId('u1');
    const service = TestBed.inject(GoalsService);

    await service.saveField('targetWeightKg', 72.5);

    const [payload] = upsert.mock.calls[0];
    expect(payload).toMatchObject({ target_weight_kg: 72.5 });
  });
});

describe('GoalsService — weight_logs (ADR-0017 Punkt 2)', () => {
  function configureWithUserId(userId: string | null, from: ReturnType<typeof vi.fn>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { from }, userId: () => userId } },
      ],
    });
  }

  it('loadWeightLogs maps snake_case rows within the requested range', async () => {
    const gte = vi.fn();
    const lte = vi.fn();
    const select = vi.fn().mockReturnValue({
      gte: gte.mockReturnValue({
        lte: lte.mockResolvedValue({
          data: [{ id: 'w1', date: '2026-09-10', weight_kg: 80.5 }],
          error: null,
        }),
      }),
    });
    const from = vi.fn().mockReturnValue({ select });
    configureWithUserId('u1', from);

    const service = TestBed.inject(GoalsService);
    const result = await service.loadWeightLogs('2026-08-01', '2026-09-22');

    expect(from).toHaveBeenCalledWith('weight_logs');
    expect(gte).toHaveBeenCalledWith('date', '2026-08-01');
    expect(lte).toHaveBeenCalledWith('date', '2026-09-22');
    expect(result).toEqual({
      success: true,
      logs: [{ id: 'w1', dateKey: '2026-09-10', weightKg: 80.5 }],
    });
  });

  it('loadWeightLogs returns a generic error message on failure', async () => {
    const select = vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnValue({
        lte: vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } }),
      }),
    });
    const from = vi.fn().mockReturnValue({ select });
    configureWithUserId('u1', from);

    const service = TestBed.inject(GoalsService);
    const result = await service.loadWeightLogs('2026-08-01', '2026-09-22');

    expect(result).toEqual({
      success: false,
      message: 'Gewichtseinträge konnten nicht geladen werden.',
    });
  });

  it('upsertWeightLog writes user_id/date/weight_kg with onConflict user_id,date', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    configureWithUserId('u1', from);

    const service = TestBed.inject(GoalsService);
    const result = await service.upsertWeightLog('2026-09-22', 80.5);

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('weight_logs');
    const [payload, options] = upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'user_id,date' });
    expect(payload).toMatchObject({ user_id: 'u1', date: '2026-09-22', weight_kg: 80.5 });
  });

  it('upsertWeightLog returns an error without calling the client when no user is signed in', async () => {
    const upsert = vi.fn();
    const from = vi.fn().mockReturnValue({ upsert });
    configureWithUserId(null, from);

    const service = TestBed.inject(GoalsService);
    const result = await service.upsertWeightLog('2026-09-22', 80.5);

    expect(result).toEqual({ success: false, message: 'Nicht angemeldet.' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('deleteWeightLog deletes by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    configureWithUserId('u1', from);

    const service = TestBed.inject(GoalsService);
    const result = await service.deleteWeightLog('w1');

    expect(result).toEqual({ success: true });
    expect(eq).toHaveBeenCalledWith('id', 'w1');
  });

  it('loadIntake sums live kcal per day and skips entries without an embedded food', async () => {
    const gte = vi.fn();
    const lte = vi.fn();
    const select = vi.fn().mockReturnValue({
      gte: gte.mockReturnValue({
        lte: lte.mockResolvedValue({
          data: [
            { date: '2026-09-10', amount_g: 100, foods: { kcal_100g: 200 } },
            { date: '2026-09-10', amount_g: 50, foods: { kcal_100g: 200 } },
            { date: '2026-09-11', amount_g: 100, foods: null },
          ],
          error: null,
        }),
      }),
    });
    const from = vi.fn().mockReturnValue({ select });
    configureWithUserId('u1', from);

    const service = TestBed.inject(GoalsService);
    const result = await service.loadIntake('2026-08-25', '2026-09-22');

    expect(result).toEqual({ success: true, days: [{ dateKey: '2026-09-10', kcal: 300 }] });
  });
});
