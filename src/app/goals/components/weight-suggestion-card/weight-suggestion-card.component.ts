import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CalorieSuggestionResult } from '../../models/weight.model';

/** design-conventions.md „Kein Übernahme-Verlauf …": „Verwerfen" blendet die Karte per `--duration-base`/`--ease-out`-Fade aus, bevor sie entfernt wird. */
const DISMISS_FADE_MS = 180;

/**
 * Vorschlagskarte des Kalorienziel-Vorschlags (design-conventions.md
 * „Vorschlagskarte (neutrales-Angebot-Pattern)", „Zustands-Priorität der
 * Vorschlagskarte", „Kein Zielgewicht gesetzt"-Zustand,
 * „Zu wenig Messpunkte"-Zustand, „Halten"-Zustand). Rein präsentational:
 * `result()` kommt fertig aus `WeightStore.visibleSuggestion()`.
 * `'no-entries'` wird defensiv als „nichts rendern" behandelt, tritt aber
 * praktisch nie auf: der Aufrufer `weight-log-section` zeigt die Karte nur,
 * wenn `hasEntries()` bereits wahr ist (ersetzt sonst Diagramm **und**
 * Karte durch den Leerzustand).
 */
@Component({
  selector: 'app-weight-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weight-suggestion-card.component.html',
  styleUrl: './weight-suggestion-card.component.css',
})
export class WeightSuggestionCardComponent {
  readonly result = input.required<CalorieSuggestionResult>();

  readonly adopt = output<void>();
  readonly dismiss = output<void>();

  protected readonly suggestion = computed(() => {
    const value = this.result();
    return typeof value === 'object' && value.kind === 'suggestion' ? value : null;
  });

  protected readonly isNoTarget = computed(() => this.result() === 'no-target');
  protected readonly isInsufficient = computed(() => this.result() === 'insufficient');

  /** `true` während des Ausblendens (design-conventions.md „Verwerfen"-Fade) — verzögert nur die Optik, `dismiss` feuert erst danach. */
  protected readonly closing = signal(false);

  protected readonly cardText = computed(() => {
    const suggestion = this.suggestion();
    if (!suggestion) return '';
    return suggestion.holding
      ? `Dein Gewicht ist stabil. So bleibt es: ${suggestion.kcal} kcal.`
      : `Basierend auf deinem Gewichtsverlauf: ${suggestion.kcal} kcal.`;
  });

  protected onAdopt(): void {
    this.adopt.emit();
  }

  protected onDismiss(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.dismiss.emit(), DISMISS_FADE_MS);
  }
}
