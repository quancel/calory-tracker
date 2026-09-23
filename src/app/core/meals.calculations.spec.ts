import { computeMealTotals, sortMealsByName } from './meals.calculations';

describe('sortMealsByName (ADR-0012 Punkt 3/4)', () => {
  it('sorts case-insensitively, German collation, allows duplicate names', () => {
    const meals = [
      { name: 'banane' },
      { name: 'Apfelkuchen' },
      { name: 'Öl-Salat' },
      { name: 'apfel' },
    ];

    const result = sortMealsByName(meals);

    expect(result.map((m) => m.name)).toEqual(['apfel', 'Apfelkuchen', 'banane', 'Öl-Salat']);
  });

  it('does not mutate the input array', () => {
    const meals = [{ name: 'b' }, { name: 'a' }];
    const result = sortMealsByName(meals);

    expect(result).not.toBe(meals);
    expect(meals.map((m) => m.name)).toEqual(['b', 'a']);
  });

  it('has no secondary sort criterion — equal names keep their relative order (stable sort)', () => {
    const meals = [
      { name: 'Frühstück', tag: 1 },
      { name: 'Frühstück', tag: 2 },
    ];

    const result = sortMealsByName(meals);

    expect(result.map((m) => m.tag)).toEqual([1, 2]);
  });
});

describe('computeMealTotals', () => {
  it('sums scaled nutrition (amount_g / 100) across all items', () => {
    const totals = computeMealTotals([
      { amountG: 100, kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 },
      { amountG: 200, kcal100g: 89, proteinG100g: 1.1, carbsG100g: 23, fatG100g: 0.3 },
    ]);

    expect(totals).toEqual({
      kcal: 52 + 178,
      proteinG: 0.3 + 2.2,
      carbsG: 14 + 46,
      fatG: 0.2 + 0.6,
    });
  });

  it('returns all-zero totals for an empty item list', () => {
    expect(computeMealTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});
