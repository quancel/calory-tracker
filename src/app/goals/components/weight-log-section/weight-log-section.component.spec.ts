import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CalorieSuggestionResult } from '../../models/weight.model';
import { WeightStore } from '../../weight.store';
import { WeightLogSectionComponent } from './weight-log-section.component';

describe('WeightLogSectionComponent', () => {
  let storeStub: {
    loading: ReturnType<typeof signal>;
    loadError: ReturnType<typeof signal>;
    hasEntries: ReturnType<typeof signal>;
    chartPoints: ReturnType<typeof signal>;
    chartSegments: ReturnType<typeof signal>;
    chartYDomain: ReturnType<typeof signal>;
    visibleSuggestion: ReturnType<typeof signal<CalorieSuggestionResult | null>>;
    sheetOpen: ReturnType<typeof signal>;
    load: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    openSheet: ReturnType<typeof vi.fn>;
    // Vom verschachtelten `app-weight-entry-sheet` benötigt, sobald
    // `sheetOpen()` wahr ist (derselbe `WeightStore`-Stub wird injiziert).
    weightInput: ReturnType<typeof signal>;
    weightValidation: ReturnType<typeof signal>;
    canSubmit: ReturnType<typeof signal>;
    saving: ReturnType<typeof signal>;
    submitError: ReturnType<typeof signal>;
    pendingReplace: ReturnType<typeof signal>;
    setWeightInput: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
    closeSheet: ReturnType<typeof vi.fn>;
    confirmReplace: ReturnType<typeof vi.fn>;
    cancelReplace: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    storeStub = {
      loading: signal(false),
      loadError: signal<string | null>(null),
      hasEntries: signal(false),
      chartPoints: signal([]),
      chartSegments: signal([]),
      chartYDomain: signal({ min: 0, max: 1 }),
      visibleSuggestion: signal<CalorieSuggestionResult | null>(null),
      sheetOpen: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn(),
      openSheet: vi.fn(),
      weightInput: signal(''),
      weightValidation: signal({ valid: false, error: 'Bitte ein Gewicht eingeben.' }),
      canSubmit: signal(false),
      saving: signal(false),
      submitError: signal<string | null>(null),
      pendingReplace: signal(null),
      setWeightInput: vi.fn(),
      submit: vi.fn().mockResolvedValue(undefined),
      closeSheet: vi.fn(),
      confirmReplace: vi.fn().mockResolvedValue(undefined),
      cancelReplace: vi.fn(),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [WeightLogSectionComponent],
      providers: [{ provide: WeightStore, useValue: storeStub }],
    });
  });

  it('calls load() on init', () => {
    const fixture = TestBed.createComponent(WeightLogSectionComponent);
    fixture.detectChanges();

    expect(storeStub.load).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state (chart and card both replaced) when there are no entries', () => {
    const fixture = TestBed.createComponent(WeightLogSectionComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-empty').textContent).toContain(
      'Noch keine Gewichtseinträge',
    );
    expect(fixture.nativeElement.querySelector('app-weight-chart')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-weight-suggestion-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.entry-button')).toBeTruthy();
  });

  it('shows chart and suggestion card once entries exist', () => {
    storeStub.hasEntries.set(true);
    storeStub.visibleSuggestion.set('no-target');
    const fixture = TestBed.createComponent(WeightLogSectionComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-empty')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-weight-chart')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-weight-suggestion-card')).toBeTruthy();
  });

  it('does not render the suggestion card when visibleSuggestion is null (dismissed)', () => {
    storeStub.hasEntries.set(true);
    storeStub.visibleSuggestion.set(null);
    const fixture = TestBed.createComponent(WeightLogSectionComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-weight-chart')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-weight-suggestion-card')).toBeNull();
  });

  it('opens the entry sheet on "+" click', () => {
    const fixture = TestBed.createComponent(WeightLogSectionComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.entry-button').click();
    expect(storeStub.openSheet).toHaveBeenCalledTimes(1);
  });

  it('renders the entry sheet component only while sheetOpen() is true', () => {
    const fixture = TestBed.createComponent(WeightLogSectionComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-weight-entry-sheet')).toBeNull();

    storeStub.sheetOpen.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-weight-entry-sheet')).toBeTruthy();
  });

  it('shows the error state with a retry action', () => {
    storeStub.loadError.set('Gewichtseinträge konnten nicht geladen werden.');
    const fixture = TestBed.createComponent(WeightLogSectionComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-error').textContent).toContain(
      'Gewichtseinträge konnten nicht geladen werden.',
    );
    fixture.nativeElement.querySelector('.retry-button').click();
    expect(storeStub.retry).toHaveBeenCalledTimes(1);
  });
});
