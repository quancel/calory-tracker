import { TestBed } from '@angular/core/testing';
import type { DiaryEntry, MealSection } from '../../models/diary.model';
import { MealSectionComponent } from './meal-section.component';

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

describe('MealSectionComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MealSectionComponent] }).compileComponents();
  });

  function setup(
    section: MealSection,
    options: {
      copyCount?: number;
      copyFeedback?: { sourceDateLabel: string; count: number } | null;
    } = {},
  ) {
    const fixture = TestBed.createComponent(MealSectionComponent);
    fixture.componentRef.setInput('section', section);
    fixture.componentRef.setInput('copyCount', options.copyCount ?? 0);
    fixture.componentRef.setInput('copyFeedback', options.copyFeedback ?? null);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the empty hint when the section has no entries', () => {
    const fixture = setup({ mealType: 'dinner', label: 'Abend', kcal: 0, entries: [] });
    expect(fixture.nativeElement.querySelector('.empty-hint')?.textContent).toContain(
      'Keine Einträge',
    );
  });

  it('renders entry rows with amount and kcal', () => {
    const entry = makeEntry({ amountG: 150 });
    const fixture = setup({
      mealType: 'breakfast',
      label: 'Frühstück',
      kcal: 555,
      entries: [entry],
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.entry-name')?.textContent).toContain('Haferflocken');
    expect(el.querySelector('.entry-amount-kcal')?.textContent).toContain('150g');
    expect(el.querySelector('.section-kcal')?.textContent).toContain('555');
  });

  it('emits addEntry when the section + button is clicked', () => {
    const fixture = setup({ mealType: 'snack', label: 'Snacks', kcal: 0, entries: [] });
    const emitted = vi.fn();
    fixture.componentInstance.addEntry.subscribe(emitted);

    fixture.nativeElement.querySelector('.add-button').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('emits openEntry with the clicked entry', () => {
    const entry = makeEntry();
    const fixture = setup({
      mealType: 'breakfast',
      label: 'Frühstück',
      kcal: 370,
      entries: [entry],
    });
    const emitted = vi.fn();
    fixture.componentInstance.openEntry.subscribe(emitted);

    fixture.nativeElement.querySelector('.entry-row').click();

    expect(emitted).toHaveBeenCalledWith(entry);
  });

  it('copy trigger is visible but disabled when the previous day has no matching entries (ADR-0013)', () => {
    const fixture = setup(
      { mealType: 'snack', label: 'Snacks', kcal: 0, entries: [] },
      { copyCount: 0 },
    );
    const button = fixture.nativeElement.querySelector('.copy-button') as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.copy-badge')).toBeNull();
  });

  it('copy trigger shows the count badge and emits copySection when enabled', () => {
    const fixture = setup(
      { mealType: 'breakfast', label: 'Frühstück', kcal: 0, entries: [] },
      { copyCount: 3 },
    );
    const emitted = vi.fn();
    fixture.componentInstance.copySection.subscribe(emitted);
    const button = fixture.nativeElement.querySelector('.copy-button') as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.copy-badge')?.textContent?.trim()).toBe('3');

    button.click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('renders the inline feedback below the section header and forwards undo/close', () => {
    const fixture = setup(
      { mealType: 'lunch', label: 'Mittag', kcal: 0, entries: [] },
      { copyFeedback: { sourceDateLabel: 'Gestern', count: 2 } },
    );
    const undoEmitted = vi.fn();
    const closeEmitted = vi.fn();
    fixture.componentInstance.undoRequested.subscribe(undoEmitted);
    fixture.componentInstance.feedbackClosed.subscribe(closeEmitted);

    const feedback = fixture.nativeElement.querySelector('app-copy-feedback');
    expect(feedback).toBeTruthy();

    feedback.querySelector('.undo-button').click();
    expect(undoEmitted).toHaveBeenCalledTimes(1);

    feedback.querySelector('.close-button').click();
    expect(closeEmitted).toHaveBeenCalledTimes(1);
  });

  describe('Sync-Status-Marker (ADR-0016, design-conventions.md)', () => {
    it('shows no marker for a synced entry', () => {
      const fixture = setup({
        mealType: 'breakfast',
        label: 'Frühstück',
        kcal: 370,
        entries: [makeEntry({ syncState: 'synced' })],
      });

      expect(fixture.nativeElement.querySelector('app-sync-status-marker')).toBeNull();
    });

    it('shows the marker before the food name for a pending entry, without a button-in-button', () => {
      const fixture = setup({
        mealType: 'breakfast',
        label: 'Frühstück',
        kcal: 370,
        entries: [makeEntry({ syncState: 'pending' })],
      });

      const marker = fixture.nativeElement.querySelector('app-sync-status-marker');
      expect(marker).toBeTruthy();
      expect(marker.querySelector('button')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.entry-row button')).toBeNull();
    });

    it('opens the inline explanation on marker tap, with "Erneut versuchen" only for failed', () => {
      const fixture = setup({
        mealType: 'breakfast',
        label: 'Frühstück',
        kcal: 370,
        entries: [makeEntry({ id: 'e1', syncState: 'failed' })],
      });

      expect(fixture.nativeElement.querySelector('.sync-explanation')).toBeNull();

      fixture.nativeElement.querySelector('app-sync-status-marker button').click();
      fixture.detectChanges();

      const explanation = fixture.nativeElement.querySelector('.sync-explanation');
      expect(explanation).toBeTruthy();
      expect(explanation.querySelector('.sync-retry-button')).toBeTruthy();
    });

    it('does not show "Erneut versuchen" for a pending entry\'s explanation', () => {
      const fixture = setup({
        mealType: 'breakfast',
        label: 'Frühstück',
        kcal: 370,
        entries: [makeEntry({ id: 'e1', syncState: 'pending' })],
      });

      fixture.nativeElement.querySelector('app-sync-status-marker button').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.sync-retry-button')).toBeNull();
    });

    it('emits retrySync with the entry id when "Erneut versuchen" is tapped', () => {
      const fixture = setup({
        mealType: 'breakfast',
        label: 'Frühstück',
        kcal: 370,
        entries: [makeEntry({ id: 'e1', syncState: 'failed' })],
      });
      const emitted = vi.fn();
      fixture.componentInstance.retrySync.subscribe(emitted);

      fixture.nativeElement.querySelector('app-sync-status-marker button').click();
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.sync-retry-button').click();

      expect(emitted).toHaveBeenCalledWith('e1');
    });
  });
});
