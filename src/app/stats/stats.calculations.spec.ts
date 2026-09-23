import type { StatsEntry } from './models/stats.model';
import {
  anchorForKindChange,
  buildDayBuckets,
  canNavigateForward,
  computeBarFillPercents,
  computeChartScale,
  computePeriodAverages,
  computePeriodBounds,
  formatPeriodLabel,
  isPeriodEmpty,
  shiftPeriod,
} from './stats.calculations';

describe('computePeriodBounds — week (Montag–Sonntag)', () => {
  it('resolves the Monday–Sunday range that contains a mid-week anchor', () => {
    // 2026-09-16 ist ein Mittwoch
    const bounds = computePeriodBounds('week', '2026-09-16');
    expect(bounds.startKey).toBe('2026-09-14'); // Montag
    expect(bounds.endKey).toBe('2026-09-20'); // Sonntag
    expect(bounds.dateKeys).toHaveLength(7);
    expect(bounds.dateKeys[0]).toBe('2026-09-14');
    expect(bounds.dateKeys[6]).toBe('2026-09-20');
  });

  it('keeps the same week when the anchor is already a Monday or a Sunday', () => {
    expect(computePeriodBounds('week', '2026-09-14').startKey).toBe('2026-09-14');
    expect(computePeriodBounds('week', '2026-09-20').startKey).toBe('2026-09-14');
  });

  it('crosses a month boundary correctly', () => {
    // 2026-09-30 ist ein Mittwoch
    const bounds = computePeriodBounds('week', '2026-09-30');
    expect(bounds.startKey).toBe('2026-09-28');
    expect(bounds.endKey).toBe('2026-10-04');
  });
});

describe('computePeriodBounds — month', () => {
  it('resolves the full calendar month containing the anchor', () => {
    const bounds = computePeriodBounds('month', '2026-09-16');
    expect(bounds.startKey).toBe('2026-09-01');
    expect(bounds.endKey).toBe('2026-09-30');
    expect(bounds.dateKeys).toHaveLength(30);
  });

  it('handles a 31-day and a leap-year February month correctly', () => {
    expect(computePeriodBounds('month', '2026-01-15').dateKeys).toHaveLength(31);
    expect(computePeriodBounds('month', '2028-02-10').dateKeys).toHaveLength(29); // 2028 ist Schaltjahr
  });
});

describe('anchorForKindChange — Kontext-Erhalt beim Wechsel Woche ↔ Monat', () => {
  it('keeps the first day of the previous period as the new anchor', () => {
    const bounds = computePeriodBounds('week', '2026-09-16');
    expect(anchorForKindChange(bounds, '2026-01-01')).toBe('2026-09-14');
  });

  it('uses "heute" as the new anchor when the previous period contained it', () => {
    const bounds = computePeriodBounds('week', '2026-09-16');
    expect(anchorForKindChange(bounds, '2026-09-18')).toBe('2026-09-18');
  });
});

describe('shiftPeriod', () => {
  it('shifts a week by exactly 7 days', () => {
    const bounds = computePeriodBounds('week', '2026-09-16');
    expect(shiftPeriod('week', bounds, 1)).toBe('2026-09-21');
    expect(shiftPeriod('week', bounds, -1)).toBe('2026-09-07');
  });

  it('shifts a month to the first day of the previous/next month, across a year boundary', () => {
    const december = computePeriodBounds('month', '2026-12-10');
    expect(shiftPeriod('month', december, 1)).toBe('2027-01-01');
    expect(shiftPeriod('month', december, -1)).toBe('2026-11-01');
  });
});

describe('canNavigateForward — Vorwärtsgrenze heute + 7', () => {
  const maxForward = '2026-09-27'; // heute (2026-09-20) + 7

  it('allows a next period that still contains at least one day within the forward window', () => {
    const nextWeek = computePeriodBounds('week', '2026-09-21'); // 21.–27. Sep.
    expect(canNavigateForward(nextWeek, maxForward)).toBe(true);
  });

  it('disallows a next period that lies entirely beyond the forward window', () => {
    const laterWeek = computePeriodBounds('week', '2026-09-28'); // 28. Sep.–4. Okt.
    expect(canNavigateForward(laterWeek, maxForward)).toBe(false);
  });
});

describe('formatPeriodLabel', () => {
  it('formats a week label within a single month', () => {
    const bounds = computePeriodBounds('week', '2026-09-16');
    expect(formatPeriodLabel('week', bounds)).toBe('14.–20. Sep.');
  });

  it('formats a week label that crosses a month boundary', () => {
    const bounds = computePeriodBounds('week', '2026-09-30');
    expect(formatPeriodLabel('week', bounds)).toBe('28. Sep. – 4. Okt.');
  });

  it('formats a month label', () => {
    const bounds = computePeriodBounds('month', '2026-09-16');
    expect(formatPeriodLabel('month', bounds)).toBe('September 2026');
  });
});

function makeEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    dateKey: overrides.dateKey ?? '2026-09-14',
    amountG: overrides.amountG ?? 100,
    food: overrides.food ?? { kcal100g: 200, proteinG100g: 10, carbsG100g: 20, fatG100g: 5 },
  };
}

describe('buildDayBuckets — drei Balkenzustände', () => {
  const todayKeyValue = '2026-09-20';

  it('classifies a past/today day without entries as a gap, excluded from the average', () => {
    const [bucket] = buildDayBuckets(['2026-09-18'], [], todayKeyValue);
    expect(bucket.state).toBe('gap');
    expect(bucket.hasEntries).toBe(false);
    expect(bucket.isFuture).toBe(false);
    expect(bucket.countsForAverage).toBe(false);
  });

  it('classifies a future day without entries as future-empty, regardless of distance (also beyond heute+7)', () => {
    const nearFuture = buildDayBuckets(['2026-09-22'], [], todayKeyValue)[0]; // heute + 2
    const farFuture = buildDayBuckets(['2026-10-15'], [], todayKeyValue)[0]; // weit jenseits heute+7

    expect(nearFuture.state).toBe('future-empty');
    expect(nearFuture.countsForAverage).toBe(false);
    expect(farFuture.state).toBe('future-empty');
    expect(farFuture.countsForAverage).toBe(false);
  });

  it('classifies a past/today day with entries as a normal bar, counted in the average', () => {
    const entries = [makeEntry({ dateKey: '2026-09-20', amountG: 200 })];
    const [bucket] = buildDayBuckets(['2026-09-20'], entries, todayKeyValue);

    expect(bucket.state).toBe('entries');
    expect(bucket.hasEntries).toBe(true);
    expect(bucket.isFuture).toBe(false);
    expect(bucket.countsForAverage).toBe(true);
    expect(bucket.kcal).toBeCloseTo(400);
  });

  it('classifies a FUTURE day WITH entries as a normal bar, but it does NOT count towards the average', () => {
    const entries = [makeEntry({ dateKey: '2026-09-22', amountG: 100 })]; // heute + 2, innerhalb des Vorwärtsfensters
    const [bucket] = buildDayBuckets(['2026-09-22'], entries, todayKeyValue);

    expect(bucket.state).toBe('entries'); // normaler Balken, keine Sonderkennzeichnung
    expect(bucket.hasEntries).toBe(true);
    expect(bucket.isFuture).toBe(true);
    expect(bucket.countsForAverage).toBe(false); // zählt NICHT in den Durchschnitt
  });
});

describe('computePeriodAverages', () => {
  const todayKeyValue = '2026-09-20';

  it('averages only over days that count, ignoring gaps and all future days', () => {
    const entries = [
      makeEntry({ dateKey: '2026-09-18', amountG: 200 }), // past, entries -> counts, 400 kcal
      makeEntry({ dateKey: '2026-09-20', amountG: 100 }), // today, entries -> counts, 200 kcal
      makeEntry({ dateKey: '2026-09-22', amountG: 500 }), // future, entries -> normal bar, does NOT count
    ];
    const dateKeys = ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-22'];
    const buckets = buildDayBuckets(dateKeys, entries, todayKeyValue);
    // 2026-09-17 (past, gap), 2026-09-19 (past, gap) -> ausgeschlossen

    const averages = computePeriodAverages(buckets);

    expect(averages.count).toBe(2);
    expect(averages.kcal).toBeCloseTo(300); // (400 + 200) / 2
  });

  it('returns zero averages without dividing by zero when no day counts', () => {
    const buckets = buildDayBuckets(['2026-09-22', '2026-09-23'], [], todayKeyValue);
    const averages = computePeriodAverages(buckets);

    expect(averages).toEqual({ count: 0, kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 });
  });
});

describe('isPeriodEmpty', () => {
  const todayKeyValue = '2026-09-20';

  it('is true when every day is a gap or a future day (with or without entries)', () => {
    const entries = [makeEntry({ dateKey: '2026-09-22', amountG: 100 })]; // future, has entries, still not counted
    const buckets = buildDayBuckets(['2026-09-18', '2026-09-19', '2026-09-22'], entries, todayKeyValue);

    expect(isPeriodEmpty(buckets)).toBe(true);
  });

  it('is false as soon as one past/today day has entries', () => {
    const entries = [makeEntry({ dateKey: '2026-09-20', amountG: 100 })];
    const buckets = buildDayBuckets(['2026-09-18', '2026-09-20'], entries, todayKeyValue);

    expect(isPeriodEmpty(buckets)).toBe(false);
  });
});

describe('computeChartScale', () => {
  const todayKeyValue = '2026-09-20';

  it('scales to 105% of the goal when the goal is higher than every bucket', () => {
    const buckets = buildDayBuckets(['2026-09-20'], [], todayKeyValue);
    expect(computeChartScale(buckets, 2000)).toBeCloseTo(2100);
  });

  it('scales to the highest bucket value when it exceeds 105% of the goal', () => {
    const entries = [makeEntry({ dateKey: '2026-09-20', amountG: 2000 })]; // 4000 kcal
    const buckets = buildDayBuckets(['2026-09-20'], entries, todayKeyValue);
    expect(computeChartScale(buckets, 2000)).toBeCloseTo(4000);
  });

  it('never returns 0 even without a goal and without any entries', () => {
    const buckets = buildDayBuckets(['2026-09-20'], [], todayKeyValue);
    expect(computeChartScale(buckets, null)).toBe(1);
  });
});

describe('computeBarFillPercents', () => {
  it('fills fully in accent, no warning segment, when at or below 105% of the goal', () => {
    expect(computeBarFillPercents(2000, 2000, 4000)).toEqual({ fillPercent: 50, warningPercent: 0 });
    expect(computeBarFillPercents(2100, 2000, 4000)).toEqual({ fillPercent: 52.5, warningPercent: 0 }); // genau 105%
  });

  it('adds a warning segment only for the part beyond 105% of the goal', () => {
    const result = computeBarFillPercents(2200, 2000, 4000); // 110%, Toleranzgrenze bei 2100
    expect(result.fillPercent).toBeCloseTo(52.5); // 2100 / 4000 * 100
    expect(result.warningPercent).toBeCloseTo(2.5); // (2200 - 2100) / 4000 * 100
  });

  it('fills with the full actual value in accent, no warning, when there is no goal', () => {
    expect(computeBarFillPercents(3000, null, 4000)).toEqual({ fillPercent: 75, warningPercent: 0 });
  });
});
