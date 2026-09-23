import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Bottom-Navigation (design-conventions.md „Bottom-Navigation (final,
 * Paket 012)"): projektweit gültig für alle Ansichten hinter dem Login.
 * Drei Tabs, `/tagebuch`, `/gewicht` (ADR-0019) und `/verlauf` — `/ziele`
 * und `/mahlzeiten` sind
 * tab-lose Kinder derselben Layout-Route (ADR-0014 Punkt 1/3) und zeigen
 * diese Navigation ebenfalls, markieren dabei aber keinen Tab aktiv:
 * `routerLinkActive` mit `exact: true` vergleicht nur gegen die eigene
 * Tab-URL, kein URL-Vergleich/`showNav`-Signal in der Komponente.
 */
@Component({
  selector: 'app-bottom-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.css',
})
export class BottomNavComponent {}
