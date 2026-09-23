import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ProgressResult } from '../../../core/progress.calculations';

export type MacroKind = 'carbs' | 'protein' | 'fat';

/**
 * Makro-Balken (design-conventions.md „Makro-Balken"): horizontaler Balken,
 * Höhe `--space-2`, Radius `--radius-full`. Grundfüllung in der jeweiligen
 * Makrofarbe bis 100 % des Ziels; darüber (nur bei `isWarning`, > 105 %
 * Toleranz) ein zusätzliches Segment jenseits des Ziels in
 * `--color-warning` — zwischen 100 % und einschließlich 105 % bleibt dieses
 * Segment in der Makrofarbe (gleiche 105-%-Schwelle wie beim Kalorienring).
 * Ohne Ziel (`hasGoal: false`) bleibt der Track ungefüllt.
 *
 * Geteilter Baustein seit Paket PO-2026-09-20-012 (ADR-0014 Punkt 7,
 * zweiter Nutzer `stats` — Verlauf nutzt sie mit gemitteltem Ist-Wert,
 * ohne die Komponente zu erweitern). API (`label`/`macro`/`progress`)
 * bleibt gegenüber `diary` unverändert.
 */
@Component({
  selector: 'app-macro-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './macro-bar.component.html',
  styleUrl: './macro-bar.component.css',
})
export class MacroBarComponent {
  readonly label = input.required<string>();
  readonly macro = input.required<MacroKind>();
  readonly progress = input.required<ProgressResult>();

  protected readonly actualRounded = computed(() => Math.round(this.progress().actual));
  protected readonly goalRounded = computed(() => {
    const goal = this.progress().goal;
    return goal === null ? null : Math.round(goal);
  });
  protected readonly overshootRounded = computed(() =>
    Math.round(this.progress().overshootAbsolute),
  );

  // Overschuss-Anteil wird visuell auf 100% zusätzliche Balkenlänge gekappt
  // (analog zum Kalorienring) — der exakte Wert bleibt als Text ungekappt.
  protected readonly fillPercent = computed(() => this.progress().fillFraction * 100);
  protected readonly overshootPercent = computed(
    () => Math.min(this.progress().overshootFraction, 1) * 100,
  );
  protected readonly hasOvershoot = computed(() => this.progress().overshootFraction > 0);
}
