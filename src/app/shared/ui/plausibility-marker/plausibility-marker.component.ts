import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  type PlausibilityMarker,
  plausibilityMarkerStatusText,
} from '../../../core/foods.calculations';

/**
 * Geteilter Plausibilitäts-/Vollständigkeits-Marker (ADR-0012 Punkt 5,
 * design-conventions.md „Plausibilitäts-/Vollständigkeits-Marker"). Genutzt
 * von der Suchtrefferliste/Step B des Eintrags-Sheets (`food-catalog`) und
 * von M2/M3 des Mahlzeit-Sheets (`meals`).
 *
 * **Von sich aus nicht interaktiv**: ohne `interactive` rendert der
 * Baustein einen reinen, nicht fokussierbaren Status-Hinweis (Step B,
 * M2/M3 — dort ist der Marker reine Anzeige, Nutzerentscheidung
 * 2026-09-21 für das Mahlzeit-Sheet). Erst `interactive = true` macht ihn
 * zum Tap-Ziel und aktiviert den Output `correct` — bislang nur die
 * Suchtrefferliste (Step A, Korrektur-Einstieg Step C).
 */
@Component({
  selector: 'app-plausibility-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plausibility-marker.component.html',
  styleUrl: './plausibility-marker.component.css',
})
export class PlausibilityMarkerComponent {
  readonly marker = input<PlausibilityMarker>(null);
  readonly interactive = input(false);
  /** Wird an den `aria-label` des interaktiven Buttons angehängt (z. B. „ – Apfel bearbeiten"). */
  readonly ariaLabelSuffix = input('');

  readonly correct = output<void>();

  protected statusText(marker: NonNullable<PlausibilityMarker>): string {
    return plausibilityMarkerStatusText(marker);
  }

  protected onClick(): void {
    this.correct.emit();
  }
}
