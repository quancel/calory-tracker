import { goalFieldConfig, parseGoalNumber, validateGoalField } from './goals.calculations';

describe('parseGoalNumber', () => {
  it('parses a plain integer', () => {
    expect(parseGoalNumber('2000')).toBe(2000);
  });

  it('parses a decimal with dot', () => {
    expect(parseGoalNumber('60.5')).toBe(60.5);
  });

  it('parses a decimal with German comma', () => {
    expect(parseGoalNumber('60,5')).toBe(60.5);
  });

  it('returns null for empty input', () => {
    expect(parseGoalNumber('  ')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseGoalNumber('abc')).toBeNull();
    expect(parseGoalNumber('12kcal')).toBeNull();
  });
});

describe('goalFieldConfig', () => {
  it('exposes the kcal-specific range (0 exclusive, 10000)', () => {
    const config = goalFieldConfig('kcal');
    expect(config.min).toBe(0);
    expect(config.minExclusive).toBe(true);
    expect(config.max).toBe(10000);
    expect(config.column).toBe('kcal');
  });

  it('exposes the macro range (0 inclusive, 1000) for all three macros', () => {
    for (const key of ['carbsG', 'proteinG', 'fatG'] as const) {
      const config = goalFieldConfig(key);
      expect(config.min).toBe(0);
      expect(config.minExclusive).toBe(false);
      expect(config.max).toBe(1000);
    }
  });
});

describe('validateGoalField', () => {
  it('rejects an empty value with a German hint', () => {
    const result = validateGoalField('kcal', '');
    expect(result).toEqual({ valid: false, error: 'Bitte einen Wert eingeben.' });
  });

  it('rejects a non-numeric value', () => {
    const result = validateGoalField('carbsG', 'abc');
    expect(result).toEqual({ valid: false, error: 'Bitte eine gültige Zahl eingeben.' });
  });

  it('rejects a negative macro value', () => {
    const result = validateGoalField('proteinG', '-5');
    expect(result.valid).toBe(false);
  });

  it('rejects kcal <= 0 (kcal has an exclusive lower bound)', () => {
    expect(validateGoalField('kcal', '0').valid).toBe(false);
    expect(validateGoalField('kcal', '-100').valid).toBe(false);
  });

  it('accepts 0 for a macro — "Ziel entfernen" is a valid client value', () => {
    const result = validateGoalField('fatG', '0');
    expect(result).toEqual({ valid: true, value: 0 });
  });

  it('rejects kcal above 10000', () => {
    expect(validateGoalField('kcal', '10001').valid).toBe(false);
  });

  it('rejects a macro above 1000', () => {
    expect(validateGoalField('carbsG', '1001').valid).toBe(false);
  });

  it('accepts a valid kcal value', () => {
    expect(validateGoalField('kcal', '2200')).toEqual({ valid: true, value: 2200 });
  });

  it('accepts the upper boundary values', () => {
    expect(validateGoalField('kcal', '10000')).toEqual({ valid: true, value: 10000 });
    expect(validateGoalField('proteinG', '1000')).toEqual({ valid: true, value: 1000 });
  });
});

describe('validateGoalField — targetWeightKg (ADR-0018 Punkt 2, optionales Feld)', () => {
  it('accepts an empty value as "kein Zielgewicht gesetzt" (value: null), no error', () => {
    expect(validateGoalField('targetWeightKg', '')).toEqual({ valid: true, value: null });
    expect(validateGoalField('targetWeightKg', '   ')).toEqual({ valid: true, value: null });
  });

  it('accepts a valid value within 20.0–400.0 kg', () => {
    expect(validateGoalField('targetWeightKg', '72.5')).toEqual({ valid: true, value: 72.5 });
  });

  it('accepts a German comma decimal', () => {
    expect(validateGoalField('targetWeightKg', '72,5')).toEqual({ valid: true, value: 72.5 });
  });

  it('accepts the boundary values 20.0 and 400.0', () => {
    expect(validateGoalField('targetWeightKg', '20')).toEqual({ valid: true, value: 20 });
    expect(validateGoalField('targetWeightKg', '400')).toEqual({ valid: true, value: 400 });
  });

  it('rejects a value below 20 kg', () => {
    expect(validateGoalField('targetWeightKg', '19.9').valid).toBe(false);
  });

  it('rejects a value above 400 kg', () => {
    expect(validateGoalField('targetWeightKg', '400.1').valid).toBe(false);
  });

  it('rejects more than one decimal place', () => {
    const result = validateGoalField('targetWeightKg', '72.55');
    expect(result).toEqual({
      valid: false,
      error: 'Gewicht darf höchstens 1 Nachkommastelle haben.',
    });
  });

  it('rejects a non-numeric value', () => {
    expect(validateGoalField('targetWeightKg', 'abc').valid).toBe(false);
  });
});
