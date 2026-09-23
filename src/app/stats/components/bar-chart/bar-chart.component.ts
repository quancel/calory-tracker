import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { formatDateLabel } from '../../../core/date.calculations';
import type { ProgressResult } from '../../../core/progress.calculations';
import type { DayBucket, PeriodKind } from '../../models/stats.model';
import { computeBarFillPercents } from '../../stats.calculations';

export interface BarChartItem {
  bucket: DayBucket;
  progress: ProgressResult;
}

const WEEKDAY_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function dayOfMonth(dateKey: string): number {
  return Number(dateKey.split('-')[2]);
}

function weekdayShort(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return WEEKDAY_SHORT_DE[new Date(year, month - 1, day).getDay()];
}

/**
 * Balken-Chart kcal pro Tag (design-conventions.md „Balken-Chart (kcal pro
 * Tag)", ADR-0014 Punkt 4): Inline-SVG/CSS, keine Chart-Bibliothek. Jeder
 * Balken ist ein fokussierbares `<button>`, kein reines `<rect>`. Zusätzlich
 * eine `sr-only`-Tabelle mit denselben Werten für lineares Durchgehen ohne
 * Diagramm-Interaktion.
 */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.css',
})
export class BarChartComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly kind = input.required<PeriodKind>();
  readonly bars = input.required<readonly BarChartItem[]>();
  readonly goalKcal = input.required<number | null>();
  readonly scale = input.required<number>();

  protected readonly openDateKey = signal<string | null>(null);

  protected readonly goalKcalRounded = computed(() => {
    const goal = this.goalKcal();
    return goal === null ? null : Math.round(goal);
  });

  /** Position der Zielinie von unten, in % der Chart-Höhe (`scale` kcal). */
  protected readonly goalLinePercent = computed(() => {
    const goal = this.goalKcal();
    if (goal === null) return 0;
    return Math.min((goal / this.scale()) * 100, 100);
  });

  protected barFill(item: BarChartItem): { fillPercent: number; warningPercent: number } {
    return computeBarFillPercents(item.bucket.kcal, this.goalKcal(), this.scale());
  }

  protected showDayLabel(index: number): boolean {
    return this.kind() === 'week' ? true : index % 5 === 0;
  }

  protected dayLabel(dateKey: string): string {
    return this.kind() === 'week' ? weekdayShort(dateKey) : `${dayOfMonth(dateKey)}`;
  }

  protected dateLabelText(dateKey: string): string {
    return formatDateLabel(dateKey).text;
  }

  protected ariaLabel(item: BarChartItem): string {
    const { bucket, progress } = item;
    const dateText = this.dateLabelText(bucket.dateKey);

    if (bucket.state === 'gap') {
      return `${dateText}, keine Einträge`;
    }
    if (bucket.state === 'future-empty') {
      return `${dateText}, noch nicht vergangen`;
    }

    const kcalRounded = Math.round(bucket.kcal);
    const macroText = `Kohlenhydrate ${Math.round(bucket.carbsG)}g, Protein ${Math.round(bucket.proteinG)}g, Fett ${Math.round(bucket.fatG)}g`;
    const kcalText = progress.hasGoal
      ? `${kcalRounded} von ${Math.round(progress.goal as number)} kcal`
      : `${kcalRounded} kcal`;

    return `${dateText}, ${kcalText}, ${macroText}`;
  }

  protected onBarClick(dateKey: string): void {
    this.openDateKey.set(this.openDateKey() === dateKey ? null : dateKey);
  }

  protected closeTooltip(): void {
    this.openDateKey.set(null);
  }

  /** Tap außerhalb des Chart-Containers schließt das offene Tooltip (design-conventions.md „Detail-Tooltip"). */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.openDateKey() === null) return;
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeTooltip();
    }
  }
}
