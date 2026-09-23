import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { todayKey } from '../../../core/date.calculations';
import { StatsService } from '../../stats.service';
import { StatsShellComponent } from './stats-shell.component';

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StatsShellComponent', () => {
  let loadPeriod: ReturnType<typeof vi.fn>;
  let loadGoal: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    loadPeriod = vi.fn().mockResolvedValue({ success: true, entries: [] });
    loadGoal = vi.fn().mockResolvedValue({ success: true, goal: null });

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [StatsShellComponent],
      providers: [provideRouter([]), { provide: StatsService, useValue: { loadPeriod, loadGoal } }],
    }).compileComponents();
  });

  it('shows the skeleton while loading', () => {
    const fixture = TestBed.createComponent(StatsShellComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-loading')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-bar-chart')).toBeNull();
  });

  it('shows the empty state with a link back to the diary when the period has no entries', async () => {
    const fixture = TestBed.createComponent(StatsShellComponent);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.state-empty');
    expect(empty).not.toBeNull();
    expect(empty.querySelector('a[routerLink="/tagebuch"]').textContent).toContain('Zum Tagebuch');
    // Umschalter/Navigation bleiben bedienbar, auch im Leerzustand.
    expect(fixture.nativeElement.querySelector('app-period-switch')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-period-nav')).not.toBeNull();
  });

  it('shows an error state with retry on a failed load', async () => {
    loadPeriod.mockResolvedValueOnce({ success: false, message: 'Fehler beim Laden' });
    const fixture = TestBed.createComponent(StatsShellComponent);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-text').textContent).toContain(
      'Fehler beim Laden',
    );
  });

  it('renders the chart, macro summary and the "Ø über n Tage" hint once loaded with entries', async () => {
    loadPeriod.mockResolvedValue({
      success: true,
      entries: [
        {
          dateKey: todayKey(),
          amountG: 100,
          food: { kcal100g: 200, proteinG100g: 10, carbsG100g: 20, fatG100g: 5 },
        },
      ],
    });
    const fixture = TestBed.createComponent(StatsShellComponent);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-bar-chart')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('app-macro-bar')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.average-hint').textContent).toContain('Ø über');
  });
});
