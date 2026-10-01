import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { SearchStatus } from '../../../core/foods.calculations';

/** Verzögerung, nach der „Suche online …" erst in die Live-Region gesetzt wird (design-conventions.md, Zustand 4). */
export const SEARCHING_TEXT_DELAY_MS = 300;

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

  /** `true` erst, wenn „Suche läuft" 300 ms angedauert hat — vorher steht kein Text in der Live-Region. */
  protected readonly searchingTextShown = signal(false);
  private searchingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const searching = this.status().kind === 'searching';
      untracked(() => {
        this.clearSearchingTimer();
        if (!searching) {
          this.searchingTextShown.set(false);
          return;
        }
        this.searchingTimer = setTimeout(() => {
          this.searchingTimer = null;
          this.searchingTextShown.set(true);
        }, SEARCHING_TEXT_DELAY_MS);
      });
    });
    inject(DestroyRef).onDestroy(() => this.clearSearchingTimer());
  }

  private clearSearchingTimer(): void {
    if (this.searchingTimer !== null) {
      clearTimeout(this.searchingTimer);
      this.searchingTimer = null;
    }
  }

  protected onRetry(): void {
    this.retry.emit();
  }
}
