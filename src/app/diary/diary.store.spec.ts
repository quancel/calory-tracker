import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntriesService } from '../core/entries.service';
import { EntryQueueService, type QueueEntry } from '../core/entry-queue.service';
import { LOCAL_DB_NAME, LocalDbService } from '../core/local-db.service';
import { addDaysToKey, todayKey } from '../core/date.calculations';
import { DiaryService } from './diary.service';
import { DiaryStore } from './diary.store';
import type { DiaryEntry } from './models/diary.model';

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/**
 * Löst den `effect`-Lauf aus, der den (Neu-)Ladevorgang startet (ADR-0009
 * Punkt 4, `DiaryStore` reagiert auf `entriesService.revision`), und wartet
 * anschließend zwei Mikrotasks auf den asynchronen Service-Aufruf.
 */
async function flush(): Promise<void> {
  TestBed.flushEffects();
  await Promise.resolve();
  await Promise.resolve();
}

function makeEntry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: overrides.id ?? 'e1',
    mealType: overrides.mealType ?? 'breakfast',
    amountG: overrides.amountG ?? 100,
    createdAt: overrides.createdAt ?? '2026-09-20T08:00:00Z',
    syncState: overrides.syncState ?? 'synced',
    food: overrides.food ?? {
      id: 'f1',
      name: 'Haferflocken',
      kcal100g: 370,
      proteinG100g: 13,
      carbsG100g: 60,
      fatG100g: 7,
    },
  };
}

function makeQueueEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'q1',
    date: overrides.date ?? todayKey(),
    mealType: 'breakfast',
    amountG: 80,
    foodId: 'f2',
    food: {
      id: 'f2',
      name: 'Banane',
      kcal100g: 89,
      proteinG100g: 1.1,
      carbsG100g: 23,
      fatG100g: 0.3,
      source: 'manual',
    },
    syncState: 'pending',
    attempts: 0,
    createdAt: 2000,
    ...overrides,
  };
}

describe('DiaryStore', () => {
  let loadDay: ReturnType<typeof vi.fn>;
  let loadGoal: ReturnType<typeof vi.fn>;
  let loadCopySource: ReturnType<typeof vi.fn>;
  let createEntries: ReturnType<typeof vi.fn>;
  let deleteEntries: ReturnType<typeof vi.fn>;

  let retryEntry: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDatabase();
    loadDay = vi.fn().mockResolvedValue({ success: true, entries: [], goal: null });
    loadGoal = vi.fn().mockResolvedValue({ success: true, goal: null });
    loadCopySource = vi.fn().mockResolvedValue({ success: true, entries: [] });
    createEntries = vi.fn().mockResolvedValue({ success: true, ids: [] });
    deleteEntries = vi.fn().mockResolvedValue({ success: true });
    retryEntry = vi.fn().mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DiaryService, useValue: { loadDay, loadGoal, loadCopySource } },
        {
          provide: EntriesService,
          useValue: { revision: signal(0), createEntries, deleteEntries, retryEntry },
        },
      ],
    });
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('loads the current (today) date on construction', async () => {
    const store = TestBed.inject(DiaryStore);
    expect(store.currentDate()).toBe(todayKey());

    await flush();

    expect(loadDay).toHaveBeenCalledWith(todayKey());
    expect(store.loading()).toBe(false);
  });

  it('goToPreviousDay is unbounded', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();

    const before = store.currentDate();
    await store.goToPreviousDay();

    expect(store.currentDate()).toBe(addDaysToKey(before, -1));
  });

  it('goToNextDay is blocked once maxDate (today + 7) is reached', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();

    for (let i = 0; i < 10; i++) {
      await store.goToNextDay();
    }

    expect(store.currentDate()).toBe(store.maxDate());
    expect(store.canGoForward()).toBe(false);
  });

  it('exposes entries, totals, sections, and error state from the service result', async () => {
    loadDay.mockResolvedValue({
      success: true,
      entries: [makeEntry({ amountG: 200 })],
      goal: { kcal: 2000, proteinG: 100, carbsG: 200, fatG: 60 },
    });

    const store = TestBed.inject(DiaryStore);
    await flush();

    expect(store.isEmpty()).toBe(false);
    expect(store.totals().kcal).toBeCloseTo(740);
    expect(store.sections().find((s) => s.mealType === 'breakfast')?.entries).toHaveLength(1);
    expect(store.kcalProgress().hasGoal).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('sets a generic error message and keeps the date navigable when loading fails', async () => {
    loadDay.mockResolvedValue({
      success: false,
      message: 'Tageswerte konnten nicht geladen werden.',
    });

    const store = TestBed.inject(DiaryStore);
    await flush();

    expect(store.error()).toBe('Tageswerte konnten nicht geladen werden.');
    expect(store.loading()).toBe(false);

    loadDay.mockResolvedValue({ success: true, entries: [], goal: null });
    await store.goToNextDay();

    expect(store.currentDate()).toBe(addDaysToKey(todayKey(), 1));
  });

  it('reloadGoal updates only the goal state, leaving entries/date untouched', async () => {
    loadDay.mockResolvedValue({
      success: true,
      entries: [makeEntry()],
      goal: null,
    });

    const store = TestBed.inject(DiaryStore);
    await flush();

    expect(store.kcalProgress().hasGoal).toBe(false);

    loadGoal.mockResolvedValue({
      success: true,
      goal: { kcal: 2000, proteinG: 100, carbsG: 200, fatG: 60 },
    });
    await store.reloadGoal();

    expect(loadGoal).toHaveBeenCalledTimes(1);
    expect(store.kcalProgress().hasGoal).toBe(true);
    expect(store.sections().find((s) => s.mealType === 'breakfast')?.entries).toHaveLength(1);
  });

  it('reloadGoal leaves the previous goal untouched when the reload fails', async () => {
    loadDay.mockResolvedValue({
      success: true,
      entries: [],
      goal: { kcal: 2000, proteinG: 100, carbsG: 200, fatG: 60 },
    });

    const store = TestBed.inject(DiaryStore);
    await flush();

    expect(store.kcalProgress().hasGoal).toBe(true);

    loadGoal.mockResolvedValue({ success: false, message: 'Ziel konnte nicht geladen werden.' });
    await store.reloadGoal();

    expect(store.kcalProgress().hasGoal).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('reloads the current day whenever entriesService.revision changes (ADR-0009 Punkt 4)', async () => {
    const revision = signal(0);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DiaryService, useValue: { loadDay, loadGoal, loadCopySource } },
        { provide: EntriesService, useValue: { revision, createEntries, deleteEntries } },
      ],
    });

    const store = TestBed.inject(DiaryStore);
    await flush();
    expect(loadDay).toHaveBeenCalledTimes(1);

    revision.set(1);
    await flush();

    expect(loadDay).toHaveBeenCalledTimes(2);
    expect(store.currentDate()).toBe(todayKey());
  });

  it('suggestedMealType delegates to the hour-based calculation', () => {
    const store = TestBed.inject(DiaryStore);
    const result = store.suggestedMealType();
    expect(['breakfast', 'lunch', 'dinner', 'snack']).toContain(result);
  });
});

describe('DiaryStore — „gestern kopieren" (ADR-0013)', () => {
  let loadDay: ReturnType<typeof vi.fn>;
  let loadGoal: ReturnType<typeof vi.fn>;
  let loadCopySource: ReturnType<typeof vi.fn>;
  let createEntries: ReturnType<typeof vi.fn>;
  let deleteEntries: ReturnType<typeof vi.fn>;
  let retryEntry: ReturnType<typeof vi.fn>;

  function copySourceEntries() {
    return [
      { id: 'src-1', mealType: 'breakfast' as const, amountG: 150, foodId: 'f1' },
      { id: 'src-2', mealType: 'lunch' as const, amountG: 80, foodId: 'f2' },
    ];
  }

  beforeEach(async () => {
    await resetDatabase();
    loadDay = vi.fn().mockResolvedValue({ success: true, entries: [], goal: null });
    loadGoal = vi.fn().mockResolvedValue({ success: true, goal: null });
    loadCopySource = vi.fn().mockResolvedValue({ success: true, entries: copySourceEntries() });
    createEntries = vi.fn().mockResolvedValue({ success: true, ids: ['new-1', 'new-2'] });
    deleteEntries = vi.fn().mockResolvedValue({ success: true });
    retryEntry = vi.fn().mockResolvedValue(undefined);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DiaryService, useValue: { loadDay, loadGoal, loadCopySource } },
        {
          provide: EntriesService,
          useValue: { revision: signal(0), createEntries, deleteEntries, retryEntry },
        },
      ],
    });
  });

  afterEach(async () => {
    await TestBed.inject(LocalDbService).close();
  });

  it('loadCopySource is queried for the previous day and drives the global/section counts', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();

    expect(loadCopySource).toHaveBeenCalledWith(addDaysToKey(todayKey(), -1));
    expect(store.copyDayCount()).toBe(2);
    expect(store.canCopyDay()).toBe(true);
    expect(store.copySectionCounts()).toEqual({ breakfast: 1, lunch: 1, dinner: 0, snack: 0 });
  });

  it('the copy trigger stays visible but disabled (count 0) when the previous day has no entries', async () => {
    loadCopySource.mockResolvedValue({ success: true, entries: [] });
    const store = TestBed.inject(DiaryStore);
    await flush();

    expect(store.copyDayCount()).toBe(0);
    expect(store.canCopyDay()).toBe(false);
  });

  it('copyDay creates entries for the whole previous day into the currently shown date and tracks the returned ids', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();

    await store.copyDay();

    expect(createEntries).toHaveBeenCalledWith([
      { foodId: 'f1', amountG: 150, mealType: 'breakfast', date: todayKey() },
      { foodId: 'f2', amountG: 80, mealType: 'lunch', date: todayKey() },
    ]);
    expect(store.globalCopyFeedback()).toEqual({ sourceDateLabel: 'Gestern', count: 2 });
  });

  it("copySection copies only that section's previous-day entries", async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();
    createEntries.mockResolvedValue({ success: true, ids: ['new-1'] });

    await store.copySection('breakfast');

    expect(createEntries).toHaveBeenCalledWith([
      { foodId: 'f1', amountG: 150, mealType: 'breakfast', date: todayKey() },
    ]);
    expect(store.sectionCopyFeedback('breakfast')).toEqual({
      sourceDateLabel: 'Gestern',
      count: 1,
    });
    expect(store.sectionCopyFeedback('lunch')).toBeNull();
  });

  it('a second copyDay call replaces the previous global feedback instead of stacking', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();

    createEntries.mockResolvedValueOnce({ success: true, ids: ['a', 'b'] });
    await store.copyDay();
    expect(store.globalCopyFeedback()?.count).toBe(2);

    createEntries.mockResolvedValueOnce({ success: true, ids: ['c'] });
    await store.copyDay();

    expect(store.globalCopyFeedback()?.count).toBe(1);
  });

  it('confirmUndo deletes exactly the tracked ids and clears the feedback on success', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();
    await store.copyDay();

    await store.confirmUndo('global');

    expect(deleteEntries).toHaveBeenCalledWith(['new-1', 'new-2']);
    expect(store.globalCopyFeedback()).toBeNull();
  });

  it('confirmUndo keeps the feedback when the delete fails', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();
    await store.copyDay();

    deleteEntries.mockResolvedValue({ success: false, message: 'down' });
    await store.confirmUndo('global');

    expect(store.globalCopyFeedback()).not.toBeNull();
  });

  it('dismissFeedback ("x") removes the feedback without deleting anything', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();
    await store.copyDay();

    store.dismissFeedback('global');

    expect(deleteEntries).not.toHaveBeenCalled();
    expect(store.globalCopyFeedback()).toBeNull();
  });

  it('global and per-section feedback are independent contexts', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();

    await store.copyDay();
    await store.copySection('breakfast');

    expect(store.globalCopyFeedback()).not.toBeNull();
    expect(store.sectionCopyFeedback('breakfast')).not.toBeNull();

    store.dismissFeedback('global');

    expect(store.globalCopyFeedback()).toBeNull();
    expect(store.sectionCopyFeedback('breakfast')).not.toBeNull();
  });

  it('changing the displayed date clears all feedback (ADR-0013 Punkt 4)', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();
    await store.copyDay();
    expect(store.globalCopyFeedback()).not.toBeNull();

    await store.goToPreviousDay();

    expect(store.globalCopyFeedback()).toBeNull();
  });

  it('clearAllFeedback empties every context (called from DiaryShellComponent.ngOnDestroy)', async () => {
    const store = TestBed.inject(DiaryStore);
    await flush();
    await store.copyDay();
    await store.copySection('breakfast');

    store.clearAllFeedback();

    expect(store.globalCopyFeedback()).toBeNull();
    expect(store.sectionCopyFeedback('breakfast')).toBeNull();
  });

  it('the revision-triggered reload does not touch the undo feedback (ADR-0013 Punkt 5)', async () => {
    const revision = signal(0);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DiaryService, useValue: { loadDay, loadGoal, loadCopySource } },
        { provide: EntriesService, useValue: { revision, createEntries, deleteEntries } },
      ],
    });

    const store = TestBed.inject(DiaryStore);
    await flush();
    await store.copyDay();
    expect(store.globalCopyFeedback()).not.toBeNull();

    revision.set(1);
    await flush();

    expect(store.globalCopyFeedback()).not.toBeNull();
  });

  it('copyDay/copySection are a no-op without matching previous-day entries', async () => {
    loadCopySource.mockResolvedValue({ success: true, entries: [] });
    const store = TestBed.inject(DiaryStore);
    await flush();

    await store.copyDay();
    await store.copySection('breakfast');

    expect(createEntries).not.toHaveBeenCalled();
  });

  describe('gepufferte Einträge (ADR-0016 Punkt 7 — ein Rechenweg für Liste/Sektionen/Summen)', () => {
    it('mixes a pending queue entry of the displayed day into sections and totals', async () => {
      const store = TestBed.inject(DiaryStore);
      await flush();

      const queue = TestBed.inject(EntryQueueService);
      await queue.enqueue(makeQueueEntry({ date: todayKey(), amountG: 100 }));

      const breakfast = store.sections().find((s) => s.mealType === 'breakfast');
      expect(breakfast?.entries).toHaveLength(1);
      expect(breakfast?.entries[0].syncState).toBe('pending');
      expect(store.totals().kcal).toBeCloseTo(89);
      expect(store.isEmpty()).toBe(false);
    });

    it('does NOT mix a pending queue entry of a different day', async () => {
      const store = TestBed.inject(DiaryStore);
      await flush();

      const queue = TestBed.inject(EntryQueueService);
      await queue.enqueue(makeQueueEntry({ date: addDaysToKey(todayKey(), -1) }));

      expect(store.isEmpty()).toBe(true);
      expect(store.totals().kcal).toBe(0);
    });

    it('retrySync delegates to EntriesService.retryEntry with the given id', async () => {
      const store = TestBed.inject(DiaryStore);
      await flush();

      await store.retrySync('q1');

      expect(retryEntry).toHaveBeenCalledWith('q1');
    });
  });
});
