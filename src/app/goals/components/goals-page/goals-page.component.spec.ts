import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GoalsStore } from '../../goals.store';
import { WeightStore } from '../../weight.store';
import { GoalsPageComponent } from './goals-page.component';

describe('GoalsPageComponent', () => {
  let storeStub: {
    loading: ReturnType<typeof signal>;
    loadError: ReturnType<typeof signal>;
    load: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    inputValue: ReturnType<typeof vi.fn>;
    validationError: ReturnType<typeof vi.fn>;
    canSave: ReturnType<typeof vi.fn>;
    saveState: ReturnType<typeof vi.fn>;
    saveErrorMessage: ReturnType<typeof vi.fn>;
    setInput: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    savedValue: ReturnType<typeof vi.fn>;
  };

  // Stub, damit das verschachtelte `app-weight-log-section` (rendert bei
  // jedem `GoalsPageComponent`-Test mit) nicht den echten `WeightStore` und
  // damit Supabase/`fetch` anstößt — dieselbe Isolation wie beim
  // `GoalsStore`-Stub oben.
  let weightStoreStub: {
    loading: ReturnType<typeof signal>;
    loadError: ReturnType<typeof signal>;
    hasEntries: ReturnType<typeof signal>;
    chartPoints: ReturnType<typeof signal>;
    chartSegments: ReturnType<typeof signal>;
    chartYDomain: ReturnType<typeof signal>;
    visibleSuggestion: ReturnType<typeof signal>;
    sheetOpen: ReturnType<typeof signal>;
    load: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    openSheet: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    storeStub = {
      loading: signal(false),
      loadError: signal<string | null>(null),
      load: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn(),
      inputValue: vi.fn(() => signal('')),
      validationError: vi.fn(() => signal<string | null>(null)),
      canSave: vi.fn(() => signal(false)),
      saveState: vi.fn(() => signal('idle')),
      saveErrorMessage: vi.fn(() => signal<string | null>(null)),
      setInput: vi.fn(),
      save: vi.fn(),
      savedValue: vi.fn(() => signal<number | null>(null)),
    };

    weightStoreStub = {
      loading: signal(false),
      loadError: signal<string | null>(null),
      hasEntries: signal(false),
      chartPoints: signal([]),
      chartSegments: signal([]),
      chartYDomain: signal({ min: 0, max: 1 }),
      visibleSuggestion: signal(null),
      sheetOpen: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn(),
      openSheet: vi.fn(),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [GoalsPageComponent],
      providers: [
        provideRouter([]),
        { provide: GoalsStore, useValue: storeStub },
        { provide: WeightStore, useValue: weightStoreStub },
      ],
    }).compileComponents();
  });

  it('calls load() on init', () => {
    const fixture = TestBed.createComponent(GoalsPageComponent);
    fixture.detectChanges();

    expect(storeStub.load).toHaveBeenCalledTimes(1);
  });

  it('shows a back link to /tagebuch', () => {
    const fixture = TestBed.createComponent(GoalsPageComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      'a[aria-label="Zurück zum Tagebuch"]',
    ) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/tagebuch');
  });

  it('renders exactly four field blocks in .goal-fields, in order Kalorien/Kohlenhydrate/Protein/Fett', () => {
    const fixture = TestBed.createComponent(GoalsPageComponent);
    fixture.detectChanges();

    const fields = fixture.nativeElement.querySelectorAll('.goal-fields app-goal-field');
    expect(fields).toHaveLength(4);

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.goal-fields .field-label') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());
    expect(labels).toEqual([
      'Kalorien-Ziel (kcal)',
      'Kohlenhydrate-Ziel (g)',
      'Protein-Ziel (g)',
      'Fett-Ziel (g)',
    ]);
  });

  it('renders the target-weight field block as the first element of the weight-log section', () => {
    const fixture = TestBed.createComponent(GoalsPageComponent);
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('.weight-log-section');
    expect(section).toBeTruthy();

    const label = section.querySelector('app-goal-field .field-label');
    expect(label.textContent?.trim()).toBe('Gewicht-Ziel (kg)');
  });

  it('shows the loading skeleton and not the fields while loading', () => {
    storeStub.loading.set(true);
    const fixture = TestBed.createComponent(GoalsPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-loading')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('app-goal-field')).toHaveLength(0);
  });

  it('shows the error state with a retry action', () => {
    storeStub.loadError.set('Ziele konnten nicht geladen werden.');
    const fixture = TestBed.createComponent(GoalsPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-error').textContent).toContain(
      'Ziele konnten nicht geladen werden.',
    );

    fixture.nativeElement.querySelector('.retry-button').click();
    expect(storeStub.retry).toHaveBeenCalledTimes(1);
  });
});
