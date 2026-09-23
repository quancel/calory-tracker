import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Root-Shell der Anwendung.
 *
 * Zeigt beim Start einen einfachen Lade-Platzhalter (vollflächige
 * --color-neutral-0 Fläche mit zentriertem App-Icon-Motiv), bis die erste
 * Route geladen ist. Es findet hier bewusst KEIN echter Auth-Check statt
 * — der kommt erst mit Paket PO-2026-09-20-002. Der Platzhalter markiert
 * lediglich die Stelle, an der ein künftiger Session-Check ansetzen wird.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly booting = signal(true);

  constructor(router: Router) {
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.booting.set(false));
  }
}
