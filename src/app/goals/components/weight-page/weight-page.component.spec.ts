import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GoalsStore } from '../../goals.store';
import { WeightStore } from '../../weight.store';
import { WeightPageComponent } from './weight-page.component';

describe('WeightPageComponent', () => {
  let goalsStoreStub: {
    loading: ReturnType<typeof signal<boolean>>;
    loadError: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    inputValue: ReturnType<typeof vi.fn>;
    validationError: ReturnType<typeof vi.fn>;
    canSave: ReturnType<typeof vi.fn>;
    saveState: ReturnType<typeof vi.fn>;
    saveErrorMessage: ReturnType<typeof vi.fn>;
    setInput: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  // Stub, damit das verschachtelte `app-weight-log-section` nicht den echten
  // `WeightStore` und damit Supabase anstößt.
  const weightStoreStub = {
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

  beforeEach(async () => {
    goalsStoreStub = {
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
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WeightPageComponent],
      providers: [
        { provide: GoalsStore, useValue: goalsStoreStub },
        { provide: WeightStore, useValue: weightStoreStub },
      ],
    }).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(WeightPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the goal row on init (target weight + suggestion depend on it)', () => {
    setup();
    expect(goalsStoreStub.load).toHaveBeenCalledTimes(1);
  });

  it('renders the target-weight field block first, followed by the weight-log section', () => {
    const fixture = setup();
    const root = fixture.nativeElement.querySelector('.weight-page') as HTMLElement;

    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Gewicht');
    const label = root.querySelector('app-goal-field .field-label');
    expect(label?.textContent?.trim()).toBe('Gewicht-Ziel (kg)');

    const children = Array.from(root.children).map((el) => el.tagName.toLowerCase());
    expect(children.indexOf('app-goal-field')).toBeLessThan(
      children.indexOf('app-weight-log-section'),
    );
  });

  it('shows the error state with a retry action when the goal row fails to load', () => {
    goalsStoreStub.loadError.set('Ziele konnten nicht geladen werden.');
    const fixture = setup();

    expect(fixture.nativeElement.querySelector('app-weight-log-section')).toBeNull();
    fixture.nativeElement.querySelector('.retry-button').click();
    expect(goalsStoreStub.retry).toHaveBeenCalledTimes(1);
  });
});
