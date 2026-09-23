import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { UpdateBannerComponent } from '../update-banner/update-banner.component';

/**
 * Pfadlose Layout-Route hinter dem Login (ADR-0014 Punkt 1): primärer
 * `<router-outlet/>` für die vier geschützten Top-Level-Routen
 * (`tagebuch`, `verlauf`, `ziele`, `mahlzeiten`), darunter
 * `<app-bottom-nav/>`. Die Sichtbarkeit der Navigation ergibt sich allein
 * aus der Routenzugehörigkeit — kein `showNav`-Signal, kein URL-Vergleich
 * hier oder in `app.ts`. Das benannte Outlet `sheet` bleibt bewusst
 * außerhalb dieser Komponente (top-level in `app.html`, ADR-0014 Punkt 2)
 * und liegt damit über der Bottom-Navigation.
 *
 * `<app-update-banner/>` hängt ebenfalls hier (ADR-0015 Punkt 2): sie
 * erscheint damit auf allen vier Ansichten hinter dem Login, bewusst nicht
 * auf `/login` — dort gibt es weder Navigation noch laufende Eingabe, die
 * ein Reload gefährden könnte.
 */
@Component({
  selector: 'app-main-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, BottomNavComponent, UpdateBannerComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
})
export class MainLayoutComponent {}
