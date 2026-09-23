import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';
import { CoreMealsService } from './meals.service';

describe('CoreMealsService.loadMeals (ADR-0012 Punkt 3)', () => {
  function setup(response: { data: unknown; error: unknown }) {
    const select = vi.fn().mockResolvedValue(response);
    const from = vi.fn().mockReturnValue({ select });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });

    return { from, select };
  }

  it('maps meals with embedded items/foods to the domain model', async () => {
    const { from, select } = setup({
      data: [
        {
          id: 'm1',
          name: 'Frühstück-Bowl',
          meal_items: [
            {
              id: 'mi1',
              amount_g: 150,
              foods: {
                id: 'f1',
                name: 'Apfel',
                kcal_100g: 52,
                protein_100g: 0.3,
                carbs_100g: 14,
                fat_100g: 0.2,
              },
            },
          ],
        },
      ],
      error: null,
    });

    const service = TestBed.inject(CoreMealsService);
    const result = await service.loadMeals();

    expect(from).toHaveBeenCalledWith('meals');
    expect(select).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      meals: [
        {
          id: 'm1',
          name: 'Frühstück-Bowl',
          items: [
            {
              id: 'mi1',
              amountG: 150,
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
      ],
    });
  });

  it('treats a null meal_items list as no positions', async () => {
    setup({ data: [{ id: 'm1', name: 'Leer', meal_items: null }], error: null });

    const service = TestBed.inject(CoreMealsService);
    const result = await service.loadMeals();

    expect(result).toEqual({ success: true, meals: [{ id: 'm1', name: 'Leer', items: [] }] });
  });

  it('skips a position without an embedded food defensively', async () => {
    setup({
      data: [
        {
          id: 'm1',
          name: 'Mahlzeit',
          meal_items: [{ id: 'mi1', amount_g: 100, foods: null }],
        },
      ],
      error: null,
    });

    const service = TestBed.inject(CoreMealsService);
    const result = await service.loadMeals();

    expect(result).toEqual({ success: true, meals: [{ id: 'm1', name: 'Mahlzeit', items: [] }] });
  });

  it('returns a generic error message when the query fails', async () => {
    setup({ data: null, error: { message: 'network down' } });

    const service = TestBed.inject(CoreMealsService);
    const result = await service.loadMeals();

    expect(result).toEqual({
      success: false,
      message: 'Gespeicherte Mahlzeiten konnten nicht geladen werden.',
    });
  });
});
