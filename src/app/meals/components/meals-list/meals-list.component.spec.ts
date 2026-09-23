import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MealsStore } from '../../meals.store';
import { MealsListComponent } from './meals-list.component';

describe('MealsListComponent', () => {
  let storeStub: {
    listLoading: ReturnType<typeof signal>;
    listLoadError: ReturnType<typeof signal>;
    meals: ReturnType<typeof signal>;
    ensureListLoaded: ReturnType<typeof vi.fn>;
    retryListLoad: ReturnType<typeof vi.fn>;
  };

  function makeStoreStub() {
    return {
      listLoading: signal(false),
      listLoadError: signal<string | null>(null),
      meals: signal<unknown[]>([]),
      ensureListLoaded: vi.fn(),
      retryListLoad: vi.fn(),
    };
  }

  beforeEach(() => {
    storeStub = makeStoreStub();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MealsStore, useValue: storeStub }],
    });
  });

  it('calls ensureListLoaded on init', () => {
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();

    expect(storeStub.ensureListLoaded).toHaveBeenCalledTimes(1);
  });

  it('shows a loading skeleton while loading', () => {
    storeStub.listLoading.set(true);
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-loading')).toBeTruthy();
  });

  it('shows an error state with retry', () => {
    storeStub.listLoadError.set('Fehler');
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-text').textContent).toContain('Fehler');
    fixture.nativeElement.querySelector('.retry-button').click();
    expect(storeStub.retryListLoad).toHaveBeenCalledTimes(1);
  });

  it('shows the empty-state text when there are no meals', () => {
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-text').textContent).toContain(
      'Noch keine gespeicherten Mahlzeiten',
    );
  });

  it('renders name, kcal sum and a preview of up to two food names per row', () => {
    storeStub.meals.set([
      {
        meal: {
          id: 'm1',
          name: 'Frühstück-Bowl',
          items: [
            { food: { name: 'Haferflocken' } },
            { food: { name: 'Banane' } },
            { food: { name: 'Honig' } },
          ],
        },
        totals: { kcal: 420, proteinG: 0, carbsG: 0, fatG: 0 },
      },
    ]);
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.meal-row');
    expect(row.querySelector('.meal-name').textContent).toBe('Frühstück-Bowl');
    expect(row.querySelector('.meal-kcal').textContent).toContain('420');
    expect(row.querySelector('.meal-preview').textContent).toBe(
      '3 Positionen: Haferflocken, Banane…',
    );
  });

  it('renders a meal without items as non-interactive with "Keine Positionen"', () => {
    storeStub.meals.set([
      { meal: { id: 'm1', name: 'Leer', items: [] }, totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } },
    ]);
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button.meal-row')).toBeNull();
    const disabledRow = fixture.nativeElement.querySelector('.meal-row-disabled');
    expect(disabledRow.getAttribute('aria-disabled')).toBe('true');
    expect(disabledRow.querySelector('.meal-preview').textContent).toBe('Keine Positionen');
    expect(disabledRow.querySelector('.meal-kcal')).toBeNull();
  });

  it('navigates to the sheet with mealId on row tap', () => {
    storeStub.meals.set([
      {
        meal: { id: 'm1', name: 'Frühstück-Bowl', items: [{ food: { name: 'Apfel' } }] },
        totals: { kcal: 52, proteinG: 0, carbsG: 0, fatG: 0 },
      },
    ]);
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.nativeElement.querySelector('.meal-row').click();

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: ['mahlzeit-bearbeiten'] } }], {
      queryParams: { mealId: 'm1' },
    });
  });

  it('navigates to an empty sheet on "+" tap', () => {
    const fixture = TestBed.createComponent(MealsListComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.nativeElement.querySelector('.add-button').click();

    expect(navigateSpy).toHaveBeenCalledWith([{ outlets: { sheet: ['mahlzeit-bearbeiten'] } }]);
  });
});
