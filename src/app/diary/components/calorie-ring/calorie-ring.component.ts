import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ProgressResult } from '../../../core/progress.calculations';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Kalorienring (design-conventions.md „Kalorienring"): SVG-Ring,
 * Strichstärke `--space-2` (8px), Restfläche `--color-border`. Füllteil bis
 * 100 % des Ziels in `--color-accent`; darüber (nur bei `isWarning`, also
 * > 105 % Toleranz) ein zusätzliches Segment ab dem Ringanfang in
 * `--color-warning` — zwischen 100 % und einschließlich 105 % bleibt dieses
 * Segment ebenfalls `--color-accent` (bewusste Toleranzzone, kein
 * Warnsignal). Ohne Ziel (`hasGoal: false`) bleibt der Ring ungefüllt.
 *
 * Das Überschuss-Segment wird visuell auf eine zusätzliche volle Umdrehung
 * gekappt (`min(overshootFraction, 1)`) — reine Rendering-Entscheidung
 * gegen eine unbegrenzt oft umlaufende Linie bei sehr großen
 * Überschreitungen; der exakte Überschuss steht davon unabhängig immer als
 * Text daneben (`overshootAbsolute`, ungekappt).
 */
@Component({
  selector: 'app-calorie-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calorie-ring.component.html',
  styleUrl: './calorie-ring.component.css',
})
export class CalorieRingComponent {
  readonly progress = input.required<ProgressResult>();

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;

  protected readonly actualRounded = computed(() => Math.round(this.progress().actual));
  protected readonly overshootRounded = computed(() =>
    Math.round(this.progress().overshootAbsolute),
  );

  protected readonly fillDasharray = computed(() => {
    const length = this.progress().fillFraction * CIRCUMFERENCE;
    return `${length} ${CIRCUMFERENCE - length}`;
  });

  protected readonly overshootDasharray = computed(() => {
    const fraction = Math.min(this.progress().overshootFraction, 1);
    const length = fraction * CIRCUMFERENCE;
    return `${length} ${CIRCUMFERENCE - length}`;
  });

  protected readonly hasOvershoot = computed(() => this.progress().overshootFraction > 0);
}
