import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDateLabel } from '../../../core/date.calculations';
import { formatWeightKg } from '../../../core/weight.calculations';
import { DiaryStore } from '../../diary.store';

/** Maße der Sparkline in px (feste Größe, keine Verzerrung des Endpunkts). */
const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 32;
const SPARKLINE_PADDING = 3;

/**
 * Gewichtskarte der Tagesansicht (ADR-0019): Schnelleingabe des Gewichts
 * für den angezeigten Tag plus Mini-Verlauf der letzten 30 Tage
 * (jüngster Wert, Veränderung, Sparkline). Das große Diagramm, Zielgewicht
 * und Vorschlag liegen in der Gewicht-Ansicht (`/gewicht`), erreichbar über
 * den Link in der Kartenkopfzeile.
 *
 * Die Sparkline ist eine reine Trend-Andeutung und `aria-hidden` — ihre
 * Aussage steht als Text daneben, die Einzelwerte als `sr-only`-Liste
 * (bewusst ohne fokussierbare Einzelpunkte, siehe ADR-0019).
 */
@Component({
  selector: 'app-weight-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './weight-card.component.html',
  styleUrl: './weight-card.component.css',
})
export class WeightCardComponent {
  protected readonly store = inject(DiaryStore);

  protected readonly sparklineWidth = SPARKLINE_WIDTH;
  protected readonly sparklineHeight = SPARKLINE_HEIGHT;

  private readonly touched = signal(false);

  /** Validierung erst nach dem ersten Blur/Submit, danach live (design-conventions.md „Formulare"). */
  protected readonly displayedError = computed(() => {
    const submitError = this.store.weightSubmitError();
    if (submitError) return submitError;
    if (!this.touched()) return null;
    const validation = this.store.weightValidation();
    return validation.valid ? null : validation.error;
  });

  protected readonly showForm = computed(
    () => this.store.dayWeight() === null || this.store.weightEditing(),
  );

  protected readonly latestText = computed(() => {
    const latest = this.store.weightTrend().latest;
    return latest ? `${formatWeightKg(latest.weightKg)} kg` : null;
  });

  protected readonly dayWeightText = computed(() => {
    const day = this.store.dayWeight();
    return day ? `${formatWeightKg(day.weightKg)} kg` : null;
  });

  private readonly sparklineCoords = computed(() => {
    const innerW = SPARKLINE_WIDTH - SPARKLINE_PADDING * 2;
    const innerH = SPARKLINE_HEIGHT - SPARKLINE_PADDING * 2;
    return this.store.weightTrend().sparkline.map((p) => ({
      x: SPARKLINE_PADDING + p.x * innerW,
      y: SPARKLINE_PADDING + (1 - p.y) * innerH,
    }));
  });

  protected readonly sparklinePath = computed(() =>
    this.sparklineCoords()
      .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly sparklineEnd = computed(() => {
    const coords = this.sparklineCoords();
    return coords.length > 0 ? coords[coords.length - 1] : null;
  });

  protected readonly srValues = computed(() =>
    this.store.weightTrend().values.map((v) => ({
      id: v.id,
      text: `${formatDateLabel(v.dateKey).text}: ${formatWeightKg(v.weightKg)} kg`,
    })),
  );

  protected onInput(event: Event): void {
    this.store.setWeightInput((event.target as HTMLInputElement).value);
  }

  protected onBlur(): void {
    this.touched.set(true);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.touched.set(true);
    void this.store.saveWeight().then(() => {
      if (!this.store.weightSubmitError()) this.touched.set(false);
    });
  }

  protected onEdit(): void {
    this.touched.set(false);
    this.store.startWeightEdit();
  }

  protected onCancelEdit(): void {
    this.touched.set(false);
    this.store.cancelWeightEdit();
  }
}
