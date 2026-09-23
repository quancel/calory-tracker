import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Sync-Status-Marker (design-conventions.md „Sync-Status-Marker
 * (Offline-Puffer)", ADR-0016) — genau ein Nutzer (`diary/components/`,
 * Zwei-Nutzer-Regel für `shared/ui/` nicht erfüllt). Reine Icon-Anzeige
 * ohne eigenen Zustand, analog `shared/ui/plausibility-marker/`: die
 * Inline-Erläuterung (Text + „Erneut versuchen") rendert der Aufrufer
 * (`meal-section.component.ts`), weil sie unterhalb der ganzen Zeile sitzt,
 * nicht nur unterhalb des Markers.
 *
 * Zwei Zustände, ausschließlich `--color-text-muted` (kein Farbwechsel,
 * Unterscheidung über Icon-Form + Text) — Sync-Status ist ein transienter
 * Systemzustand, kein Bewertungssignal.
 */
export type SyncMarkerState = 'pending' | 'failed';

@Component({
  selector: 'app-sync-status-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sync-status-marker.component.html',
  styleUrl: './sync-status-marker.component.css',
})
export class SyncStatusMarkerComponent {
  readonly state = input.required<SyncMarkerState>();
  /** Wird an den `aria-label` angehängt (z. B. „ – Apfel"), gleiches Muster wie `PlausibilityMarkerComponent`. */
  readonly ariaLabelSuffix = input('');
  readonly expanded = input(false);

  readonly toggled = output<void>();

  protected statusText(): string {
    return this.state() === 'pending'
      ? 'Wartet auf Synchronisierung'
      : 'Synchronisierung fehlgeschlagen';
  }

  protected onClick(): void {
    this.toggled.emit();
  }
}
