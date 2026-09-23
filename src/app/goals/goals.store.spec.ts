import { TestBed } from '@angular/core/testing';
import { GoalsService } from './goals.service';
import { GoalsStore } from './goals.store';

describe('GoalsStore', () => {
  let loadGoal: ReturnType<typeof vi.fn>;
  let saveField: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loadGoal = vi.fn().mockResolvedValue({ success: true, goal: null });
    saveField = vi.fn().mockResolvedValue({ success: true });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: GoalsService, useValue: { loadGoal, saveField } }],
    });
  });

  it('starts in loading state until load() resolves', async () => {
    const store = TestBed.inject(GoalsStore);
    expect(store.loading()).toBe(true);

    await store.load();

    expect(store.loading()).toBe(false);
    expect(store.loadError()).toBeNull();
  });

  it('fills each field independently from a partially filled row (0 = kein Ziel gesetzt bleibt sichtbar als 0)', async () => {
    loadGoal.mockResolvedValue({
      success: true,
      goal: { kcal: 2200, carbsG: 0, proteinG: 120, fatG: 70 },
    });

    const store = TestBed.inject(GoalsStore);
    await store.load();

    expect(store.inputValue('kcal')()).toBe('2200');
    expect(store.inputValue('carbsG')()).toBe('0');
    expect(store.inputValue('proteinG')()).toBe('120');
    expect(store.inputValue('fatG')()).toBe('70');
  });

  it('shows empty inputs when no goals row exists yet', async () => {
    const store = TestBed.inject(GoalsStore);
    await store.load();

    expect(store.inputValue('kcal')()).toBe('');
    expect(store.canSave('kcal')()).toBe(false);
  });

  it('sets a load error and leaves fields untouched on failure', async () => {
    loadGoal.mockResolvedValue({ success: false, message: 'Ziele konnten nicht geladen werden.' });

    const store = TestBed.inject(GoalsStore);
    await store.load();

    expect(store.loadError()).toBe('Ziele konnten nicht geladen werden.');
  });

  describe('canSave', () => {
    it('is false for an invalid value', async () => {
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('kcal', '0');
      expect(store.canSave('kcal')()).toBe(false);
    });

    it('is false when the value is unchanged from the last saved value', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70 },
      });
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('kcal', '2200');
      expect(store.canSave('kcal')()).toBe(false);
    });

    it('is true for a valid, changed value — independent of the other three fields', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70 },
      });
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('kcal', '2500');
      expect(store.canSave('kcal')()).toBe(true);
      expect(store.canSave('carbsG')()).toBe(false);
      expect(store.canSave('proteinG')()).toBe(false);
      expect(store.canSave('fatG')()).toBe(false);
    });
  });

  describe('save', () => {
    it('writes exactly the one field and leaves the others untouched (Store-Ebene)', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70 },
      });
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('kcal', '2500');
      await store.save('kcal');

      expect(saveField).toHaveBeenCalledTimes(1);
      expect(saveField).toHaveBeenCalledWith('kcal', 2500);
      expect(store.saveState('kcal')()).toBe('saved');
      expect(store.inputValue('carbsG')()).toBe('200');
      expect(store.saveState('carbsG')()).toBe('idle');
    });

    it('fades the success state back to idle after the feedback window', async () => {
      vi.useFakeTimers();
      try {
        loadGoal.mockResolvedValue({
          success: true,
          goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70 },
        });
        const store = TestBed.inject(GoalsStore);
        await store.load();

        store.setInput('kcal', '2500');
        await store.save('kcal');
        expect(store.saveState('kcal')()).toBe('saved');

        vi.advanceTimersByTime(2400);
        expect(store.saveState('kcal')()).toBe('idle');
      } finally {
        vi.useRealTimers();
      }
    });

    it('on failure: shows the error, reverts the input to the last saved value, other fields unaffected', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70 },
      });
      saveField.mockResolvedValue({ success: false, message: 'Ziel konnte nicht gespeichert werden.' });

      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('kcal', '2500');
      await store.save('kcal');

      expect(store.saveState('kcal')()).toBe('error');
      expect(store.saveErrorMessage('kcal')()).toBe('Ziel konnte nicht gespeichert werden.');
      expect(store.inputValue('kcal')()).toBe('2200');
      expect(store.saveState('carbsG')()).toBe('idle');
      expect(store.inputValue('carbsG')()).toBe('200');
    });

    it('does nothing for an invalid value (defensive guard, button is disabled anyway)', async () => {
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('kcal', '-1');
      await store.save('kcal');

      expect(saveField).not.toHaveBeenCalled();
      expect(store.saveState('kcal')()).toBe('idle');
    });
  });

  describe('targetWeightKg (ADR-0018 Punkt 6 — fünftes Feld, optional)', () => {
    it('cannot be saved before the first load() resolves ("noch nicht geladen" vs. "bewusst geleert")', () => {
      const store = TestBed.inject(GoalsStore);
      // Kein `await store.load()` — bewusst vor dem ersten Ladevorgang.
      expect(store.canSave('targetWeightKg')()).toBe(false);
    });

    it('shows an empty input and disabled save when no goal row exists yet', async () => {
      const store = TestBed.inject(GoalsStore);
      await store.load();

      expect(store.inputValue('targetWeightKg')()).toBe('');
      expect(store.canSave('targetWeightKg')()).toBe(false);
    });

    it('fills the input from a set target weight', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70, targetWeightKg: 72.5 },
      });
      const store = TestBed.inject(GoalsStore);
      await store.load();

      expect(store.inputValue('targetWeightKg')()).toBe('72.5');
      expect(store.savedValue('targetWeightKg')()).toBe(72.5);
    });

    it('allows saving an empty value once a target weight was previously set (removes it)', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70, targetWeightKg: 72.5 },
      });
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('targetWeightKg', '');
      expect(store.canSave('targetWeightKg')()).toBe(true);

      await store.save('targetWeightKg');

      expect(saveField).toHaveBeenCalledWith('targetWeightKg', null);
      expect(store.inputValue('targetWeightKg')()).toBe('');
      expect(store.savedValue('targetWeightKg')()).toBeNull();
    });

    it('does not offer saving an unchanged empty value when no target weight is set', async () => {
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('targetWeightKg', '');
      expect(store.canSave('targetWeightKg')()).toBe(false);
    });

    it('saving the target weight leaves the other four fields untouched', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70, targetWeightKg: null },
      });
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('targetWeightKg', '75');
      await store.save('targetWeightKg');

      expect(saveField).toHaveBeenCalledTimes(1);
      expect(saveField).toHaveBeenCalledWith('targetWeightKg', 75);
      expect(store.saveState('kcal')()).toBe('idle');
      expect(store.inputValue('kcal')()).toBe('2200');
    });
  });

  describe('load (reset on re-activation)', () => {
    it('resets a stale save/error state from a previous visit', async () => {
      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2200, carbsG: 200, proteinG: 120, fatG: 70 },
      });
      const store = TestBed.inject(GoalsStore);
      await store.load();

      store.setInput('kcal', '2500');
      await store.save('kcal');
      expect(store.saveState('kcal')()).toBe('saved');

      loadGoal.mockResolvedValue({
        success: true,
        goal: { kcal: 2500, carbsG: 200, proteinG: 120, fatG: 70 },
      });
      await store.load();

      expect(store.saveState('kcal')()).toBe('idle');
      expect(store.inputValue('kcal')()).toBe('2500');
    });
  });
});
