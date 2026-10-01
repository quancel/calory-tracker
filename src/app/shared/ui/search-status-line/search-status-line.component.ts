import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SearchStatus } from '../../../core/foods.calculations';

/**
 * Geteilte Suchstatus-Zeile (ADR-0021 Punkt 13, design-conventions.md
 * „Hybrid-Suche (lokal + Server)"): zustandslose Präsentation, genutzt von
 * Step A (`food-catalog`) und M2 (`meals`). Der Status (genau EIN Zustand,
 * Priorität steht in `resolveSearchStatus()`) kommt von außen, der Baustein
 * entscheidet nichts. Das Element ist immer im DOM (`role="status"`), damit
 * Ansagen zuverlässig ankommen; `reserveSpace` hält ca. 24px Höhe frei,
 * solange die Zeile erscheinen kann.
 */
@Component({
  selector: 'app-search-status-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-status-line.component.html',
  styleUrl: './search-status-line.component.css',
})
export class SearchStatusLineComponent {
  readonly status = input<SearchStatus>({ kind: 'none' });
  /** Sr-only-Ansage nach erfolgreicher Serversuche („{n} Treffer online"). */
  readonly announcement = input<string | null>(null);
  readonly reserveSpace = input(false);

  /** „Erneut versuchen" — Lokalbestand nachladen bzw. Serversuche wiederholen (je nach Status). */
  readonly retry = output<void>();

  protected onRetry(): void {
    this.retry.emit();
  }
}
