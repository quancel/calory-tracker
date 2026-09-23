import { TestBed } from '@angular/core/testing';
import type { ProgressResult } from '../../../core/progress.calculations';
import type { DayBucket } from '../../models/stats.model';
import { BarChartComponent, type BarChartItem } from './bar-chart.component';

function bucket(overrides: Partial<DayBucket> = {}): DayBucket {
  return {
    dateKey: overrides.dateKey ?? '2026-09-14',
    kcal: overrides.kcal ?? 0,
    carbsG: overrides.carbsG ?? 0,
    proteinG: overrides.proteinG ?? 0,
    fatG: overrides.fatG ?? 0,
    hasEntries: overrides.hasEntries ?? false,
    isFuture: overrides.isFuture ?? false,
    state: overrides.state ?? 'gap',
    countsForAverage: overrides.countsForAverage ?? false,
  };
}

function progress(overrides: Partial<ProgressResult> = {}): ProgressResult {
  return {
    hasGoal: false,
    actual: 0,
    goal: null,
    fillFraction: 0,
    overshootFraction: 0,
    overshootAbsolute: 0,
    isWarning: false,
    ...overrides,
  };
}

describe('BarChartComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BarChartComponent] }).compileComponents();
  });

  function setup(kind: 'week' | 'month', bars: readonly BarChartItem[], goalKcal: number | null) {
    const fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('bars', bars);
    fixture.componentRef.setInput('goalKcal', goalKcal);
    fixture.componentRef.setInput('scale', 2500);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the "Kein Ziel gesetzt" text instead of a goal line when there is no goal', () => {
    const fixture = setup('week', [], null);
    expect(fixture.nativeElement.querySelector('.goal-line-none .goal-label').textContent).toContain(
      'Kein Ziel gesetzt',
    );
  });

  it('renders the goal label with the rounded kcal value when a goal exists', () => {
    const fixture = setup('week', [], 2000);
    const label = fixture.nativeElement.querySelector('.goal-line:not(.goal-line-none) .goal-label');
    expect(label.textContent).toContain('Ziel: 2000 kcal');
  });

  it('builds the aria-label with kcal-vs-goal and macros for a normal day', () => {
    const item: BarChartItem = {
      bucket: bucket({
        dateKey: '2026-09-14',
        kcal: 1850,
        carbsG: 180,
        proteinG: 90,
        fatG: 60,
        hasEntries: true,
        state: 'entries',
        countsForAverage: true,
      }),
      progress: progress({ hasGoal: true, actual: 1850, goal: 2200 }),
    };
    const fixture = setup('week', [item], 2200);

    const bar = fixture.nativeElement.querySelector('.bar-entries');
    expect(bar.getAttribute('aria-label')).toBe(
      'Mo, 14. Sep., 1850 von 2200 kcal, Kohlenhydrate 180g, Protein 90g, Fett 60g',
    );
  });

  it('builds the aria-label "keine Einträge" for a gap day', () => {
    const item: BarChartItem = {
      bucket: bucket({ dateKey: '2026-09-14', state: 'gap' }),
      progress: progress(),
    };
    const fixture = setup('week', [item], null);

    expect(fixture.nativeElement.querySelector('.bar-gap').getAttribute('aria-label')).toBe(
      'Mo, 14. Sep., keine Einträge',
    );
  });

  it('builds the aria-label "noch nicht vergangen" for a future-empty day, even far beyond heute+7', () => {
    const item: BarChartItem = {
      bucket: bucket({ dateKey: '2027-01-01', state: 'future-empty', isFuture: true }),
      progress: progress(),
    };
    const fixture = setup('month', [item], null);

    expect(fixture.nativeElement.querySelector('.bar-future').getAttribute('aria-label')).toContain(
      'noch nicht vergangen',
    );
  });

  it('opens a tooltip on tap, toggles it closed on a second tap of the same bar', () => {
    const item: BarChartItem = {
      bucket: bucket({ dateKey: '2026-09-14', state: 'gap' }),
      progress: progress(),
    };
    const fixture = setup('week', [item], null);
    const bar = fixture.nativeElement.querySelector('.bar-gap') as HTMLButtonElement;

    bar.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tooltip')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.tooltip-muted').textContent).toContain(
      'Keine Einträge',
    );

    bar.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tooltip')).toBeNull();
  });

  it('switches the open tooltip to a newly tapped bar without requiring a second tap', () => {
    const items: BarChartItem[] = [
      { bucket: bucket({ dateKey: '2026-09-14', state: 'gap' }), progress: progress() },
      { bucket: bucket({ dateKey: '2026-09-15', state: 'gap' }), progress: progress() },
    ];
    const fixture = setup('week', items, null);
    const bars = fixture.nativeElement.querySelectorAll('.bar-gap');

    bars[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.tooltip')).toHaveLength(1);

    bars[1].click();
    fixture.detectChanges();
    const openColumns = fixture.nativeElement.querySelectorAll('.tooltip');
    expect(openColumns).toHaveLength(1);
  });

  it('shows a day label under every bar in the week view', () => {
    const items: BarChartItem[] = Array.from({ length: 7 }, (_, i) => ({
      bucket: bucket({ dateKey: `2026-09-${14 + i}`, state: 'gap' }),
      progress: progress(),
    }));
    const fixture = setup('week', items, null);
    expect(fixture.nativeElement.querySelectorAll('.bar-day-label')).toHaveLength(7);
  });

  it('shows a day label only every 5th day in the month view', () => {
    const items: BarChartItem[] = Array.from({ length: 30 }, (_, i) => ({
      bucket: bucket({ dateKey: `2026-09-${String(i + 1).padStart(2, '0')}`, state: 'gap' }),
      progress: progress(),
    }));
    const fixture = setup('month', items, null);
    // Index 0,5,10,15,20,25 -> 6 Labels bei 30 Tagen
    expect(fixture.nativeElement.querySelectorAll('.bar-day-label')).toHaveLength(6);
  });
});
