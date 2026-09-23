import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { todayKey } from '../core/date.calculations';
import { GoalsService } from './goals.service';
import { GoalsStore } from './goals.store';
import { WeightStore } from './weight.store';

describe('WeightStore', () => {
  let loadWeightLogs: ReturnType<typeof vi.fn>;
  let loadIntake: ReturnType<typeof vi.fn>;
  let upsertWeightLog: ReturnType<typeof vi.fn>;
  let goalsStoreStub: { savedValue: ReturnType<typeof vi.fn>; setInput: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let targetWeightKg: ReturnType<typeof signal<number | null>>;

  beforeEach(() => {
    // Fixiertes "heute" — `WeightStore` berechnet Fenster/Vorschlag intern
    // über `todayKey()` (core/date.calculations.ts) ohne Injektionspunkt;
    // ohne Fixierung wären diese Tests vom tatsächlichen Ausführungsdatum
    // abhängig und irgendwann stillschweigend falsch.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 22, 12, 0, 0));

    loadWeightLogs = vi.fn().mockResolvedValue({ success: true, logs: [] });
    loadIntake = vi.fn().mockResolvedValue({ success: true, days: [] });
    upsertWeightLog = vi.fn().mockResolvedValue({ success: true });
    targetWeightKg = signal<number | null>(75);

    goalsStoreStub = {
      savedValue: vi.fn(() => targetWeightKg),
      setInput: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GoalsService,
          useValue: { loadWeightLogs, loadIntake, upsertWeightLog, deleteWeightLog: vi.fn() },
        },
        { provide: GoalsStore, useValue: goalsStoreStub },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in loading state until load() resolves', async () => {
    const store = TestBed.inject(WeightStore);
    expect(store.loading()).toBe(true);

    await store.load();

    expect(store.loading()).toBe(false);
    expect(store.loadError()).toBeNull();
  });

  it('loads weight logs (90-day window) and intake (28-day window) in parallel', async () => {
    const store = TestBed.inject(WeightStore);
    await store.load();

    expect(loadWeightLogs).toHaveBeenCalledTimes(1);
    expect(loadIntake).toHaveBeenCalledTimes(1);
    const [chartStart, chartEnd] = loadWeightLogs.mock.calls[0];
    const [trendStart, trendEnd] = loadIntake.mock.calls[0];
    expect(chartEnd).toBe(trendEnd);
    expect(chartStart < trendStart).toBe(true); // 90-Tage-Fenster beginnt früher als das 28-Tage-Fenster
  });

  it('sets a load error when loading the weight logs fails', async () => {
    loadWeightLogs.mockResolvedValue({
      success: false,
      message: 'Gewichtseinträge konnten nicht geladen werden.',
    });
    const store = TestBed.inject(WeightStore);
    await store.load();

    expect(store.loadError()).toBe('Gewichtseinträge konnten nicht geladen werden.');
  });

  describe('hasEntries / suggestion state priority', () => {
    it('reports "no-entries" when there are no logs', async () => {
      const store = TestBed.inject(WeightStore);
      await store.load();

      expect(store.hasEntries()).toBe(false);
      expect(store.suggestion()).toBe('no-entries');
    });

    it('reports "no-target" when a target weight is not set, even with entries', async () => {
      targetWeightKg.set(null);
      loadWeightLogs.mockResolvedValue({
        success: true,
        logs: [{ id: 'w1', dateKey: '2026-09-22', weightKg: 80 }],
      });
      const store = TestBed.inject(WeightStore);
      await store.load();

      expect(store.hasEntries()).toBe(true);
      expect(store.suggestion()).toBe('no-target');
    });
  });

  describe('submit / replace confirmation', () => {
    it('saves directly when no entry exists for today', async () => {
      const store = TestBed.inject(WeightStore);
      await store.load();

      store.setWeightInput('80.5');
      await store.submit();

      expect(upsertWeightLog).toHaveBeenCalledTimes(1);
      expect(store.pendingReplace()).toBeNull();
    });

    it('opens a pending replace instead of saving when today already has a value', async () => {
      const dateKey = todayKey();
      loadWeightLogs.mockResolvedValue({
        success: true,
        logs: [{ id: 'w1', dateKey: dateKey, weightKg: 79 }],
      });
      const store = TestBed.inject(WeightStore);
      await store.load();

      store.setWeightInput('80.5');
      await store.submit();

      expect(upsertWeightLog).not.toHaveBeenCalled();
      expect(store.pendingReplace()).toEqual({ existingWeightKg: 79, newWeightKg: 80.5 });
    });

    it('confirmReplace performs the save and clears the pending state', async () => {
      const dateKey = todayKey();
      loadWeightLogs.mockResolvedValue({
        success: true,
        logs: [{ id: 'w1', dateKey: dateKey, weightKg: 79 }],
      });
      const store = TestBed.inject(WeightStore);
      await store.load();

      store.setWeightInput('80.5');
      await store.submit();
      await store.confirmReplace();

      expect(upsertWeightLog).toHaveBeenCalledWith(dateKey, 80.5);
      expect(store.pendingReplace()).toBeNull();
    });

    it('cancelReplace clears the pending state without saving', async () => {
      const dateKey = todayKey();
      loadWeightLogs.mockResolvedValue({
        success: true,
        logs: [{ id: 'w1', dateKey: dateKey, weightKg: 79 }],
      });
      const store = TestBed.inject(WeightStore);
      await store.load();

      store.setWeightInput('80.5');
      await store.submit();
      store.cancelReplace();

      expect(upsertWeightLog).not.toHaveBeenCalled();
      expect(store.pendingReplace()).toBeNull();
    });
  });

  describe('adoptSuggestion / dismissSuggestion (ADR-0017 Punkt 5/6)', () => {
    it('adopt writes the suggested kcal into the goals kcal field via GoalsStore, visibly', async () => {
      loadWeightLogs.mockResolvedValue({
        success: true,
        logs: [
          { id: 'w1', dateKey: '2026-08-22', weightKg: 85 },
          { id: 'w2', dateKey: '2026-08-29', weightKg: 84 },
          { id: 'w3', dateKey: '2026-09-05', weightKg: 83 },
          { id: 'w4', dateKey: '2026-09-12', weightKg: 82 },
          { id: 'w5', dateKey: '2026-09-22', weightKg: 80 },
        ],
      });
      loadIntake.mockResolvedValue({
        success: true,
        days: Array.from({ length: 14 }, (_, i) => ({
          dateKey: `2026-09-${String(1 + i).padStart(2, '0')}`,
          kcal: 2400,
        })),
      });

      const store = TestBed.inject(WeightStore);
      await store.load();

      const suggestion = store.suggestion();
      expect(suggestion).toMatchObject({ kind: 'suggestion' });
      if (typeof suggestion !== 'object') throw new Error('expected a suggestion');

      await store.adoptSuggestion();

      expect(goalsStoreStub.setInput).toHaveBeenCalledWith('kcal', `${suggestion.kcal}`);
      expect(goalsStoreStub.save).toHaveBeenCalledWith('kcal');
    });

    it('dismiss hides the card for the current session until the suggestion changes', async () => {
      loadWeightLogs.mockResolvedValue({
        success: true,
        logs: [
          { id: 'w1', dateKey: '2026-08-22', weightKg: 85 },
          { id: 'w2', dateKey: '2026-08-29', weightKg: 84 },
          { id: 'w3', dateKey: '2026-09-05', weightKg: 83 },
          { id: 'w4', dateKey: '2026-09-12', weightKg: 82 },
          { id: 'w5', dateKey: '2026-09-22', weightKg: 80 },
        ],
      });
      loadIntake.mockResolvedValue({
        success: true,
        days: Array.from({ length: 14 }, (_, i) => ({
          dateKey: `2026-09-${String(1 + i).padStart(2, '0')}`,
          kcal: 2400,
        })),
      });

      const store = TestBed.inject(WeightStore);
      await store.load();

      expect(store.visibleSuggestion()).toMatchObject({ kind: 'suggestion' });

      store.dismissSuggestion();
      expect(store.visibleSuggestion()).toBeNull();

      // Ein geänderter Vorschlag macht die Karte wieder sichtbar — Zielgewicht
      // gleich dem aktuellen Gewicht (80) wechselt in den Halten-Fall und
      // damit zwangsläufig auf einen anderen kcal-Wert als zuvor (Ziel 75,
      // ~5 kg Differenz, gedeckelter Defizit-Vorschlag).
      targetWeightKg.set(80);
      expect(store.visibleSuggestion()).toMatchObject({ kind: 'suggestion', holding: true });
    });
  });
});
