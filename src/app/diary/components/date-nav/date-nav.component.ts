import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Datumsnavigation (design-conventions.md „Datumsnavigation"): „‹" —
 * Label — „›", Touch-Ziele je ≥48×48px. Zurück ist unbegrenzt bedienbar,
 * daher kein `canGoBack`-Input. Der Vorwärts-Chevron wird deaktiviert
 * dargestellt (nicht entfernt), sobald `canGoForward` `false` ist.
 *
 * Das Datumslabel öffnet in diesem Paket bewusst **keinen** Datepicker —
 * dieses Sheet existiert noch nicht und ist nicht Teil von
 * PO-2026-09-20-004 (siehe Handoff-Bericht).
 */
@Component({
  selector: 'app-date-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './date-nav.component.html',
  styleUrl: './date-nav.component.css',
})
export class DateNavComponent {
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
