import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';
import { WeightLogsService } from './weight-logs.service';

describe('WeightLogsService (ADR-0019)', () => {
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

    const service = TestBed.inject(WeightLogsService);
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

    const service = TestBed.inject(WeightLogsService);
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

    const service = TestBed.inject(WeightLogsService);
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

    const service = TestBed.inject(WeightLogsService);
    const result = await service.upsertWeightLog('2026-09-22', 80.5);

    expect(result).toEqual({ success: false, message: 'Nicht angemeldet.' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('deleteWeightLog deletes by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    configureWithUserId('u1', from);

    const service = TestBed.inject(WeightLogsService);
    const result = await service.deleteWeightLog('w1');

    expect(result).toEqual({ success: true });
    expect(eq).toHaveBeenCalledWith('id', 'w1');
  });

  it('bumps revision after a successful upsert and delete, not after a failed one', async () => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'x' } });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert, delete: vi.fn().mockReturnValue({ eq }) });
    configureWithUserId('u1', from);

    const service = TestBed.inject(WeightLogsService);
    expect(service.revision()).toBe(0);

    await service.upsertWeightLog('2026-09-22', 80.5);
    expect(service.revision()).toBe(1);

    await service.upsertWeightLog('2026-09-22', 80.5);
    expect(service.revision()).toBe(1);

    await service.deleteWeightLog('w1');
    expect(service.revision()).toBe(2);
  });
});
