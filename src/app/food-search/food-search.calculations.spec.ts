import {
  cameraErrorMessage,
  foodToCorrectFormValues,
  isOffProductComplete,
  normalizeMealType,
  normalizeOffProduct,
  nutritionDraftFromFormValues,
  offProductToCreateForm,
  validateCreateFoodForm,
  validateDefaultPortionField,
  validateNutrientField,
} from './food-search.calculations';
import type { Food } from '../core/foods.service';

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

describe('validateNutrientField', () => {
  it('rejects an empty value', () => {
    const result = validateNutrientField('Kalorien', '');
    expect(result).toEqual({ valid: false, error: 'Bitte einen Wert für Kalorien eingeben.' });
  });

  it('rejects a non-numeric value', () => {
    expect(validateNutrientField('Protein', 'abc').valid).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(validateNutrientField('Fett', '-1').valid).toBe(false);
  });

  it('accepts 0 (>= 0 is the rule, not > 0)', () => {
    expect(validateNutrientField('Kohlenhydrate', '0')).toEqual({ valid: true, value: 0 });
  });

  it('accepts a valid positive value', () => {
    expect(validateNutrientField('Kalorien', '52.5')).toEqual({ valid: true, value: 52.5 });
  });
});

describe('validateDefaultPortionField', () => {
  it('accepts an empty value as null (nicht 100, ADR-0008 Punkt 5)', () => {
    expect(validateDefaultPortionField('')).toEqual({ valid: true, value: null });
    expect(validateDefaultPortionField('   ')).toEqual({ valid: true, value: null });
  });

  it('rejects a filled value of 0', () => {
    expect(validateDefaultPortionField('0').valid).toBe(false);
  });

  it('rejects a filled negative value', () => {
    expect(validateDefaultPortionField('-5').valid).toBe(false);
  });

  it('rejects a non-numeric value', () => {
    expect(validateDefaultPortionField('abc').valid).toBe(false);
  });

  it('accepts a valid filled value', () => {
    expect(validateDefaultPortionField('100')).toEqual({ valid: true, value: 100 });
  });
});

describe('validateCreateFoodForm', () => {
  function validValues() {
    return {
      name: 'Apfel',
      kcal100g: '52',
      proteinG100g: '0.3',
      carbsG100g: '14',
      fatG100g: '0.2',
      defaultPortionG: '',
      barcode: '',
    };
  }

  it('produces a parsed value when all fields are valid, defaultPortionG stays null when empty', () => {
    const result = validateCreateFoodForm(validValues());
    expect(result.value).toEqual({
      name: 'Apfel',
      kcal100g: 52,
      proteinG100g: 0.3,
      carbsG100g: 14,
      fatG100g: 0.2,
      defaultPortionG: null,
      barcode: null,
    });
  });

  it('passes a set barcode through unchanged (Scan-Vorbelegung, ADR-0010 Punkt 5)', () => {
    const result = validateCreateFoodForm({ ...validValues(), barcode: '4008400123456' });
    expect(result.value?.barcode).toBe('4008400123456');
  });

  it('includes a filled, valid defaultPortionG in the parsed value', () => {
    const result = validateCreateFoodForm({ ...validValues(), defaultPortionG: '150' });
    expect(result.value?.defaultPortionG).toBe(150);
  });

  it('value is null when any single field is invalid', () => {
    const result = validateCreateFoodForm({ ...validValues(), kcal100g: '' });
    expect(result.value).toBeNull();
    expect(result.kcal100g.valid).toBe(false);
    // other fields remain individually valid/reported
    expect(result.name.valid).toBe(true);
  });

  it('value is null when the optional portion is filled but invalid', () => {
    const result = validateCreateFoodForm({ ...validValues(), defaultPortionG: '0' });
    expect(result.value).toBeNull();
    expect(result.defaultPortionG.valid).toBe(false);
  });
});

describe('normalizeMealType (ADR-0009 Punkt 6/7)', () => {
  it('passes through a valid meal type', () => {
    expect(normalizeMealType('breakfast')).toBe('breakfast');
    expect(normalizeMealType('lunch')).toBe('lunch');
    expect(normalizeMealType('dinner')).toBe('dinner');
    expect(normalizeMealType('snack')).toBe('snack');
  });

  it('falls back to snack for a missing or invalid value', () => {
    expect(normalizeMealType(null)).toBe('snack');
    expect(normalizeMealType('')).toBe('snack');
    expect(normalizeMealType('brunch')).toBe('snack');
  });
});

describe('normalizeOffProduct (ADR-0010 Punkt 3)', () => {
  it('prefers energy-kcal_100g when present', () => {
    const result = normalizeOffProduct(
      {
        product_name: 'Schoko-Müsli',
        nutriments: {
          'energy-kcal_100g': 400,
          proteins_100g: 8,
          carbohydrates_100g: 65,
          fat_100g: 10,
        },
      },
      '4008400123456',
    );

    expect(result).toEqual({
      name: 'Schoko-Müsli',
      barcode: '4008400123456',
      kcal100g: 400,
      proteinG100g: 8,
      carbsG100g: 65,
      fatG100g: 10,
    });
  });

  it('falls back to converting energy_100g from kJ when energy-kcal_100g is missing', () => {
    const result = normalizeOffProduct(
      { product_name: 'Riegel', nutriments: { energy_100g: 1673.6 } },
      '123',
    );

    expect(result.kcal100g).toBeCloseTo(400, 1);
  });

  it('leaves missing nutrients as null, never 0 or estimated (Akzeptanz)', () => {
    const result = normalizeOffProduct(
      { product_name: 'Unvollständig', nutriments: { proteins_100g: 5 } },
      '123',
    );

    expect(result).toEqual({
      name: 'Unvollständig',
      barcode: '123',
      kcal100g: null,
      proteinG100g: 5,
      carbsG100g: null,
      fatG100g: null,
    });
  });

  it('treats a missing product name as an empty string', () => {
    const result = normalizeOffProduct({ nutriments: {} }, '123');
    expect(result.name).toBe('');
  });

  it('rejects a negative nutrient value as null (defensive)', () => {
    const result = normalizeOffProduct({ nutriments: { fat_100g: -1 } }, '123');
    expect(result.fatG100g).toBeNull();
  });
});

describe('isOffProductComplete', () => {
  it('is true only when name and all four nutrients are present', () => {
    expect(
      isOffProductComplete({
        name: 'Apfel',
        barcode: '1',
        kcal100g: 52,
        proteinG100g: 0.3,
        carbsG100g: 14,
        fatG100g: 0.2,
      }),
    ).toBe(true);
  });

  it('is false when the name is empty', () => {
    expect(
      isOffProductComplete({
        name: '',
        barcode: '1',
        kcal100g: 52,
        proteinG100g: 0.3,
        carbsG100g: 14,
        fatG100g: 0.2,
      }),
    ).toBe(false);
  });

  it('is false when any single nutrient is missing', () => {
    expect(
      isOffProductComplete({
        name: 'Apfel',
        barcode: '1',
        kcal100g: 52,
        proteinG100g: null,
        carbsG100g: 14,
        fatG100g: 0.2,
      }),
    ).toBe(false);
  });
});

describe('offProductToCreateForm (Step A2-Vorbelegung, ADR-0010 Punkt 5)', () => {
  it('converts present values to strings and leaves missing ones empty — never "0"', () => {
    const form = offProductToCreateForm({
      name: 'Unvollständig',
      barcode: '4008400123456',
      kcal100g: 250,
      proteinG100g: null,
      carbsG100g: 30,
      fatG100g: null,
    });

    expect(form).toEqual({
      name: 'Unvollständig',
      kcal100g: '250',
      proteinG100g: '',
      carbsG100g: '30',
      fatG100g: '',
      defaultPortionG: '',
      barcode: '4008400123456',
    });
  });
});

describe('cameraErrorMessage', () => {
  it('returns a distinct German text per reason', () => {
    expect(cameraErrorMessage('permission')).toContain('Kamera-Zugriff wurde verweigert');
    expect(cameraErrorMessage('unavailable')).toContain('Kamera konnte nicht gestartet werden');
    expect(cameraErrorMessage('unsupported')).toContain('nicht unterstützt');
  });
});

describe('nutritionDraftFromFormValues', () => {
  it('parses valid string fields into numbers', () => {
    expect(
      nutritionDraftFromFormValues({
        kcal100g: '200',
        proteinG100g: '50',
        carbsG100g: '0',
        fatG100g: '0',
      }),
    ).toEqual({ kcal100g: 200, proteinG100g: 50, carbsG100g: 0, fatG100g: 0 });
  });

  it('treats empty/invalid entries as missing (null), not 0', () => {
    expect(
      nutritionDraftFromFormValues({
        kcal100g: '',
        proteinG100g: 'abc',
        carbsG100g: '0',
        fatG100g: '0',
      }),
    ).toEqual({ kcal100g: null, proteinG100g: null, carbsG100g: 0, fatG100g: 0 });
  });
});

describe('foodToCorrectFormValues (Step-C-Vorbelegung, ADR-0011 Punkt 6)', () => {
  it('prefills all fields from the food, numbers as plain strings', () => {
    const food = makeFood({
      name: 'Apfel',
      kcal100g: 52,
      proteinG100g: 0.3,
      carbsG100g: 14,
      fatG100g: 0.2,
      defaultPortionG: 150,
      barcode: '4008400123456',
    });

    expect(foodToCorrectFormValues(food)).toEqual({
      name: 'Apfel',
      kcal100g: '52',
      proteinG100g: '0.3',
      carbsG100g: '14',
      fatG100g: '0.2',
      defaultPortionG: '150',
      barcode: '4008400123456',
    });
  });

  it('leaves defaultPortionG empty and barcode empty when both are null', () => {
    const food = makeFood({ defaultPortionG: null, barcode: null });

    const result = foodToCorrectFormValues(food);

    expect(result.defaultPortionG).toBe('');
    expect(result.barcode).toBe('');
  });
});
