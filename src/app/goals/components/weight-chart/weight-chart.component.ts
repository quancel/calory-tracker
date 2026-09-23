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
import { diffInDays, formatDateLabel } from '../../../core/date.calculations';
import type { WeightLogEntry } from '../../../core/weight-logs.service';
import type { WeightChartSegment, WeightChartYDomain } from '../../weight.calculations';

/** Maximale Anzahl gleichzeitig sichtbarer X-Achsen-Datumslabels — mehr würde bei bis zu 90 Punkten überlappen. */
const MAX_AXIS_LABELS = 6;

function dayOfMonth(dateKey: string): number {
  return Number(dateKey.split('-')[2]);
}

/**
 * Liniendiagramm des Gewichtsverlaufs (design-conventions.md
 * „Liniendiagramm", ADR-0017 Punkt 7): Inline-SVG/CSS, keine
 * Chart-Bibliothek. Bewusste Abweichung vom Balken-Pattern des Verlaufs —
 * Gewicht ist ein kontinuierlicher Trend, kein Tages-Diskretwert.
 *
 * Jeder Messpunkt ist ein fokussierbares `<button>` (Tap öffnet ein
 * Tooltip, gleiche Mechanik wie `stats/components/bar-chart`), Lücken
 * werden **nicht interpoliert** — die Verbindungslinie zwischen zwei durch
 * mindestens einen Tag getrennten Punkten wird gestrichelt dargestellt.
 * Zusätzlich eine `sr-only`-Tabelle mit denselben Werten.
 *
 * Positionierung ist rein präsentational (wie `fillPercent` in
 * `bar-chart.component.ts`): x-Achse linear nach Tagesabstand zwischen
 * erstem und letztem sichtbaren Punkt, y-Achse linear über
 * `yDomain()` — keine Fachlogik, nur Layout.
 */
@Component({
  selector: 'app-weight-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './weight-chart.component.html',
  styleUrl: './weight-chart.component.css',
})
export class WeightChartComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly points = input.required<readonly WeightLogEntry[]>();
  readonly segments = input.required<readonly WeightChartSegment[]>();
  readonly yDomain = input.required<WeightChartYDomain>();

  protected readonly openIndex = signal<number | null>(null);

  protected xPercent(index: number): number {
    const points = this.points();
    if (points.length <= 1) return 50;
    const span = diffInDays(points[0].dateKey, points[points.length - 1].dateKey);
    if (span === 0) return 50;
    return (diffInDays(points[0].dateKey, points[index].dateKey) / span) * 100;
  }

  protected yPercent(weightKg: number): number {
    const domain = this.yDomain();
    const range = domain.max - domain.min;
    if (range === 0) return 50;
    return 100 - ((weightKg - domain.min) / range) * 100;
  }

  protected dateLabelText(dateKey: string): string {
    return formatDateLabel(dateKey).text;
  }

  /**
   * X-Achsen-Datumslabel (design-conventions.md „Liniendiagramm": „X-Achse
   * mit Datumslabels analog „Datumsnavigation"-Formatierung"). Bei bis zu
   * `WEIGHT_CHART_WINDOW_DAYS` (90) Messpunkten würde ein Label je Punkt
   * überlappen — analog zum kompakten Tageslabel des Balken-Charts
   * (`bar-chart.component.ts`, Monatsansicht) zeigt die Achse deshalb nur
   * eine gleichmäßig über die Punktfolge verteilte Auswahl von höchstens
   * `MAX_AXIS_LABELS` Indizes, immer einschließlich des ersten und letzten
   * Punkts.
   */
  private readonly axisLabelIndices = computed(() => {
    const count = this.points().length;
    const labelCount = Math.min(count, MAX_AXIS_LABELS);
    const indices = new Set<number>();
    if (labelCount <= 1) {
      if (count > 0) indices.add(0);
      return indices;
    }
    for (let i = 0; i < labelCount; i++) {
      indices.add(Math.round((i * (count - 1)) / (labelCount - 1)));
    }
    return indices;
  });

  protected showAxisLabel(index: number): boolean {
    return this.axisLabelIndices().has(index);
  }

  /** Kompaktes Tagesdatum (Tag des Monats) für das X-Achsen-Label — die Tooltip zeigt daneben das volle Datum. */
  protected axisLabelText(dateKey: string): string {
    return `${dayOfMonth(dateKey)}.`;
  }

  protected pointAriaLabel(point: WeightLogEntry): string {
    return `${this.dateLabelText(point.dateKey)}, ${point.weightKg} kg`;
  }

  protected segmentLine(segment: WeightChartSegment): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } {
    const points = this.points();
    return {
      x1: this.xPercent(segment.fromIndex),
      y1: this.yPercent(points[segment.fromIndex].weightKg),
      x2: this.xPercent(segment.toIndex),
      y2: this.yPercent(points[segment.toIndex].weightKg),
    };
  }

  protected onPointClick(index: number): void {
    this.openIndex.set(this.openIndex() === index ? null : index);
  }

  protected closeTooltip(): void {
    this.openIndex.set(null);
  }

  /** Tap außerhalb des Diagramms schließt das offene Tooltip (design-conventions.md „Detail-Tooltip"). */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.openIndex() === null) return;
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeTooltip();
    }
  }
}
