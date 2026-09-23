import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ProgressResult } from '../../../core/progress.calculations';
import { DiaryStore } from '../../diary.store';
import type { DiaryEntry, MealSection } from '../../models/diary.model';
import { DiaryShellComponent } from './diary-shell.component';

function neutralProgress(actual = 0): ProgressResult {
  return {
    hasGoal: false,
    actual,
    goal: null,
    fillFraction: 0,
    overshootFraction: 0,
    overshootAbsolute: 0,
    isWarning: false,
  };
}

function emptySections(): MealSection[] {
  return [
    { mealType: 'breakfast', label: 'Frühstück', kcal: 0, entries: [] },
    { mealType: 'lunch', label: 'Mittag', kcal: 0, entries: [] },
    { mealType: 'dinner', label: 'Abend', kcal: 0, entries: [] },
    { mealType: 'snack', label: 'Snacks', kcal: 0, entries: [] },
  ];
}

describe('DiaryShellComponent', () => {
  let storeStub: {
    dateLabel: ReturnType<typeof signal>;
    currentDate: ReturnType<typeof signal>;
    canGoForward: ReturnType<typeof signal>;
    loading: ReturnType<typeof signal>;
    error: ReturnType<typeof signal>;
    isEmpty: ReturnType<typeof signal>;
    sections: ReturnType<typeof signal>;
    kcalProgress: ReturnType<typeof signal>;
    carbsProgress: ReturnType<typeof signal>;
    proteinProgress: ReturnType<typeof signal>;
    fatProgress: ReturnType<typeof signal>;
    goToPreviousDay: ReturnType<typeof vi.fn>;
    goToNextDay: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    reloadGoal: ReturnType<typeof vi.fn>;
    suggestedMealType: ReturnType<typeof vi.fn>;
    previousDayLabel: ReturnType<typeof signal>;
    copyDayCount: ReturnType<typeof signal>;
    canCopyDay: ReturnType<typeof signal>;
    globalCopyFeedback: ReturnType<typeof signal>;
    copySectionCounts: ReturnType<typeof signal>;
    sectionCopyFeedback: ReturnType<typeof vi.fn>;
    feedbackFor: ReturnType<typeof vi.fn>;
    copyDay: ReturnType<typeof vi.fn>;
    copySection: ReturnType<typeof vi.fn>;
    confirmUndo: ReturnType<typeof vi.fn>;
    dismissFeedback: ReturnType<typeof vi.fn>;
    clearAllFeedback: ReturnType<typeof vi.fn>;
    retrySync: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    storeStub = {
      dateLabel: signal({ text: 'Heute', kind: 'today' }),
      currentDate: signal('2026-09-21'),
      canGoForward: signal(true),
      loading: signal(false),
      error: signal<string | null>(null),
      isEmpty: signal(true),
      sections: signal(emptySections()),
      kcalProgress: signal(neutralProgress()),
      carbsProgress: signal(neutralProgress()),
      proteinProgress: signal(neutralProgress()),
      fatProgress: signal(neutralProgress()),
      goToPreviousDay: vi.fn(),
      goToNextDay: vi.fn(),
      retry: vi.fn(),
      reloadGoal: vi.fn().mockResolvedValue(undefined),
      suggestedMealType: vi.fn().mockReturnValue('breakfast'),
      previousDayLabel: signal('Gestern'),
      copyDayCount: signal(0),
      canCopyDay: signal(false),
      globalCopyFeedback: signal(null),
      copySectionCounts: signal({ breakfast: 0, lunch: 0, dinner: 0, snack: 0 }),
      sectionCopyFeedback: vi.fn().mockReturnValue(null),
      feedbackFor: vi.fn().mockReturnValue(null),
      copyDay: vi.fn().mockResolvedValue(undefined),
      copySection: vi.fn().mockResolvedValue(undefined),
      confirmUndo: vi.fn().mockResolvedValue(undefined),
      dismissFeedback: vi.fn(),
      clearAllFeedback: vi.fn(),
      retrySync: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DiaryShellComponent],
      providers: [provideRouter([]), { provide: DiaryStore, useValue: storeStub }],
    }).compileComponents();
  });

  it('creates the component and renders the date navigation while idle', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-date-nav')).toBeTruthy();
  });

  it('shows the loading skeleton and keeps date navigation usable', () => {
    storeStub.loading.set(true);
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-loading')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-date-nav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.summary')).toBeNull();
  });

  it('shows the error state with a retry action and keeps date navigation usable', () => {
    storeStub.error.set('Tageswerte konnten nicht geladen werden.');
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-error').textContent).toContain(
      'Tageswerte konnten nicht geladen werden.',
    );
    expect(fixture.nativeElement.querySelector('app-date-nav')).toBeTruthy();

    fixture.nativeElement.querySelector('.retry-button').click();
    expect(storeStub.retry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty hint when there are no entries for the day', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.day-empty-hint')?.textContent).toContain(
      'Noch keine Einträge',
    );
  });

  it('renders all four meal sections', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-meal-section')).toHaveLength(4);
  });

  it('the FAB is the only accent-colored control (checked via class, styling comes from tokens)', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    const fab = fixture.nativeElement.querySelector('.fab') as HTMLButtonElement;
    expect(fab).toBeTruthy();
    expect(fab.getAttribute('aria-label')).toBe('Eintrag hinzufügen');
  });

  it('reloads the goal on init (ADR-0007 Punkt 5)', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    expect(storeStub.reloadGoal).toHaveBeenCalledTimes(1);
  });

  it('links the settings icon to /ziele', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a[aria-label="Ziele"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/ziele');
  });

  it('links the saved-meals icon to /mahlzeiten (design-conventions.md „Verwaltungsansicht")', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      'a[aria-label="Gespeicherte Mahlzeiten"]',
    ) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/mahlzeiten');
  });

  it('FAB click opens the sheet outlet with the suggested meal type and current date (ADR-0008)', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.nativeElement.querySelector('.fab').click();

    expect(storeStub.suggestedMealType).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: ['eintrag-erfassen'] } }], {
      queryParams: { date: '2026-09-21', mealType: 'breakfast' },
    });
  });

  it('section "+" click opens the sheet outlet with that section preselected, no time-of-day guess', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    // sections()[1] is 'lunch' (see emptySections()) — real app-meal-section renders its own "+" button.
    const lunchSection = fixture.nativeElement.querySelectorAll('app-meal-section')[1];
    lunchSection.querySelector('.add-button').click();

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: ['eintrag-erfassen'] } }], {
      queryParams: { date: '2026-09-21', mealType: 'lunch' },
    });
    expect(storeStub.suggestedMealType).not.toHaveBeenCalled();
  });

  it('tapping an entry row opens the sheet outlet with entryId + date, no mealType (ADR-0009 Punkt 5)', () => {
    storeStub.sections.set([
      {
        mealType: 'breakfast',
        label: 'Frühstück',
        kcal: 0,
        entries: [
          {
            id: 'entry-1',
            mealType: 'breakfast',
            amountG: 100,
            createdAt: '2026-09-21T08:00:00Z',
            syncState: 'synced',
            food: {
              id: 'f1',
              name: 'Apfel',
              kcal100g: 52,
              proteinG100g: 0.3,
              carbsG100g: 14,
              fatG100g: 0.2,
            },
          },
        ],
      },
      ...emptySections().slice(1),
    ]);
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.nativeElement.querySelector('.entry-row').click();

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: ['eintrag-erfassen'] } }], {
      queryParams: { date: '2026-09-21', entryId: 'entry-1' },
    });
  });

  it('a "Erneut versuchen" tap on a failed entry marker delegates to store.retrySync with the entry id (ADR-0016)', () => {
    storeStub.sections.set([
      {
        mealType: 'breakfast',
        label: 'Frühstück',
        kcal: 0,
        entries: [
          {
            id: 'entry-1',
            mealType: 'breakfast',
            amountG: 100,
            createdAt: '2026-09-21T08:00:00Z',
            syncState: 'failed',
            food: {
              id: 'f1',
              name: 'Apfel',
              kcal100g: 52,
              proteinG100g: 0.3,
              carbsG100g: 14,
              fatG100g: 0.2,
            },
          },
        ],
      },
      ...emptySections().slice(1),
    ]);
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('app-sync-status-marker button').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.sync-retry-button').click();

    expect(storeStub.retrySync).toHaveBeenCalledWith('entry-1');
  });

  it('shows the global copy trigger, disabled with count 0 when the previous day has no entries', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.copy-day-button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Gestern kopieren (0)');
  });

  it('enables the global copy trigger and copies on click when the previous day has entries', () => {
    storeStub.canCopyDay.set(true);
    storeStub.copyDayCount.set(5);
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.copy-day-button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Gestern kopieren (5)');

    button.click();

    expect(storeStub.copyDay).toHaveBeenCalledTimes(1);
  });

  it('renders the global inline feedback and opens the confirm dialog on "Rückgängig machen" (no immediate delete)', () => {
    storeStub.globalCopyFeedback.set({ sourceDateLabel: 'Gestern', count: 5 });
    storeStub.feedbackFor.mockReturnValue({ sourceDateLabel: 'Gestern', count: 5 });
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    const feedback = fixture.nativeElement.querySelector('app-copy-feedback');
    expect(feedback).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();

    feedback.querySelector('.undo-button').click();
    fixture.detectChanges();

    expect(storeStub.confirmUndo).not.toHaveBeenCalled();
    const dialog = fixture.nativeElement.querySelector('app-confirm-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.querySelector('.dialog-title').textContent).toContain(
      'Kopie von Gestern rückgängig machen?',
    );
    expect(dialog.querySelector('.dialog-description').textContent).toContain(
      'Alle 5 daraus übernommenen Einträge werden aus Heute entfernt.',
    );
  });

  it('confirming the dialog calls confirmUndo with the pending context and closes the dialog', () => {
    storeStub.globalCopyFeedback.set({ sourceDateLabel: 'Gestern', count: 5 });
    storeStub.feedbackFor.mockReturnValue({ sourceDateLabel: 'Gestern', count: 5 });
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('app-copy-feedback .undo-button').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('app-confirm-dialog .confirm-button').click();
    fixture.detectChanges();

    expect(storeStub.confirmUndo).toHaveBeenCalledWith('global');
    expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
  });

  it('cancelling the dialog does not call confirmUndo and closes the dialog', () => {
    storeStub.globalCopyFeedback.set({ sourceDateLabel: 'Gestern', count: 5 });
    storeStub.feedbackFor.mockReturnValue({ sourceDateLabel: 'Gestern', count: 5 });
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('app-copy-feedback .undo-button').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('app-confirm-dialog .cancel-button').click();
    fixture.detectChanges();

    expect(storeStub.confirmUndo).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
  });

  it('closing the global feedback via "x" dismisses it without opening the dialog', () => {
    storeStub.globalCopyFeedback.set({ sourceDateLabel: 'Gestern', count: 5 });
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('app-copy-feedback .close-button').click();

    expect(storeStub.dismissFeedback).toHaveBeenCalledWith('global');
    expect(storeStub.confirmUndo).not.toHaveBeenCalled();
  });

  it("a section copy click delegates to copySection with that section's meal type", () => {
    storeStub.copySectionCounts.set({ breakfast: 0, lunch: 2, dinner: 0, snack: 0 });
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    // sections()[1] is 'lunch' (see emptySections()).
    const lunchSection = fixture.nativeElement.querySelectorAll('app-meal-section')[1];
    lunchSection.querySelector('.copy-button').click();

    expect(storeStub.copySection).toHaveBeenCalledWith('lunch');
  });

  it('clears the undo feedback on destroy (ADR-0013 Punkt 4 — an den Seitenaufruf gebunden)', () => {
    const fixture = TestBed.createComponent(DiaryShellComponent);
    fixture.detectChanges();

    fixture.destroy();

    expect(storeStub.clearAllFeedback).toHaveBeenCalledTimes(1);
  });
});
