import {
  addDaysToKey,
  formatDateLabel,
  maxForwardKey,
  todayKey,
} from './date.calculations';

describe('todayKey / addDaysToKey / maxForwardKey', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 8, 20, 23, 59))).toBe('2026-09-20');
  });

  it('shifts across month and year boundaries', () => {
    expect(addDaysToKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('computes today + 7 as the max forward date', () => {
    expect(maxForwardKey(new Date(2026, 8, 20))).toBe('2026-09-27');
  });
});

describe('formatDateLabel', () => {
  const reference = new Date(2026, 8, 20); // Sonntag, 20. Sep. 2026

  it('labels today, tomorrow, and the forward window relatively', () => {
    expect(formatDateLabel('2026-09-20', reference)).toEqual({ text: 'Heute', kind: 'today' });
    expect(formatDateLabel('2026-09-21', reference)).toEqual({ text: 'Morgen', kind: 'tomorrow' });
    expect(formatDateLabel('2026-09-27', reference)).toEqual({
      text: 'in 7 Tagen',
      kind: 'future-relative',
    });
  });

  it('labels yesterday relatively, all other past days as weekday + date', () => {
    expect(formatDateLabel('2026-09-19', reference)).toEqual({
      text: 'Gestern',
      kind: 'yesterday',
    });
    expect(formatDateLabel('2026-09-14', reference)).toEqual({
      text: 'Mo, 14. Sep.',
      kind: 'past-weekday',
    });
  });
});
