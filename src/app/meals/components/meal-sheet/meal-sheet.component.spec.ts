import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import type { Food } from '../../../core/foods.service';
import { MealsStore, type DraftMealItem } from '../../meals.store';
import { MealSheetComponent } from './meal-sheet.component';

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

describe('MealSheetComponent', () => {
  let storeStub: {
    isEditingMeal: ReturnType<typeof signal>;
    draftName: ReturnType<typeof signal>;
    draftItems: ReturnType<typeof signal<DraftMealItem[]>>;
    draftSaving: ReturnType<typeof signal>;
    draftSaveError: ReturnType<typeof signal>;
    draftDeleting: ReturnType<typeof signal>;
    draftDeleteError: ReturnType<typeof signal>;
    nameValidation: ReturnType<typeof signal>;
    canSaveMeal: ReturnType<typeof signal>;
    m2Query: ReturnType<typeof signal>;
    m2Results: ReturnType<typeof signal>;
    foodsLoading: ReturnType<typeof signal>;
    foodsLoadError: ReturnType<typeof signal>;
    m3Food: ReturnType<typeof signal>;
    m3AmountInput: ReturnType<typeof signal>;
    m3AmountValidation: ReturnType<typeof signal>;
    canConfirmAmount: ReturnType<typeof signal>;
    isChangeMode: ReturnType<typeof signal>;
    ensureListLoaded: ReturnType<typeof vi.fn>;
    ensureFoodsLoaded: ReturnType<typeof vi.fn>;
    retryFoodsLoad: ReturnType<typeof vi.fn>;
    beginNewMeal: ReturnType<typeof vi.fn>;
    beginEditMeal: ReturnType<typeof vi.fn>;
    setDraftName: ReturnType<typeof vi.fn>;
    removeDraftItem: ReturnType<typeof vi.fn>;
    beginAddItem: ReturnType<typeof vi.fn>;
    beginChangeItem: ReturnType<typeof vi.fn>;
    setM2Query: ReturnType<typeof vi.fn>;
    selectM2Food: ReturnType<typeof vi.fn>;
    setM3AmountInput: ReturnType<typeof vi.fn>;
    confirmAmount: ReturnType<typeof vi.fn>;
    saveMeal: ReturnType<typeof vi.fn>;
    deleteMeal: ReturnType<typeof vi.fn>;
  };

  function makeStoreStub() {
    return {
      isEditingMeal: signal(false),
      draftName: signal(''),
      draftItems: signal<DraftMealItem[]>([]),
      draftSaving: signal(false),
      draftSaveError: signal<string | null>(null),
      draftDeleting: signal(false),
      draftDeleteError: signal<string | null>(null),
      nameValidation: signal({ valid: false, error: 'Bitte einen Namen eingeben.' }),
      canSaveMeal: signal(false),
      m2Query: signal(''),
      m2Results: signal<Food[]>([]),
      foodsLoading: signal(false),
      foodsLoadError: signal<string | null>(null),
      m3Food: signal<Food | null>(null),
      m3AmountInput: signal(''),
      m3AmountValidation: signal({ valid: false, error: 'Bitte eine Menge eingeben.' }),
      canConfirmAmount: signal(false),
      isChangeMode: signal(false),
      ensureListLoaded: vi.fn().mockResolvedValue(undefined),
      ensureFoodsLoaded: vi.fn().mockResolvedValue(undefined),
      retryFoodsLoad: vi.fn(),
      beginNewMeal: vi.fn(),
      beginEditMeal: vi.fn().mockReturnValue(true),
      setDraftName: vi.fn(),
      removeDraftItem: vi.fn(),
      beginAddItem: vi.fn(),
      beginChangeItem: vi.fn(),
      setM2Query: vi.fn(),
      selectM2Food: vi.fn(),
      setM3AmountInput: vi.fn(),
      confirmAmount: vi.fn().mockReturnValue(true),
      saveMeal: vi.fn().mockResolvedValue(true),
      deleteMeal: vi.fn().mockResolvedValue(true),
    };
  }

  async function configure(queryParams: Record<string, string>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MealSheetComponent],
      providers: [
        provideRouter([]),
        { provide: MealsStore, useValue: storeStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();
  }

  beforeEach(async () => {
    storeStub = makeStoreStub();
    await configure({});
  });

  it('starts a new draft when no mealId query param is present', () => {
    const fixture = TestBed.createComponent(MealSheetComponent);
    fixture.detectChanges();

    expect(storeStub.beginNewMeal).toHaveBeenCalledTimes(1);
    expect(storeStub.ensureListLoaded).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.sheet-title').textContent.trim()).toBe(
      'Mahlzeit anlegen',
    );
  });

  it('loads the meal list then begins editing when mealId is present', async () => {
    await configure({ mealId: 'm1' });
    const fixture = TestBed.createComponent(MealSheetComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(storeStub.ensureListLoaded).toHaveBeenCalledTimes(1);
    expect(storeStub.beginEditMeal).toHaveBeenCalledWith('m1');
    expect(storeStub.beginNewMeal).not.toHaveBeenCalled();
  });

  it('closes via the bottom-sheet close output by clearing the sheet outlet', () => {
    const fixture = TestBed.createComponent(MealSheetComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.nativeElement.querySelector('.backdrop').click();

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: null } }]);
  });

  describe('M1 — Positionsliste', () => {
    it('renders chevron + amount/kcal per item, tap on the row body opens M3 in change mode (SKIPPING M2)', () => {
      storeStub.draftItems.set([
        { foodId: 'f1', amountG: 150, foodName: 'Apfel', kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 },
      ]);
      const fixture = TestBed.createComponent(MealSheetComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.chevron')).toBeTruthy();
      const body = fixture.nativeElement.querySelector('.item-row-body');
      expect(body.textContent).toContain('Apfel');
      expect(body.textContent).toContain('150');

      body.click();

      expect(storeStub.beginChangeItem).toHaveBeenCalledWith(0);
    });

    it('x-button removes the item and does NOT trigger the row tap (stopPropagation)', () => {
      storeStub.draftItems.set([
        { foodId: 'f1', amountG: 150, foodName: 'Apfel', kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 },
      ]);
      const fixture = TestBed.createComponent(MealSheetComponent);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.remove-button').click();

      expect(storeStub.removeDraftItem).toHaveBeenCalledWith(0);
      expect(storeStub.beginChangeItem).not.toHaveBeenCalled();
    });

    it('"Food hinzufügen" opens M2', () => {
      const fixture = TestBed.createComponent(MealSheetComponent);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.secondary-button').click();

      expect(storeStub.beginAddItem).toHaveBeenCalledTimes(1);
    });

    it('Speichern is disabled while canSaveMeal is false', () => {
      const fixture = TestBed.createComponent(MealSheetComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.save-button').disabled).toBe(true);
    });

    it('shows "Mahlzeit löschen" only when editing an existing meal', () => {
      const fixture = TestBed.createComponent(MealSheetComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.danger-text-button')).toBeNull();

      storeStub.isEditingMeal.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.danger-text-button')).toBeTruthy();
    });

    it('opens the confirm dialog on delete request and calls store.deleteMeal on confirm', async () => {
      storeStub.isEditingMeal.set(true);
      const fixture = TestBed.createComponent(MealSheetComponent);
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.danger-text-button').click();
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('app-confirm-dialog');
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute('ng-reflect-title') ?? '').not.toBeNull();
    });
  });

  describe('M2 — nur Auswahl bestehender Foods (Nutzerentscheidung 2026-09-21)', () => {
    it('the marker in M2 is not interactive (no <button> for the marker)', () => {
      storeStub.m2Results.set([makeFood()]);
      const fixture = TestBed.createComponent(MealSheetComponent);
      fixture.detectChanges();
      storeStub.draftItems.set([]);
      // Force step into m2 via the injected component (simulate goToAddItem)
      (fixture.componentInstance as unknown as { step: { set: (v: string) => void } }).step.set(
        'm2',
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.marker-slot button')).toBeNull();
    });

    it('tap on a result row selects the food and opens M3', () => {
      storeStub.m2Results.set([makeFood()]);
      const fixture = TestBed.createComponent(MealSheetComponent);
      (fixture.componentInstance as unknown as { step: { set: (v: string) => void } }).step.set(
        'm2',
      );
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.result-row').click();

      expect(storeStub.selectM2Food).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
    });
  });

  describe('M3 — CTA-Beschriftung "Hinzufügen" vs. "Übernehmen"', () => {
    it('shows "Hinzufügen" in add mode', () => {
      storeStub.isChangeMode.set(false);
      storeStub.m3Food.set(makeFood());
      const fixture = TestBed.createComponent(MealSheetComponent);
      (fixture.componentInstance as unknown as { step: { set: (v: string) => void } }).step.set(
        'm3',
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.save-button').textContent.trim()).toBe(
        'Hinzufügen',
      );
    });

    it('shows "Übernehmen" in change mode (Nutzerentscheidung 2026-09-21)', () => {
      storeStub.isChangeMode.set(true);
      storeStub.m3Food.set(makeFood());
      const fixture = TestBed.createComponent(MealSheetComponent);
      (fixture.componentInstance as unknown as { step: { set: (v: string) => void } }).step.set(
        'm3',
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.save-button').textContent.trim()).toBe(
        'Übernehmen',
      );
    });

    it('submitting confirms the amount and returns to M1', () => {
      storeStub.m3Food.set(makeFood());
      storeStub.canConfirmAmount.set(true);
      const fixture = TestBed.createComponent(MealSheetComponent);
      const instance = fixture.componentInstance as unknown as {
        step: { set: (v: string) => void };
      };
      instance.step.set('m3');
      fixture.detectChanges();

      const form = fixture.nativeElement.querySelector('.m3-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));

      expect(storeStub.confirmAmount).toHaveBeenCalledTimes(1);
    });
  });
});
