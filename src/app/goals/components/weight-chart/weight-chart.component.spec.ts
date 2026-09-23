import { TestBed } from '@angular/core/testing';
import type { WeightLogEntry } from '../../models/weight.model';
import { buildWeightChartSegments, computeWeightChartYDomain } from '../../weight.calculations';
import { WeightChartComponent } from './weight-chart.component';

function log(dateKey: string, weightKg: number): WeightLogEntry {
  return { id: dateKey, dateKey, weightKg };
}

describe('WeightChartComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WeightChartComponent] }).compileComponents();
  });

  function setup(points: readonly WeightLogEntry[]) {
    const fixture = TestBed.createComponent(WeightChartComponent);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('segments', buildWeightChartSegments(points));
    fixture.componentRef.setInput('yDomain', computeWeightChartYDomain(points));
    fixture.detectChanges();
    return fixture;
  }

  it('renders one focusable point per measurement with a full date + weight aria-label', () => {
    const fixture = setup([log('2026-09-01', 80), log('2026-09-08', 79.5)]);
    const points = fixture.nativeElement.querySelectorAll('.chart-point');
    expect(points.length).toBe(2);
    expect(points[1].getAttribute('aria-label')).toContain('79.5 kg');
  });

  it('marks the connecting line as a gap segment when more than a day separates two points (no interpolation)', () => {
    const fixture = setup([log('2026-09-01', 80), log('2026-09-05', 79)]);
    expect(fixture.nativeElement.querySelector('.segment-line.segment-gap')).toBeTruthy();
  });

  it('does not mark the segment as a gap for consecutive days', () => {
    const fixture = setup([log('2026-09-01', 80), log('2026-09-02', 79.9)]);
    const line = fixture.nativeElement.querySelector('.segment-line');
    expect(line.classList.contains('segment-gap')).toBe(false);
  });

  it('opens a tooltip with date and weight on point click and toggles it closed on a second click', () => {
    const fixture = setup([log('2026-09-01', 80)]);
    const point = fixture.nativeElement.querySelector('.chart-point');

    point.click();
    fixture.detectChanges();
    const tooltipText = fixture.nativeElement.querySelector('.tooltip-weight').textContent;
    expect(tooltipText).toContain('80');
    expect(tooltipText).toContain('kg');

    point.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tooltip')).toBeNull();
  });

  it('renders an sr-only table with all measurements as an accessible alternative', () => {
    const fixture = setup([log('2026-09-01', 80), log('2026-09-08', 79.5)]);
    const rows = fixture.nativeElement.querySelectorAll('.sr-only tbody tr');
    expect(rows.length).toBe(2);
  });

  it('shows an x-axis date label for every point when few points exist', () => {
    const fixture = setup([log('2026-09-01', 80), log('2026-09-08', 79.5), log('2026-09-15', 79)]);
    expect(fixture.nativeElement.querySelectorAll('.axis-label').length).toBe(3);
  });

  it('thins out x-axis labels to a bounded count when many points exist (no overlap)', () => {
    const points = Array.from({ length: 90 }, (_, i) =>
      log(
        `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        80,
      ),
    );
    const fixture = setup(points);
    const labelCount = fixture.nativeElement.querySelectorAll('.axis-label').length;
    expect(labelCount).toBeGreaterThan(0);
    expect(labelCount).toBeLessThanOrEqual(6);
  });
});
