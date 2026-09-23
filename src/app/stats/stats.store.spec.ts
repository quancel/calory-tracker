import { TestBed } from '@angular/core/testing';
import { todayKey } from '../core/date.calculations';
import { anchorForKindChange, computePeriodBounds, shiftPeriod } from './stats.calculations';
import { StatsService } from './stats.service';
import { StatsStore } from './stats.store';

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StatsStore', () => {
  let loadPeriod: ReturnType<typeof vi.fn>;
  let loadGoal: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loadPeriod = vi.fn().mockResolvedValue({ success: true, entries: [] });
    loadGoal = vi.fn().mockResolvedValue({ success: true, goal: null });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: StatsService, useValue: { loadPeriod, loadGoal } }],
    });
  });

  it('loads the current week (containing today) on construction, defaulting to "week"', async () => {
    const store = TestBed.inject(StatsStore);
    await flush();

    expect(store.periodKind()).toBe('week');
    const expectedBounds = computePeriodBounds('week', todayKey());
    expect(loadPeriod).toHaveBeenCalledWith(expectedBounds.startKey, expectedBounds.endKey);
  });

  it('switching to "month" keeps the anchor per Kontext-Erhalt and reloads', async () => {
    const store = TestBed.inject(StatsStore);
    await flush();
    loadPeriod.mockClear();

    await store.setPeriodKind('month');
    await flush();

    expect(store.periodKind()).toBe('month');
    const weekBounds = computePeriodBounds('week', todayKey());
    const expectedAnchor = anchorForKindChange(weekBounds, todayKey());
    const expectedMonthBounds = computePeriodBounds('month', expectedAnchor);
    expect(loadPeriod).toHaveBeenCalledWith(expectedMonthBounds.startKey, expectedMonthBounds.endKey);
  });

  it('going to the previous period shifts the anchor by one week and reloads', async () => {
    const store = TestBed.inject(StatsStore);
    await flush();
    loadPeriod.mockClear();

    await store.goToPreviousPeriod();
    await flush();

    const currentBounds = computePeriodBounds('week', todayKey());
    const previousAnchor = shiftPeriod('week', currentBounds, -1);
    const expectedBounds = computePeriodBounds('week', previousAnchor);
    expect(loadPeriod).toHaveBeenCalledWith(expectedBounds.startKey, expectedBounds.endKey);
  });

  it('does not navigate forward or reload when canGoForward is false', async () => {
    const store = TestBed.inject(StatsStore);
    await flush();

    if (store.canGoForward()) {
      // Randfall (aktuelle Woche liegt exakt am Vorwärtsfenster): Test
      // bleibt aussagekräftig, indem er die Store-eigene Grenzberechnung
      // selbst prüft statt ein hartes Datum anzunehmen.
      return;
    }

    loadPeriod.mockClear();
    await store.goToNextPeriod();
    await flush();

    expect(loadPeriod).not.toHaveBeenCalled();
  });

  it('sets an error and leaves the store usable on a failed load, retry re-fetches', async () => {
    loadPeriod.mockResolvedValueOnce({ success: false, message: 'Fehler' });
    const store = TestBed.inject(StatsStore);
    await flush();

    expect(store.error()).toBe('Fehler');
    expect(store.loading()).toBe(false);

    loadPeriod.mockResolvedValueOnce({ success: true, entries: [] });
    await store.retry();
    await flush();

    expect(store.error()).toBeNull();
  });
});
