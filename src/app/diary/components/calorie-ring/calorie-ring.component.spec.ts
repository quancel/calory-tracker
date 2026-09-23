import { TestBed } from '@angular/core/testing';
import type { ProgressResult } from '../../../core/progress.calculations';
import { CalorieRingComponent } from './calorie-ring.component';

function progress(overrides: Partial<ProgressResult> = {}): ProgressResult {
  return {
    hasGoal: true,
    actual: 1500,
    goal: 2000,
    fillFraction: 0.75,
    overshootFraction: 0,
    overshootAbsolute: 0,
    isWarning: false,
    ...overrides,
  };
}

describe('CalorieRingComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CalorieRingComponent] }).compileComponents();
  });

  function setup(value: ProgressResult) {
    const fixture = TestBed.createComponent(CalorieRingComponent);
    fixture.componentRef.setInput('progress', value);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the neutral value without goal-related text when no goal is set', () => {
    const fixture = setup(progress({ hasGoal: false, actual: 1200, goal: null }));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.kcal-value')?.textContent?.trim()).toBe('1200');
    expect(el.querySelector('.kcal-value')?.classList.contains('warning')).toBe(false);
    expect(el.querySelector('.kcal-unit')?.textContent).toContain('Kein Ziel gesetzt');
    expect(el.querySelector('.overshoot-arc')).toBeNull();
  });

  it('does not show a warning color at exactly 105% (still within tolerance)', () => {
    const fixture = setup(
      progress({
        actual: 2100,
        goal: 2000,
        fillFraction: 1,
        overshootFraction: 0.05,
        isWarning: false,
      }),
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.kcal-value')?.classList.contains('warning')).toBe(false);
    expect(el.querySelector('.overshoot-text')).toBeNull();
    const overshootArc = el.querySelector('.overshoot-arc');
    expect(overshootArc?.getAttribute('stroke')).toBe('var(--color-accent)');
  });

  it('shows the warning color and overshoot text above 105%', () => {
    const fixture = setup(
      progress({
        actual: 2102,
        goal: 2000,
        fillFraction: 1,
        overshootFraction: 0.051,
        overshootAbsolute: 102,
        isWarning: true,
      }),
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.kcal-value')?.classList.contains('warning')).toBe(true);
    expect(el.querySelector('.overshoot-text')?.textContent).toContain('+102 kcal über Ziel');
    const overshootArc = el.querySelector('.overshoot-arc');
    expect(overshootArc?.getAttribute('stroke')).toBe('var(--color-warning)');
  });
});
