import {
  MAX_WEEKLY_LOSS_KG,
  SUGGESTION_MAX_KCAL,
  SUGGESTION_MIN_KCAL,
  buildWeightChartSegments,
  computeCalorieSuggestion,
  computeCalorieSuggestionFormula,
  computeWeightChartYDomain,
  computeWeightTrendSlope,
  filterWeightChartWindow,
  hasSufficientData,
} from './weight.calculations';
import type { WeightLogEntry } from '../core/weight-logs.service';
import type { IntakeDay } from './models/weight.model';

function log(dateKey: string, weightKg: number): WeightLogEntry {
  return { id: dateKey, dateKey, weightKg };
}

function intake(dateKey: string, kcal: number): IntakeDay {
  return { dateKey, kcal };
}

describe('computeWeightTrendSlope', () => {
  it('returns 0 for fewer than two points', () => {
    expect(computeWeightTrendSlope([])).toBe(0);
    expect(computeWeightTrendSlope([log('2026-09-01', 80)])).toBe(0);
  });

  it('returns 0 for a perfectly flat trend', () => {
    const points = [log('2026-09-01', 80), log('2026-09-08', 80), log('2026-09-15', 80)];
    expect(computeWeightTrendSlope(points)).toBeCloseTo(0, 10);
  });

  it('computes a negative slope for a steady loss (~0.5 kg/week)', () => {
    // 0,5 kg/Woche Abnahme = -0,5/7 kg/Tag.
    const points = [
      log('2026-08-25', 81.0),
      log('2026-09-01', 80.5),
      log('2026-09-08', 80.0),
      log('2026-09-15', 79.5),
      log('2026-09-22', 79.0),
    ];
    expect(computeWeightTrendSlope(points)).toBeCloseTo(-0.5 / 7, 5);
  });

  it('computes a positive slope for a steady gain', () => {
    const points = [log('2026-09-01', 79.0), log('2026-09-08', 79.5), log('2026-09-15', 80.0)];
    expect(computeWeightTrendSlope(points)).toBeCloseTo(0.5 / 7, 5);
  });
});

describe('computeCalorieSuggestionFormula (ADR-0018 Testtabelle, avgIntakeKcal = 2400)', () => {
  it('Ziel unter Ist, Gewicht stabil: Defizit, Vorschlag < Ist-Zufuhr (~1850)', () => {
    const result = computeCalorieSuggestionFormula({
      avgIntakeKcal: 2400,
      slopeKgPerDay: 0,
      currentWeightKg: 85,
      targetWeightKg: 80, // delta = -5
    });
    expect(result.maintenanceKcal).toBe(2400);
    expect(result.suggestedKcal).toBe(1850);
    expect(result.holding).toBe(false);
    expect(result.withinPlausibleRange).toBe(true);
  });

  it('Ziel über Ist, Gewicht stabil: Überschuss, Vorschlag > Ist-Zufuhr (~2680)', () => {
    const result = computeCalorieSuggestionFormula({
      avgIntakeKcal: 2400,
      slopeKgPerDay: 0,
      currentWeightKg: 75,
      targetWeightKg: 80, // delta = +5
    });
    expect(result.suggestedKcal).toBe(2680);
    expect(result.holding).toBe(false);
  });

  it('Ziel unter Ist, nimmt bereits im Zieltempo ab: „weiter so" — Vorschlag = Ist-Zufuhr (~2400)', () => {
    const result = computeCalorieSuggestionFormula({
      avgIntakeKcal: 2400,
      slopeKgPerDay: -MAX_WEEKLY_LOSS_KG / 7,
      currentWeightKg: 85,
      targetWeightKg: 80, // delta = -5
    });
    expect(result.suggestedKcal).toBe(2400);
  });

  it('Ziel unter Ist, nimmt aber zu (gegenläufiger Trend, beobachtet 0,5 kg/Woche): doppelte Korrektur, deutlich niedriger (~1300)', () => {
    // Der beobachtete Trend (0,5 kg/Woche Zunahme) ist unabhängig von den
    // Obergrenzen der Zielrate (MAX_WEEKLY_*_KG) — er ist Messdatum, keine
    // Vorgabe.
    const result = computeCalorieSuggestionFormula({
      avgIntakeKcal: 2400,
      slopeKgPerDay: 0.5 / 7,
      currentWeightKg: 85,
      targetWeightKg: 80, // delta = -5
    });
    expect(result.suggestedKcal).toBe(1300);
  });

  it('Halten-Fall (|delta| <= 0,5 kg): targetRate = 0, Vorschlag = Erhaltungsbedarf (2400)', () => {
    const result = computeCalorieSuggestionFormula({
      avgIntakeKcal: 2400,
      slopeKgPerDay: 0,
      currentWeightKg: 80.3,
      targetWeightKg: 80, // |delta| = 0.3
    });
    expect(result.suggestedKcal).toBe(2400);
    expect(result.holding).toBe(true);
  });

  it('signals implausibility below SUGGESTION_MIN_KCAL', () => {
    const result = computeCalorieSuggestionFormula({
      avgIntakeKcal: 1200,
      slopeKgPerDay: 0,
      currentWeightKg: 90,
      targetWeightKg: 60,
    });
    expect(result.suggestedKcal).toBeLessThan(SUGGESTION_MIN_KCAL);
    expect(result.withinPlausibleRange).toBe(false);
  });

  it('signals implausibility above SUGGESTION_MAX_KCAL', () => {
    const result = computeCalorieSuggestionFormula({
      avgIntakeKcal: 6100,
      slopeKgPerDay: 0,
      currentWeightKg: 60,
      targetWeightKg: 61,
    });
    expect(result.suggestedKcal).toBeGreaterThan(SUGGESTION_MAX_KCAL);
    expect(result.withinPlausibleRange).toBe(false);
  });
});

describe('hasSufficientData', () => {
  const base = {
    measurementsInWindow: [log('2026-09-01', 80), log('2026-09-08', 80), log('2026-09-15', 80)],
    latestMeasurementDateKey: '2026-09-15',
    intakeDaysInWindowCount: 14,
    referenceDateKey: '2026-09-22',
  };

  it('is true when all four conditions are met', () => {
    expect(hasSufficientData(base)).toBe(true);
  });

  it('is false with fewer than 3 measurements in the window', () => {
    expect(
      hasSufficientData({ ...base, measurementsInWindow: base.measurementsInWindow.slice(0, 2) }),
    ).toBe(false);
  });

  it('is false when the measurement span is below 14 days', () => {
    expect(
      hasSufficientData({
        ...base,
        measurementsInWindow: [log('2026-09-10', 80), log('2026-09-12', 80), log('2026-09-15', 80)],
      }),
    ).toBe(false);
  });

  it('is false when the latest measurement is older than 28 days', () => {
    expect(hasSufficientData({ ...base, latestMeasurementDateKey: '2026-08-01' })).toBe(false);
  });

  it('is false with fewer than 14 intake days in the window', () => {
    expect(hasSufficientData({ ...base, intakeDaysInWindowCount: 13 })).toBe(false);
  });
});

describe('computeCalorieSuggestion (Zustands-Priorität)', () => {
  const referenceDateKey = '2026-09-22';

  function makeSufficientMeasurements(): WeightLogEntry[] {
    // 5 Messungen über 21 Tage, jüngste heute.
    return [
      log('2026-09-01', 85),
      log('2026-09-08', 84),
      log('2026-09-15', 83),
      log('2026-09-20', 82.5),
      log('2026-09-22', 82),
    ];
  }

  function makeSufficientIntake(): IntakeDay[] {
    const days: IntakeDay[] = [];
    for (let i = 0; i < 14; i++) {
      days.push(intake(`2026-09-${String(8 + i).padStart(2, '0')}`, 2400));
    }
    return days;
  }

  it('returns "no-entries" when there are no measurements at all', () => {
    const result = computeCalorieSuggestion({
      measurements: [],
      intakeDays: [],
      targetWeightKg: 75,
      referenceDateKey,
    });
    expect(result).toBe('no-entries');
  });

  it('returns "no-target" when a target weight is not set, regardless of measurement count', () => {
    const result = computeCalorieSuggestion({
      measurements: makeSufficientMeasurements(),
      intakeDays: makeSufficientIntake(),
      targetWeightKg: null,
      referenceDateKey,
    });
    expect(result).toBe('no-target');
  });

  it('returns "insufficient" when the minimum data requirements are not met', () => {
    const result = computeCalorieSuggestion({
      measurements: [log('2026-09-22', 82)],
      intakeDays: makeSufficientIntake(),
      targetWeightKg: 75,
      referenceDateKey,
    });
    expect(result).toBe('insufficient');
  });

  it('returns a suggestion when both target weight and data are sufficient', () => {
    const result = computeCalorieSuggestion({
      measurements: makeSufficientMeasurements(),
      intakeDays: makeSufficientIntake(),
      targetWeightKg: 75,
      referenceDateKey,
    });
    expect(result).toMatchObject({ kind: 'suggestion' });
  });

  it('returns the holding state when the current weight is within 0.5 kg of the target', () => {
    const result = computeCalorieSuggestion({
      measurements: makeSufficientMeasurements(),
      intakeDays: makeSufficientIntake(),
      targetWeightKg: 82.2,
      referenceDateKey,
    });
    expect(result).toMatchObject({ kind: 'suggestion', holding: true });
  });

  it('returns "insufficient" when the implied suggestion breaches the plausibility bounds', () => {
    // Flache Messreihe (slope = 0) plus extrem niedrige Ist-Zufuhr: die
    // Formel liefert einen Vorschlag deutlich unter SUGGESTION_MIN_KCAL.
    const flatMeasurements = [
      log('2026-09-01', 82),
      log('2026-09-08', 82),
      log('2026-09-15', 82),
      log('2026-09-20', 82),
      log('2026-09-22', 82),
    ];
    const result = computeCalorieSuggestion({
      measurements: flatMeasurements,
      intakeDays: makeSufficientIntake().map((day) => ({ ...day, kcal: 100 })),
      targetWeightKg: 60,
      referenceDateKey,
    });
    expect(result).toBe('insufficient');
  });
});

describe('filterWeightChartWindow / buildWeightChartSegments', () => {
  it('keeps only points within the 90-day window, sorted ascending', () => {
    const measurements = [log('2026-09-10', 80), log('2025-01-01', 90), log('2026-09-01', 81)];
    const points = filterWeightChartWindow(measurements, '2026-09-22');
    expect(points.map((p) => p.dateKey)).toEqual(['2026-09-01', '2026-09-10']);
  });

  it('marks a segment as a gap when more than one day separates two points', () => {
    const points = [log('2026-09-01', 80), log('2026-09-03', 81), log('2026-09-04', 81.5)];
    const segments = buildWeightChartSegments(points);
    expect(segments).toEqual([
      { fromIndex: 0, toIndex: 1, hasGap: true },
      { fromIndex: 1, toIndex: 2, hasGap: false },
    ]);
  });
});

describe('computeWeightChartYDomain', () => {
  it('returns a padded range around min/max', () => {
    const domain = computeWeightChartYDomain([log('a', 80), log('b', 82)]);
    expect(domain.min).toBeLessThan(80);
    expect(domain.max).toBeGreaterThan(82);
  });

  it('returns a minimal range for a single point (avoids division by zero downstream)', () => {
    const domain = computeWeightChartYDomain([log('a', 80)]);
    expect(domain.max).toBeGreaterThan(domain.min);
  });
});
