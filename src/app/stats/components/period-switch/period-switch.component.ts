import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PeriodKind } from '../../models/stats.model';

/**
 * Zeitraum-Umschalter Woche/Monat (design-conventions.md „Zeitraum-
 * Umschalter"): zwei Segment-Tabs, Pill-Form — gleiches Grundmuster wie
 * die Segment-Tabs im Eintrags-Sheet (`food-entry-sheet.component.css`
 * `.segment-tab`/`.segment-tab-active`).
 */
@Component({
  selector: 'app-period-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './period-switch.component.html',
  styleUrl: './period-switch.component.css',
})
export class PeriodSwitchComponent {
  readonly kind = input.required<PeriodKind>();
  readonly kindChange = output<PeriodKind>();

  protected onSelect(kind: PeriodKind): void {
    if (kind === this.kind()) return;
    this.kindChange.emit(kind);
  }
}
