import { TestBed } from '@angular/core/testing';
import type { ProgressResult } from '../../../core/progress.calculations';
import { MacroBarComponent } from './macro-bar.component';

function progress(overrides: Partial<ProgressResult> = {}): ProgressResult {
  return {
    hasGoal: true,
    actual: 45,
    goal: 60,
    fillFraction: 0.75,
    overshootFraction: 0,
    overshootAbsolute: 0,
    isWarning: false,
    ...overrides,
  };
}

describe('MacroBarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MacroBarComponent] }).compileComponents();
  });

  function setup(label: string, macro: 'carbs' | 'protein' | 'fat', value: ProgressResult) {
    const fixture = TestBed.createComponent(MacroBarComponent);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('macro', macro);
    fixture.componentRef.setInput('progress', value);
    fixture.detectChanges();
    return fixture;
  }

  it('shows only the ist-value and a "kein Ziel" hint when no goal is set per macro', () => {
    const fixture = setup(
      'Fett',
      'fat',
      progress({ hasGoal: false, actual: 18, goal: null, fillFraction: 0 }),
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.value')?.textContent?.trim()).toBe('18g');
    expect(el.querySelector('.no-goal-hint')?.textContent).toContain('kein Ziel');
    expect(el.querySelector('.bar-fill')).toBeNull();
  });

  it('applies the macro-specific color class', () => {
    const fixture = setup('Kohlenhydrate', 'carbs', progress());
    expect(
      fixture.nativeElement.querySelector('.macro-bar')?.classList.contains('macro-carbs'),
    ).toBe(true);
  });

  it('shows the warning color and overshoot text only above 105%, not at exactly 105%', () => {
    const at105 = setup(
      'Protein',
      'protein',
      progress({
        actual: 105,
        goal: 100,
        fillFraction: 1,
        overshootFraction: 0.05,
        isWarning: false,
      }),
    );
    expect(at105.nativeElement.querySelector('.value')?.classList.contains('warning')).toBe(false);
    expect(at105.nativeElement.querySelector('.overshoot-text')).toBeNull();

    const above105 = setup(
      'Protein',
      'protein',
      progress({
        actual: 106,
        goal: 100,
        fillFraction: 1,
        overshootFraction: 0.06,
        overshootAbsolute: 6,
        isWarning: true,
      }),
    );
    expect(above105.nativeElement.querySelector('.value')?.classList.contains('warning')).toBe(
      true,
    );
    expect(above105.nativeElement.querySelector('.overshoot-text')?.textContent).toContain(
      '+6 g über Ziel',
    );
  });
});
