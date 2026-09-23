import { formatWeightKg, validateWeightEntry } from './weight.calculations';

describe('validateWeightEntry', () => {
  it('rejects an empty value', () => {
    expect(validateWeightEntry('')).toEqual({ valid: false, error: 'Bitte ein Gewicht eingeben.' });
  });

  it('rejects a non-numeric value', () => {
    expect(validateWeightEntry('abc').valid).toBe(false);
  });

  it('rejects more than one decimal place', () => {
    const result = validateWeightEntry('72.45');
    expect(result).toEqual({
      valid: false,
      error: 'Bitte höchstens eine Nachkommastelle eingeben.',
    });
  });

  it('accepts a German comma decimal', () => {
    expect(validateWeightEntry('72,4')).toEqual({ valid: true, value: 72.4 });
  });

  it('rejects a value below 20 kg', () => {
    expect(validateWeightEntry('19.9').valid).toBe(false);
  });

  it('rejects a value above 400 kg', () => {
    expect(validateWeightEntry('400.1').valid).toBe(false);
  });

  it('accepts the boundary values', () => {
    expect(validateWeightEntry('20').valid).toBe(true);
    expect(validateWeightEntry('400').valid).toBe(true);
  });
});

describe('formatWeightKg', () => {
  it('formats with exactly one decimal place and a German comma', () => {
    expect(formatWeightKg(72.4)).toBe('72,4');
    expect(formatWeightKg(80)).toBe('80,0');
  });
});
