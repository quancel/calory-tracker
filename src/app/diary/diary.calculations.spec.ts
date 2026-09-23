import type { DiaryEntry } from './models/diary.model';
import {
  computeDayTotals,
  computeMealSections,
  suggestedMealTypeForHour,
} from './diary.calculations';

function makeEntry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: overrides.id ?? 'entry-1',
    mealType: overrides.mealType ?? 'breakfast',
    amountG: overrides.amountG ?? 100,
    createdAt: overrides.createdAt ?? '2026-09-20T08:00:00Z',
    syncState: overrides.syncState ?? 'synced',
    food: overrides.food ?? {
      id: 'food-1',
      name: 'Haferflocken',
      kcal100g: 370,
      proteinG100g: 13,
      carbsG100g: 60,
      fatG100g: 7,
    },
  };
}

describe('suggestedMealTypeForHour — Tageszeit-Grenzzeiten', () => {
  it('maps the lower bound of each window inclusively', () => {
    expect(suggestedMealTypeForHour(5)).toBe('breakfast');
    expect(suggestedMealTypeForHour(11)).toBe('lunch');
    expect(suggestedMealTypeForHour(16)).toBe('dinner');
    expect(suggestedMealTypeForHour(22)).toBe('snack');
  });

  it('maps the upper bound of each window exclusively (one minute before switch)', () => {
    expect(suggestedMealTypeForHour(4)).toBe('snack');
    expect(suggestedMealTypeForHour(10)).toBe('breakfast');
    expect(suggestedMealTypeForHour(15)).toBe('lunch');
    expect(suggestedMealTypeForHour(21)).toBe('dinner');
  });

  it('falls back to snack overnight (22–05 Uhr)', () => {
    expect(suggestedMealTypeForHour(0)).toBe('snack');
    expect(suggestedMealTypeForHour(23)).toBe('snack');
  });
});

describe('computeDayTotals', () => {
  it('sums kcal and all three macros from amount_g/100 * value per 100g', () => {
    const entries = [
      makeEntry({ amountG: 200 }), // 740 kcal, 26 P, 120 C, 14 F
      makeEntry({
        amountG: 50,
        food: {
          id: 'food-2',
          name: 'Ei',
          kcal100g: 155,
          proteinG100g: 13,
          carbsG100g: 1.1,
          fatG100g: 11,
        },
      }), // 77.5 kcal, 6.5 P, 0.55 C, 5.5 F
    ];

    const totals = computeDayTotals(entries);

    expect(totals.kcal).toBeCloseTo(817.5);
    expect(totals.proteinG).toBeCloseTo(32.5);
    expect(totals.carbsG).toBeCloseTo(120.55);
    expect(totals.fatG).toBeCloseTo(19.5);
  });

  it('returns all-zero totals for an empty day', () => {
    expect(computeDayTotals([])).toEqual({ kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 });
  });
});

describe('computeMealSections', () => {
  it('groups entries into all four sections in fixed order, including empty ones', () => {
    const entries = [
      makeEntry({ id: 'e1', mealType: 'lunch', amountG: 100 }),
      makeEntry({ id: 'e2', mealType: 'breakfast', amountG: 100 }),
    ];

    const sections = computeMealSections(entries);

    expect(sections.map((s) => s.mealType)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(sections.map((s) => s.label)).toEqual(['Frühstück', 'Mittag', 'Abend', 'Snacks']);
    expect(sections.find((s) => s.mealType === 'breakfast')?.entries).toHaveLength(1);
    expect(sections.find((s) => s.mealType === 'dinner')?.entries).toHaveLength(0);
    expect(sections.find((s) => s.mealType === 'dinner')?.kcal).toBe(0);
  });

  it('computes each section subtotal as the kcal sum of its own entries', () => {
    const entries = [
      makeEntry({ id: 'e1', mealType: 'snack', amountG: 100 }), // 370 kcal
      makeEntry({ id: 'e2', mealType: 'snack', amountG: 50 }), // 185 kcal
    ];

    const sections = computeMealSections(entries);

    expect(sections.find((s) => s.mealType === 'snack')?.kcal).toBeCloseTo(555);
  });
});
