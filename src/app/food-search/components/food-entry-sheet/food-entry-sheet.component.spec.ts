import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { FoodSearchStore } from '../../food-search.store';
import type { CreateFoodValidation } from '../../food-search.calculations';
import type { Food } from '../../../core/foods.service';
import type { StepBFood } from '../../food-search.store';
import { FoodEntrySheetComponent } from './food-entry-sheet.component';

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 'f1',
    name: 'Apfel',
    kcal100g: 52,
    proteinG100g: 0.3,
    carbsG100g: 14,
    fatG100g: 0.2,
    defaultPortionG: 150,
    source: 'manual',
    barcode: null,
    isCorrected: false,
    ...overrides,
  };
}

/** Nährwertkombination ohne Plausibilitäts-/Vollständigkeitsbefund (macroSum 50g, kcal-Abweichung 0%) — für Tests, die den Marker bewusst NICHT auslösen wollen. */
function plausibleNutrition() {
  return { kcal100g: 200, proteinG100g: 50, carbsG100g: 0, fatG100g: 0 };
}

function invalidField(error = 'Pflichtfeld'): { valid: false; error: string } {
  return { valid: false, error };
}

function neutralValidation(): CreateFoodValidation {
  return {
    name: invalidField('Bitte einen Namen eingeben.'),
    kcal100g: invalidField('Bitte einen Wert für Kalorien eingeben.'),
    proteinG100g: invalidField('Bitte einen Wert für Protein eingeben.'),
    carbsG100g: invalidField('Bitte einen Wert für Kohlenhydrate eingeben.'),
    fatG100g: invalidField('Bitte einen Wert für Fett eingeben.'),
    defaultPortionG: { valid: true, value: null },
    value: null,
  };
}

describe('FoodEntrySheetComponent', () => {
  let storeStub: {
    loading: ReturnType<typeof signal>;
    loadError: ReturnType<typeof signal>;
    query: ReturnType<typeof signal>;
    results: ReturnType<typeof signal>;
    showEmptyState: ReturnType<typeof signal>;
    createForm: ReturnType<typeof signal>;
    createSaving: ReturnType<typeof signal>;
    createErrorMessage: ReturnType<typeof signal>;
    createValidation: ReturnType<typeof signal>;
    canCreate: ReturnType<typeof signal>;
    correctForm: ReturnType<typeof signal>;
    correctSaving: ReturnType<typeof signal>;
    correctErrorMessage: ReturnType<typeof signal>;
    correctValidation: ReturnType<typeof signal>;
    canSubmitCorrect: ReturnType<typeof signal>;
    correctFindings: ReturnType<typeof signal>;
    mealType: ReturnType<typeof signal>;
    stepBFood: ReturnType<typeof signal<StepBFood | null>>;
    amountInput: ReturnType<typeof signal>;
    amountValidation: ReturnType<typeof signal>;
    canSaveEntry: ReturnType<typeof signal>;
    liveNutrition: ReturnType<typeof signal>;
    isEditing: ReturnType<typeof signal>;
    stepBLoading: ReturnType<typeof signal>;
    stepBLoadError: ReturnType<typeof signal>;
    stepBSaving: ReturnType<typeof signal>;
    stepBSaveError: ReturnType<typeof signal>;
    stepBDeleting: ReturnType<typeof signal>;
    stepBDeleteError: ReturnType<typeof signal>;
    scanPhase: ReturnType<typeof signal>;
    scanErrorMessage: ReturnType<typeof signal>;
    scanReentry: ReturnType<typeof signal>;
    entryOrigin: ReturnType<typeof signal>;
    lastSavedSummary: ReturnType<typeof signal>;
    activeTab: ReturnType<typeof signal>;
    savedMealsLoading: ReturnType<typeof signal>;
    savedMealsLoadError: ReturnType<typeof signal>;
    showSavedMealsEmptyState: ReturnType<typeof signal>;
    savedMeals: ReturnType<typeof signal>;
    loggingMeal: ReturnType<typeof signal>;
    loggedMealSummary: ReturnType<typeof signal>;
    setActiveTab: ReturnType<typeof vi.fn>;
    ensureSavedMealsLoaded: ReturnType<typeof vi.fn>;
    retrySavedMealsLoad: ReturnType<typeof vi.fn>;
    logMeal: ReturnType<typeof vi.fn>;
    resetForNextMealLog: ReturnType<typeof vi.fn>;
    ensureLoaded: ReturnType<typeof vi.fn>;
    retryLoad: ReturnType<typeof vi.fn>;
    setQuery: ReturnType<typeof vi.fn>;
    beginCreate: ReturnType<typeof vi.fn>;
    setCreateField: ReturnType<typeof vi.fn>;
    createFood: ReturnType<typeof vi.fn>;
    beginCorrect: ReturnType<typeof vi.fn>;
    setCorrectField: ReturnType<typeof vi.fn>;
    submitCorrect: ReturnType<typeof vi.fn>;
    selectFood: ReturnType<typeof vi.fn>;
    beginEntrySession: ReturnType<typeof vi.fn>;
    setMealType: ReturnType<typeof vi.fn>;
    setAmountInput: ReturnType<typeof vi.fn>;
    saveEntry: ReturnType<typeof vi.fn>;
    loadEntryForEdit: ReturnType<typeof vi.fn>;
    deleteEntry: ReturnType<typeof vi.fn>;
    beginScanSession: ReturnType<typeof vi.fn>;
    handleScanDetected: ReturnType<typeof vi.fn>;
    retryScan: ReturnType<typeof vi.fn>;
    reportCameraError: ReturnType<typeof vi.fn>;
    goToManualCreateFromScan: ReturnType<typeof vi.fn>;
    resetForNextScan: ReturnType<typeof vi.fn>;
  };

  function makeStoreStub() {
    return {
      loading: signal(false),
      loadError: signal<string | null>(null),
      query: signal(''),
      results: signal<Food[]>([]),
      showEmptyState: signal(false),
      createForm: signal({
        name: '',
        kcal100g: '',
        proteinG100g: '',
        carbsG100g: '',
        fatG100g: '',
        defaultPortionG: '',
        barcode: '',
      }),
      createSaving: signal(false),
      createErrorMessage: signal<string | null>(null),
      createValidation: signal(neutralValidation()),
      canCreate: signal(false),
      correctForm: signal({
        name: '',
        kcal100g: '',
        proteinG100g: '',
        carbsG100g: '',
        fatG100g: '',
        defaultPortionG: '',
        barcode: '',
      }),
      correctSaving: signal(false),
      correctErrorMessage: signal<string | null>(null),
      correctValidation: signal(neutralValidation()),
      canSubmitCorrect: signal(false),
      correctFindings: signal<{ kind: string; message: string }[]>([]),
      mealType: signal<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast'),
      stepBFood: signal<StepBFood | null>(null),
      amountInput: signal(''),
      amountValidation: signal({ valid: false, error: 'Bitte eine Menge eingeben.' }),
      canSaveEntry: signal(false),
      liveNutrition: signal<{
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
      } | null>(null),
      isEditing: signal(false),
      stepBLoading: signal(false),
      stepBLoadError: signal<string | null>(null),
      stepBSaving: signal(false),
      stepBSaveError: signal<string | null>(null),
      stepBDeleting: signal(false),
      stepBDeleteError: signal<string | null>(null),
      scanPhase: signal<string>('camera'),
      scanErrorMessage: signal<string | null>(null),
      scanReentry: signal(false),
      entryOrigin: signal<'search' | 'scan'>('search'),
      lastSavedSummary: signal<{ name: string; kcal: number } | null>(null),
      activeTab: signal<'search' | 'saved-meals'>('search'),
      savedMealsLoading: signal(false),
      savedMealsLoadError: signal<string | null>(null),
      showSavedMealsEmptyState: signal(false),
      savedMeals: signal<unknown[]>([]),
      loggingMeal: signal(false),
      loggedMealSummary: signal<{ name: string; itemCount: number } | null>(null),
      setActiveTab: vi.fn(),
      ensureSavedMealsLoaded: vi.fn().mockResolvedValue(undefined),
      retrySavedMealsLoad: vi.fn().mockResolvedValue(undefined),
      logMeal: vi.fn().mockResolvedValue(true),
      resetForNextMealLog: vi.fn(),
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      retryLoad: vi.fn().mockResolvedValue(undefined),
      setQuery: vi.fn(),
      beginCreate: vi.fn(),
      setCreateField: vi.fn(),
      createFood: vi.fn().mockResolvedValue(null),
      beginCorrect: vi.fn().mockReturnValue(true),
      setCorrectField: vi.fn(),
      submitCorrect: vi.fn().mockResolvedValue(null),
      selectFood: vi.fn(),
      beginEntrySession: vi.fn(),
      setMealType: vi.fn(),
      setAmountInput: vi.fn(),
      saveEntry: vi.fn().mockResolvedValue(true),
      loadEntryForEdit: vi.fn().mockResolvedValue(true),
      deleteEntry: vi.fn().mockResolvedValue(true),
      beginScanSession: vi.fn(),
      handleScanDetected: vi.fn().mockResolvedValue(undefined),
      retryScan: vi.fn(),
      reportCameraError: vi.fn(),
      goToManualCreateFromScan: vi.fn(),
      resetForNextScan: vi.fn(),
    };
  }

  async function configure(queryParams: Record<string, string>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [FoodEntrySheetComponent],
      providers: [
        provideRouter([]),
        { provide: FoodSearchStore, useValue: storeStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();
  }

  beforeEach(async () => {
    storeStub = makeStoreStub();
    await configure({ date: '2026-09-21', mealType: 'breakfast' });
  });

  it('creates the component and triggers ensureLoaded once', () => {
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(storeStub.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('resets Step-B state via beginEntrySession with date/mealType from the route (ADR-0009 Punkt 9)', () => {
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    expect(storeStub.beginEntrySession).toHaveBeenCalledWith('2026-09-21', 'breakfast');
  });

  it('falls back to snack for a missing/invalid mealType query param', async () => {
    await configure({ date: '2026-09-21', mealType: 'brunch' });
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    expect(storeStub.beginEntrySession).toHaveBeenCalledWith('2026-09-21', 'snack');
  });

  it('renders Step A with an autofocused search field', () => {
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.search-input');
    expect(input).toBeTruthy();
    expect(fixture.nativeElement.ownerDocument.activeElement).toBe(input);
  });

  it('renders the meal-type chip row on Step A, selected chip reflects store.mealType', () => {
    storeStub.mealType.set('lunch');
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.meal-chip');
    expect(chips).toHaveLength(4);
    const selected = fixture.nativeElement.querySelector('.meal-chip-selected');
    expect(selected.textContent.trim()).toBe('Mittag');

    chips[2].click(); // Abend
    expect(storeStub.setMealType).toHaveBeenCalledWith('dinner');
  });

  it('closes via backdrop click by clearing the sheet outlet', () => {
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.nativeElement.querySelector('.backdrop').click();

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: null } }]);
  });

  it('closes via the "X" button', () => {
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.nativeElement.querySelector('.close-button').click();

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: null } }]);
  });

  it('closes on Escape (Fokusfalle-Handler)', () => {
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const panel = fixture.nativeElement.querySelector('.sheet-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: null } }]);
  });

  it('forwards typed input to store.setQuery', () => {
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.search-input') as HTMLInputElement;
    input.value = 'Apfel';
    input.dispatchEvent(new Event('input'));

    expect(storeStub.setQuery).toHaveBeenCalledWith('Apfel');
  });

  it('shows the loading skeleton', () => {
    storeStub.loading.set(true);
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-loading')).toBeTruthy();
  });

  it('shows the error state with a retry action', () => {
    storeStub.loadError.set('Foods konnten nicht geladen werden.');
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-error').textContent).toContain(
      'Foods konnten nicht geladen werden.',
    );
    fixture.nativeElement.querySelector('.retry-button').click();
    expect(storeStub.retryLoad).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state with a "{query} anlegen" primary action and switches to Step A2', () => {
    storeStub.query.set('Kiwi');
    storeStub.showEmptyState.set(true);
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState.textContent).toContain('Kein Treffer für „Kiwi"');

    fixture.nativeElement.querySelector('.primary-button').click();
    fixture.detectChanges();

    expect(storeStub.beginCreate).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.create-form')).toBeTruthy();
  });

  it('renders result rows with a marker slot (sibling of the row button, not nested) and the kcal/portion meta text', () => {
    storeStub.results.set([
      makeFood({
        name: 'Apfel',
        kcal100g: 52,
        proteinG100g: 13,
        carbsG100g: 0,
        fatG100g: 0,
        defaultPortionG: 150,
      }),
    ]);
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    const item = fixture.nativeElement.querySelector('.result-item');
    const row = item.querySelector('.result-row');
    expect(item.querySelector('.marker-slot')).toBeTruthy();
    // Der Marker-Slot ist ein Geschwister-Element des Zeilen-Buttons, NICHT
    // darin verschachtelt (kein Button-in-Button).
    expect(row.querySelector('.marker-slot')).toBeNull();
    expect(row.querySelector('.result-name').textContent).toContain('Apfel');
    expect(row.querySelector('.result-meta').textContent.replace(/\s+/g, ' ').trim()).toBe(
      '52 kcal/100g · Standardportion 150g',
    );
  });

  it('omits the portion segment when defaultPortionG is null', () => {
    storeStub.results.set([makeFood({ name: 'Birne', kcal100g: 57, defaultPortionG: null })]);
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    const meta = fixture.nativeElement
      .querySelector('.result-meta')
      .textContent.replace(/\s+/g, ' ')
      .trim();
    expect(meta).toBe('57 kcal/100g');
  });

  it('tapping a result row selects the food and switches to Step B', () => {
    const food = makeFood();
    storeStub.results.set([food]);
    const fixture = TestBed.createComponent(FoodEntrySheetComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.result-row').click();
    fixture.detectChanges();

    expect(storeStub.selectFood).toHaveBeenCalledWith(food);
    expect(fixture.nativeElement.querySelector('.amount-form')).toBeTruthy();
  });

  describe('Plausibilitäts-/Vollständigkeits-Marker (design-conventions.md)', () => {
    it('shows no marker button for a fully plausible/complete food', () => {
      storeStub.results.set([makeFood({ ...plausibleNutrition() })]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.marker-button')).toBeNull();
    });

    // „Unvollständig" kann in der Suchtrefferliste bewusst nicht auftreten,
    // da `Food` wegen `not null` nie tatsächlich unvollständig ist
    // (ADR-0011 Punkt 2) — dort ist nur „unplausibel" sichtbar. Die
    // Priorisierungsregel selbst (inkl. „unvollständig" bei fehlendem Wert)
    // ist in `food-search.calculations.spec.ts` (`resolvePlausibilityMarker`)
    // abgedeckt, wo sie mit einer nullable-toleranten Form testbar ist.

    it('shows the "unplausibel" marker (triangle-alert, --color-warning) with priority over "unvollständig"', () => {
      storeStub.results.set([
        makeFood({ name: 'Riegel', kcal100g: 500, proteinG100g: 60, carbsG100g: 50, fatG100g: 0 }),
      ]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('.marker-button');
      expect(button).toBeTruthy();
      expect(button.classList.contains('marker-button-warning')).toBe(true);
      expect(button.getAttribute('aria-label')).toContain('Nährwerte unplausibel');
    });

    it('tapping the marker opens Step C for exactly that food, independent of the Step-B selection', () => {
      const markedFood = makeFood({
        id: 'marked-1',
        name: 'Riegel',
        kcal100g: 500,
        proteinG100g: 60,
        carbsG100g: 50,
        fatG100g: 0,
      });
      storeStub.results.set([markedFood]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.marker-button').click();
      fixture.detectChanges();

      expect(storeStub.beginCorrect).toHaveBeenCalledWith('marked-1');
      expect(storeStub.selectFood).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.create-form')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.sheet-title').textContent.trim()).toBe(
        'Nährwerte bearbeiten',
      );
    });

    it('"Zurück" from Step C (opened from the list) returns to the search step', () => {
      storeStub.results.set([
        makeFood({ name: 'Riegel', kcal100g: 500, proteinG100g: 60, carbsG100g: 50, fatG100g: 0 }),
      ]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.marker-button').click();
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.back-button').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.search-input')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.create-form')).toBeNull();
    });

    it('shows the marker and a pencil ("Nährwerte bearbeiten") icon next to the food name in Step B', () => {
      storeStub.stepBFood.set({
        id: 'f1',
        name: 'Riegel',
        kcal100g: 500,
        proteinG100g: 60,
        carbsG100g: 50,
        fatG100g: 0,
        source: 'manual',
      });
      const food = makeFood({ id: 'f1' });
      storeStub.results.set([food]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.marker-icon-inline')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.edit-food-button')).toBeTruthy();
    });

    it('the pencil icon in Step B opens Step C for the current Step-B food and returns to Step B afterwards', () => {
      storeStub.stepBFood.set({
        id: 'f1',
        name: 'Apfel',
        kcal100g: 52,
        proteinG100g: 13,
        carbsG100g: 0,
        fatG100g: 0,
        source: 'manual',
      });
      const food = makeFood({ id: 'f1' });
      storeStub.results.set([food]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.edit-food-button').click();
      fixture.detectChanges();

      expect(storeStub.beginCorrect).toHaveBeenCalledWith('f1');
      expect(fixture.nativeElement.querySelector('.create-form')).toBeTruthy();

      fixture.nativeElement.querySelector('.back-button').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.amount-form')).toBeTruthy();
    });
  });

  describe('Step C — Nährwerte bearbeiten (Korrektur, ADR-0011 Punkt 6)', () => {
    function goToStepCFromList(
      fixture: ReturnType<typeof TestBed.createComponent<FoodEntrySheetComponent>>,
    ) {
      storeStub.results.set([
        makeFood({ name: 'Riegel', kcal100g: 500, proteinG100g: 60, carbsG100g: 50, fatG100g: 0 }),
      ]);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.marker-button').click();
      fixture.detectChanges();
    }

    it('prefills the form from store.correctForm, reusing the Step-A2 layout/labels', () => {
      storeStub.correctForm.set({
        name: 'Riegel',
        kcal100g: '500',
        proteinG100g: '60',
        carbsG100g: '50',
        fatG100g: '0',
        defaultPortionG: '',
        barcode: '',
      });
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      expect(
        (fixture.nativeElement.querySelector('#correct-food-name') as HTMLInputElement).value,
      ).toBe('Riegel');
      expect(
        (fixture.nativeElement.querySelector('#correct-food-kcal') as HTMLInputElement).value,
      ).toBe('500');
    });

    it('shows the plausibility banner with ALL findings and concrete numbers, not just the priorized one', () => {
      storeStub.correctFindings.set([
        { kind: 'macro-sum-exceeded', message: 'Summe der Makronährstoffe 110 g liegt über 100 g je 100 g.' },
        { kind: 'kcal-deviation', message: 'Angegebene Energie 500 kcal weicht 20% von berechneten 440 kcal ab.' },
      ]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      const lines = fixture.nativeElement.querySelectorAll('.plausibility-banner-line');
      expect(lines).toHaveLength(2);
      expect(lines[0].textContent).toContain('110 g');
      expect(lines[1].textContent).toContain('20%');
    });

    it('does not render a banner when there are no findings', () => {
      storeStub.correctFindings.set([]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      expect(fixture.nativeElement.querySelector('.plausibility-banner')).toBeNull();
    });

    it('forwards field input to store.setCorrectField', () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      const kcalInput = fixture.nativeElement.querySelector('#correct-food-kcal') as HTMLInputElement;
      kcalInput.value = '480';
      kcalInput.dispatchEvent(new Event('input'));

      expect(storeStub.setCorrectField).toHaveBeenCalledWith('kcal100g', '480');
    });

    it('submit button label is "Speichern", disabled while canSubmitCorrect is false', () => {
      storeStub.canSubmitCorrect.set(false);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      const submit = fixture.nativeElement.querySelector(
        '.create-form .primary-button',
      ) as HTMLButtonElement;
      expect(submit.textContent.trim()).toBe('Speichern');
      expect(submit.disabled).toBe(true);
    });

    it('submitting a valid correction calls store.submitCorrect and returns to the previous step on success', async () => {
      storeStub.canSubmitCorrect.set(true);
      storeStub.submitCorrect.mockResolvedValue(makeFood({ name: 'Riegel' }));

      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      const form = fixture.nativeElement.querySelector('.create-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(storeStub.submitCorrect).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.create-form')).toBeNull();
      expect(fixture.nativeElement.querySelector('.search-input')).toBeTruthy();
    });

    it('keeps Step C open and shows the error message when the save fails', async () => {
      storeStub.canSubmitCorrect.set(true);
      storeStub.submitCorrect.mockResolvedValue(null);
      storeStub.correctErrorMessage.set('Food konnte nicht aktualisiert werden.');

      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      const form = fixture.nativeElement.querySelector('.create-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.create-form')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.create-error').textContent).toContain(
        'Food konnte nicht aktualisiert werden.',
      );
    });

    it('shows a field error only after blur (Standard-Formularvalidierung)', () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepCFromList(fixture);

      const kcalInput = fixture.nativeElement.querySelector('#correct-food-kcal') as HTMLInputElement;
      expect(kcalInput.parentElement?.querySelector('.field-error')).toBeNull();

      kcalInput.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(kcalInput.parentElement?.querySelector('.field-error')?.textContent).toContain(
        'Bitte einen Wert für Kalorien eingeben.',
      );
    });
  });

  describe('Step A2 (Neu anlegen)', () => {
    beforeEach(() => {
      // simulate being on step A2 by triggering the "anlegen" flow through the empty state
      storeStub.query.set('Kiwi');
      storeStub.showEmptyState.set(true);
    });

    it('back-chevron returns to Step A', () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.primary-button').click();
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.back-button').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.search-input')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.create-form')).toBeNull();
    });

    it('forwards field input to store.setCreateField', () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.primary-button').click();
      fixture.detectChanges();

      const nameInput = fixture.nativeElement.querySelector('#food-name') as HTMLInputElement;
      nameInput.value = 'Kiwi';
      nameInput.dispatchEvent(new Event('input'));

      expect(storeStub.setCreateField).toHaveBeenCalledWith('name', 'Kiwi');
    });

    it('submit button is disabled while canCreate is false', () => {
      storeStub.canCreate.set(false);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.primary-button').click();
      fixture.detectChanges();

      const submit = fixture.nativeElement.querySelector(
        '.create-form .primary-button',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });

    it('submitting a valid form calls store.createFood and returns to Step A on success', async () => {
      storeStub.canCreate.set(true);
      storeStub.createFood.mockResolvedValue(makeFood({ id: 'new-1', name: 'Kiwi' }));

      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.primary-button').click();
      fixture.detectChanges();

      const form = fixture.nativeElement.querySelector('.create-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(storeStub.createFood).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.create-form')).toBeNull();
      expect(fixture.nativeElement.querySelector('.search-input')).toBeTruthy();
    });

    it('shows a field error only after blur', () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.primary-button').click();
      fixture.detectChanges();

      const kcalInput = fixture.nativeElement.querySelector('#food-kcal') as HTMLInputElement;
      expect(kcalInput.parentElement?.querySelector('.field-error')).toBeNull();

      kcalInput.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(kcalInput.parentElement?.querySelector('.field-error')?.textContent).toContain(
        'Bitte einen Wert für Kalorien eingeben.',
      );
    });
  });

  describe('Step B — Anlegen (Tap auf Trefferzeile)', () => {
    function goToStepB(
      fixture: ReturnType<typeof TestBed.createComponent<FoodEntrySheetComponent>>,
    ) {
      const food = makeFood();
      storeStub.results.set([food]);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();
    }

    it('shows the food name as a non-editable heading and a "Zurück" chevron (create flow)', () => {
      storeStub.stepBFood.set({
        id: 'f1',
        name: 'Apfel',
        kcal100g: 52,
        proteinG100g: 0.3,
        carbsG100g: 14,
        fatG100g: 0.2,
        source: 'manual',
      });
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepB(fixture);

      expect(fixture.nativeElement.querySelector('.sheet-title').textContent.trim()).toBe('Apfel');
      expect(fixture.nativeElement.querySelector('.back-button')).toBeTruthy();
    });

    it('prefills and preselects the amount input, forwards typing to store.setAmountInput', () => {
      storeStub.stepBFood.set({
        id: 'f1',
        name: 'Apfel',
        kcal100g: 52,
        proteinG100g: 0.3,
        carbsG100g: 14,
        fatG100g: 0.2,
        source: 'manual',
      });
      storeStub.amountInput.set('150');
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepB(fixture);

      const amountField = fixture.nativeElement.querySelector('#entry-amount') as HTMLInputElement;
      expect(amountField.value).toBe('150');

      amountField.value = '200';
      amountField.dispatchEvent(new Event('input'));
      expect(storeStub.setAmountInput).toHaveBeenCalledWith('200');
    });

    it('shows the live kcal/macro calculation without a "Löschen" button', () => {
      storeStub.stepBFood.set({
        id: 'f1',
        name: 'Apfel',
        kcal100g: 52,
        proteinG100g: 0.3,
        carbsG100g: 14,
        fatG100g: 0.2,
        source: 'manual',
      });
      storeStub.liveNutrition.set({ kcal: 104, proteinG: 0.6, carbsG: 28, fatG: 0.4 });
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepB(fixture);

      expect(fixture.nativeElement.querySelector('.live-kcal').textContent).toContain('104');
      expect(fixture.nativeElement.querySelector('.danger-text-button')).toBeNull();
    });

    it('disables Speichern while canSaveEntry is false', () => {
      storeStub.canSaveEntry.set(false);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepB(fixture);

      const saveButton = fixture.nativeElement.querySelector('.save-button') as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });

    it('submitting calls store.saveEntry and closes the sheet on success', async () => {
      storeStub.canSaveEntry.set(true);
      storeStub.saveEntry.mockResolvedValue(true);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepB(fixture);
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement
        .querySelector('.amount-form')
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(storeStub.saveEntry).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: null } }]);
    });

    it('keeps the sheet open and shows the error on a failed save', async () => {
      storeStub.canSaveEntry.set(true);
      storeStub.saveEntry.mockResolvedValue(false);
      storeStub.stepBSaveError.set('Eintrag konnte nicht gespeichert werden.');
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepB(fixture);
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement
        .querySelector('.amount-form')
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.save-error').textContent).toContain(
        'Eintrag konnte nicht gespeichert werden.',
      );
    });

    it('"Zurück" returns to Step A', () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      goToStepB(fixture);

      fixture.nativeElement.querySelector('.back-button').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.search-input')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.amount-form')).toBeNull();
    });
  });

  describe('Step B — Bearbeiten (entryId in der Route, ADR-0009 Punkt 5)', () => {
    beforeEach(async () => {
      await configure({ date: '2026-09-21', entryId: 'e1' });
    });

    it('opens directly in Step B, loads the entry, and hides the back-to-search chevron', () => {
      storeStub.isEditing.set(true);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      expect(storeStub.loadEntryForEdit).toHaveBeenCalledWith('e1');
      expect(fixture.nativeElement.querySelector('.amount-form')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.back-button')).toBeNull();
    });

    it('shows "Löschen" as a danger text button while editing', () => {
      storeStub.isEditing.set(true);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.danger-text-button').textContent.trim()).toBe(
        'Löschen',
      );
    });

    it('opens the confirm dialog on "Löschen", deletes and closes on confirm', async () => {
      storeStub.isEditing.set(true);
      storeStub.deleteEntry.mockResolvedValue(true);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement.querySelector('.danger-text-button').click();
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('app-confirm-dialog');
      expect(dialog).toBeTruthy();
      expect(dialog.querySelector('.dialog-title').textContent).toBe('Eintrag löschen?');

      dialog.querySelector('.confirm-button').click();
      await fixture.whenStable();

      expect(storeStub.deleteEntry).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: null } }]);
    });

    it('cancelling the confirm dialog does not delete or close', () => {
      storeStub.isEditing.set(true);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement.querySelector('.danger-text-button').click();
      fixture.detectChanges();
      fixture.nativeElement.querySelector('app-confirm-dialog .cancel-button').click();
      fixture.detectChanges();

      expect(storeStub.deleteEntry).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('app-confirm-dialog')).toBeNull();
    });

    it('shows the load error with a retry action when loading the entry fails', () => {
      storeStub.stepBLoadError.set('Eintrag konnte nicht geladen werden.');
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.state-error').textContent).toContain(
        'Eintrag konnte nicht geladen werden.',
      );
      fixture.nativeElement.querySelector('.retry-button').click();
      expect(storeStub.loadEntryForEdit).toHaveBeenCalledWith('e1');
    });
  });

  describe('Barcode-Scan (ADR-0010)', () => {
    it('the camera icon next to the search field starts a scan session and shows the scanner', async () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.scan-button').click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(storeStub.beginScanSession).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('app-barcode-scanner')).toBeTruthy();
    });

    it('shows the source hint in Step B for a persisted source==="off" food, regardless of origin', () => {
      storeStub.stepBFood.set({
        id: 'f1',
        name: 'Müsli',
        kcal100g: 400,
        proteinG100g: 8,
        carbsG100g: 65,
        fatG100g: 10,
        source: 'off',
      });
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      const food = makeFood({ source: 'off' });
      storeStub.results.set([food]);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.source-hint').textContent).toContain(
        'Aus Open Food Facts übernommen',
      );
    });

    it('does not show the source hint for a manual food', () => {
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      const food = makeFood({ source: 'manual' });
      storeStub.results.set([food]);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.source-hint')).toBeNull();
    });

    it('an incomplete OFF hit (scanPhase "prefill-create") auto-switches to Step A2 with the barcode shown', () => {
      storeStub.createForm.set({
        name: 'Unvollständig',
        kcal100g: '250',
        proteinG100g: '',
        carbsG100g: '',
        fatG100g: '',
        defaultPortionG: '',
        barcode: '4008400123456',
      });
      storeStub.scanPhase.set('prefill-create');
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.scan-button').click();
      TestBed.flushEffects();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.barcode-info').textContent).toContain(
        '4008400123456',
      );
    });

    it('a resolved scan (scanPhase "resolved") auto-switches to Step B', () => {
      storeStub.stepBFood.set({
        id: 'off-1',
        name: 'Müsli',
        kcal100g: 400,
        proteinG100g: 8,
        carbsG100g: 65,
        fatG100g: 10,
        source: 'off',
      });
      storeStub.scanPhase.set('resolved');
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.scan-button').click();
      TestBed.flushEffects();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.amount-form')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.source-hint')).toBeTruthy();
    });

    it('submitting Step B for a scan-originated entry shows the success view instead of closing', async () => {
      storeStub.canSaveEntry.set(true);
      storeStub.saveEntry.mockResolvedValue(true);
      storeStub.entryOrigin.set('scan');
      storeStub.lastSavedSummary.set({ name: 'Müsli', kcal: 800 });
      const food = makeFood();
      storeStub.results.set([food]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement
        .querySelector('.amount-form')
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(navigateSpy).not.toHaveBeenCalled();
      const successView = fixture.nativeElement.querySelector('.scan-success');
      expect(successView.textContent).toContain('Müsli');
      expect(successView.textContent).toContain('800');
    });

    it('"Nächsten Barcode scannen" resets for the next scan and returns to the scan step, keeping the meal type', async () => {
      storeStub.canSaveEntry.set(true);
      storeStub.saveEntry.mockResolvedValue(true);
      storeStub.entryOrigin.set('scan');
      const food = makeFood();
      storeStub.results.set([food]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();
      fixture.nativeElement
        .querySelector('.amount-form')
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.scan-success .primary-button').click();
      fixture.detectChanges();

      expect(storeStub.resetForNextScan).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('app-barcode-scanner')).toBeTruthy();
    });

    it('"Fertig" closes the sheet from the success view', async () => {
      storeStub.canSaveEntry.set(true);
      storeStub.saveEntry.mockResolvedValue(true);
      storeStub.entryOrigin.set('scan');
      const food = makeFood();
      storeStub.results.set([food]);
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.result-row').click();
      fixture.detectChanges();
      fixture.nativeElement
        .querySelector('.amount-form')
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement.querySelector('.scan-success .text-button').click();

      expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: null } }]);
    });

    it('a scan error panel offers "Manuell anlegen", switching the sheet to Step A2', async () => {
      storeStub.scanPhase.set('not-found');
      const fixture = TestBed.createComponent(FoodEntrySheetComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.scan-button').click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.scan-error-panel .primary-button').click();
      fixture.detectChanges();

      expect(storeStub.goToManualCreateFromScan).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.create-form')).toBeTruthy();
    });
  });
});
