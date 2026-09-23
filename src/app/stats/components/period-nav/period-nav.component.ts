import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Perioden-Navigation (design-conventions.md „Zeitraum-Umschalter"):
 * „‹" — Periodenlabel (rein informativ, kein Sheet) — „›", Touch-Ziele
 * ≥48×48px. Zurück ist unbegrenzt bedienbar (kein `canGoBack`-Input,
 * gleiches Muster wie `date-nav.component.ts`). Der Vorwärts-Chevron wird
 * deaktiviert dargestellt (nicht entfernt), sobald `canGoForward` `false`
 * ist — Position bleibt stabil.
 */
@Component({
  selector: 'app-period-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './period-nav.component.html',
  styleUrl: './period-nav.component.css',
})
export class PeriodNavComponent {
  readonly label = input.required<string>();
  readonly canGoForward = input.required<boolean>();

  readonly previous = output<void>();
  readonly next = output<void>();

  protected onPrevious(): void {
    this.previous.emit();
  }

  protected onNext(): void {
    if (!this.canGoForward()) return;
    this.next.emit();
  }
}
