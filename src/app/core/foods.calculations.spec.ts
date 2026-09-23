import {
  computeLiveNutrition,
  filterFoodsByQuery,
  findPlausibilityFindings,
  isNutritionIncomplete,
  parseDecimal,
  plausibilityMarkerStatusText,
  resolveDefaultAmount,
  resolvePlausibilityMarker,
  validateAmountField,
  validateNameField,
} from './foods.calculations';
import type { Food } from './foods.service';

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

describe('filterFoodsByQuery', () => {
  const foods = [
    makeFood({ id: '1', name: 'Apfel' }),
    makeFood({ id: '2', name: 'Banane' }),
    makeFood({ id: '3', name: 'Apfelmus' }),
  ];

  it('returns all foods for an empty/whitespace query', () => {
    expect(filterFoodsByQuery(foods, '')).toHaveLength(3);
    expect(filterFoodsByQuery(foods, '   ')).toHaveLength(3);
  });

  it('filters by case-insensitive substring match', () => {
    const result = filterFoodsByQuery(foods, 'apf');
    expect(result.map((f) => f.id)).toEqual(['1', '3']);
  });

  it('matches independent of case', () => {
    const result = filterFoodsByQuery(foods, 'BANANE');
    expect(result.map((f) => f.id)).toEqual(['2']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterFoodsByQuery(foods, 'Zzz')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const result = filterFoodsByQuery(foods, '');
    expect(result).not.toBe(foods);
  });
});

describe('parseDecimal', () => {
  it('parses a plain integer', () => {
    expect(parseDecimal('52')).toBe(52);
  });

  it('parses a decimal with dot', () => {
    expect(parseDecimal('52.5')).toBe(52.5);
  });

  it('parses a decimal with German comma', () => {
    expect(parseDecimal('52,5')).toBe(52.5);
  });

  it('returns null for empty/non-numeric input', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('12kcal')).toBeNull();
  });
});

describe('validateNameField', () => {
  it('rejects an empty/whitespace-only name', () => {
    expect(validateNameField('').valid).toBe(false);
    expect(validateNameField('   ').valid).toBe(false);
  });

  it('accepts and trims a valid name', () => {
    expect(validateNameField('  Apfel  ')).toEqual({ valid: true, value: 'Apfel' });
  });
});

describe('validateAmountField (Step B / M3, ADR-0009 Punkt 8)', () => {
  it('rejects an empty/whitespace-only value', () => {
    expect(validateAmountField('').valid).toBe(false);
    expect(validateAmountField('   ').valid).toBe(false);
  });

  it('rejects a non-numeric value', () => {
    expect(validateAmountField('abc').valid).toBe(false);
  });

  it('rejects 0', () => {
    expect(validateAmountField('0').valid).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(validateAmountField('-5').valid).toBe(false);
  });

  it('accepts a valid positive value with dot or comma', () => {
    expect(validateAmountField('150')).toEqual({ valid: true, value: 150 });
    expect(validateAmountField('150,5')).toEqual({ valid: true, value: 150.5 });
  });

  it('has no upper bound (Nutzer-bestätigt)', () => {
    expect(validateAmountField('100000')).toEqual({ valid: true, value: 100000 });
  });
});

describe('resolveDefaultAmount', () => {
  it('uses defaultPortionG when set', () => {
    expect(resolveDefaultAmount({ defaultPortionG: 150 })).toBe('150');
  });

  it('falls back to 100 when defaultPortionG is null (reine UI-Vorbelegung)', () => {
    expect(resolveDefaultAmount({ defaultPortionG: null })).toBe('100');
  });
});

describe('computeLiveNutrition', () => {
  const food = { kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 };

  it('scales all four values by amountG / 100', () => {
    expect(computeLiveNutrition(food, 200)).toEqual({
      kcal: 104,
      proteinG: 0.6,
      carbsG: 28,
      fatG: 0.4,
    });
  });

  it('handles amounts below 100g', () => {
    expect(computeLiveNutrition(food, 50)).toEqual({
      kcal: 26,
      proteinG: 0.15,
      carbsG: 7,
      fatG: 0.1,
    });
  });
});

describe('isNutritionIncomplete', () => {
  it('is false when all four values are present', () => {
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 }),
    ).toBe(false);
  });

  it('is true when any single value is null', () => {
    expect(
      isNutritionIncomplete({ kcal100g: null, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 }),
    ).toBe(true);
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: null, carbsG100g: 14, fatG100g: 0.2 }),
    ).toBe(true);
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: 0.3, carbsG100g: null, fatG100g: 0.2 }),
    ).toBe(true);
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: null }),
    ).toBe(true);
  });
});

describe('findPlausibilityFindings (ADR-0011 Punkt 3/4)', () => {
  it('returns no findings for fully plausible, complete nutrition', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 200,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings).toEqual([]);
  });

  it('flags "incomplete" when at least one required value is missing', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 200,
      proteinG100g: 50,
      carbsG100g: null,
      fatG100g: 0,
    });

    expect(findings).toEqual([expect.objectContaining({ kind: 'incomplete' })]);
  });

  it('flags "macro-sum-exceeded" using only the present macro values, even with one missing (ADR-0011 Punkt 4)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 200,
      proteinG100g: 60,
      carbsG100g: 50,
      fatG100g: null,
    });

    expect(findings).toEqual([
      expect.objectContaining({ kind: 'incomplete' }),
      expect.objectContaining({ kind: 'macro-sum-exceeded', message: expect.stringContaining('110') }),
    ]);
  });

  it('does NOT run the kcal-deviation check when any of the four values is missing (no false positive from a 0-assumption)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 500,
      proteinG100g: 10,
      carbsG100g: 10,
      fatG100g: null,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });

  it('does not flag a 9% kcal deviation (below the 10% threshold)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 218,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });

  it('does not flag exactly 10% kcal deviation (boundary is inclusive of tolerance, ">10%" not ">=10%")', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 220,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });

  it('flags an 11% kcal deviation', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 222,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings).toEqual([
      expect.objectContaining({ kind: 'kcal-deviation', message: expect.stringContaining('11%') }),
    ]);
  });

  it('can report BOTH macro-sum-exceeded and kcal-deviation at the same time', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 1000,
      proteinG100g: 60,
      carbsG100g: 50,
      fatG100g: 0,
    });

    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(['macro-sum-exceeded', 'kcal-deviation']),
    );
  });

  it('does not divide by zero when all macros are 0 kcal (no kcal-deviation finding)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 50,
      proteinG100g: 0,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });
});

describe('resolvePlausibilityMarker (Einzel-Slot-Priorisierung, design-conventions.md)', () => {
  it('returns null when nothing is wrong', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 50, carbsG100g: 0, fatG100g: 0 }),
    ).toBeNull();
  });

  it('returns "incomplete" when only a value is missing', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 50, carbsG100g: 0, fatG100g: null }),
    ).toEqual({ kind: 'incomplete' });
  });

  it('returns "implausible" when only the macro sum is exceeded', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 60, carbsG100g: 50, fatG100g: 0 }),
    ).toEqual({ kind: 'implausible' });
  });

  it('prioritizes "implausible" over "incomplete" when both findings apply (ADR-0011/design-conventions.md)', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 60, carbsG100g: 50, fatG100g: null }),
    ).toEqual({ kind: 'implausible' });
  });
});

describe('plausibilityMarkerStatusText', () => {
  it('names the priorized status only', () => {
    expect(plausibilityMarkerStatusText({ kind: 'implausible' })).toBe('Nährwerte unplausibel');
    expect(plausibilityMarkerStatusText({ kind: 'incomplete' })).toBe('Nährwerte unvollständig');
  });
});
