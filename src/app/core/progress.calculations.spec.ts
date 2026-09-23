import { computeProgress } from './progress.calculations';

describe('computeProgress — kein Ziel gesetzt', () => {
  it('treats a missing goal (null/undefined) as no goal, without invented defaults', () => {
    expect(computeProgress(1200, null)).toMatchObject({
      hasGoal: false,
      fillFraction: 0,
      isWarning: false,
    });
    expect(computeProgress(1200, undefined)).toMatchObject({ hasGoal: false, fillFraction: 0 });
  });

  it('treats a goal value <= 0 as no goal', () => {
    expect(computeProgress(1200, 0)).toMatchObject({ hasGoal: false });
    expect(computeProgress(1200, -5)).toMatchObject({ hasGoal: false });
  });
});

describe('computeProgress — 100/105/105.1 % Grenzfälle', () => {
  it('at exactly 100%: full fill, no overshoot, no warning', () => {
    const result = computeProgress(2000, 2000);
    expect(result.hasGoal).toBe(true);
    expect(result.fillFraction).toBe(1);
    expect(result.overshootFraction).toBe(0);
    expect(result.overshootAbsolute).toBe(0);
    expect(result.isWarning).toBe(false);
  });

  it('at exactly 105%: still neutral/accent, no warning (tolerance is inclusive)', () => {
    const result = computeProgress(2100, 2000);
    expect(result.fillFraction).toBe(1);
    expect(result.overshootFraction).toBeCloseTo(0.05);
    expect(result.overshootAbsolute).toBeCloseTo(100);
    expect(result.isWarning).toBe(false);
  });

  it('at 105.1%: crosses the tolerance threshold, warning becomes true', () => {
    const result = computeProgress(2102, 2000);
    expect(result.fillFraction).toBe(1);
    expect(result.overshootFraction).toBeCloseTo(0.051);
    expect(result.overshootAbsolute).toBeCloseTo(102);
    expect(result.isWarning).toBe(true);
  });

  it('caps fillFraction at 100% far beyond the goal, overshoot keeps growing', () => {
    const result = computeProgress(4000, 2000);
    expect(result.fillFraction).toBe(1);
    expect(result.overshootFraction).toBeCloseTo(1);
    expect(result.overshootAbsolute).toBeCloseTo(2000);
    expect(result.isWarning).toBe(true);
  });

  it('below the goal: partial fill, no overshoot', () => {
    const result = computeProgress(1000, 2000);
    expect(result.fillFraction).toBeCloseTo(0.5);
    expect(result.overshootFraction).toBe(0);
    expect(result.overshootAbsolute).toBe(0);
    expect(result.isWarning).toBe(false);
  });
});
