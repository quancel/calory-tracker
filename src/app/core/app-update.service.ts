import { InjectionToken, Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * Löst den Seiten-Reload aus. Als Token statt eines direkten
 * `document.location.reload()`-Aufrufs, damit Tests ihn per
 * `TestBed`-Provider ersetzen können — `document.location.reload` lässt
 * sich in jsdom nicht per `vi.spyOn`/`Object.defineProperty` überschreiben
 * (gleiches Muster wie `SUPABASE_CLIENT_FACTORY` in `supabase.service.ts`).
 */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => () => document.location.reload(),
});

/**
 * Einzige Zugriffsstelle des Projekts auf `SwUpdate` (ADR-0015 Punkt 1,
 * neben der Registrierung in `app.config.ts`). Kapselt den Update-Flow aus
 * ADR-0002: `versionUpdates` → `VERSION_READY` setzt `updateAvailable`,
 * nie automatisch angewendet. Exponiert Zustand als Signal und Aktionen als
 * Methoden — kein Feature-Store und keine Komponente injiziert `SwUpdate`
 * direkt (siehe `code-conventions.md`).
 *
 * "Später" ist reiner, nicht persistierter Client-State (ADR-0015 Punkt 4):
 * `dismissForSession()` unterdrückt das Banner nur für die laufende
 * Vordergrundphase. Wird das Dokument über `visibilitychange` wieder
 * sichtbar, wird die Unterdrückung zurückgesetzt — "Sitzung" ist damit die
 * Vordergrundphase, nicht der Login- bzw. Tab-Lebenszyklus.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly reloadPage = inject(RELOAD_PAGE);

  private readonly updateReady = signal(false);
  private readonly dismissedForSession = signal(false);

  /**
   * `true`, sobald ein Update bereit ist und nicht per "Später" für die
   * laufende Vordergrundphase unterdrückt wurde. Bleibt dauerhaft `false`,
   * wenn der Service Worker abgeschaltet ist (`isEnabled === false`, z. B.
   * Dev-Server/Unit-Tests) — ein gültiger Zustand, kein Fehler
   * (ADR-0015 Punkt 6). Komponenten prüfen `isEnabled` nicht selbst.
   */
  readonly updateAvailable = computed(() => this.updateReady() && !this.dismissedForSession());

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.updateReady.set(true);
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        // Banner blendet aus (ADR-0015 Punkt 6) — die Installation ist
        // gescheitert, es gibt nichts, das übernommen werden könnte.
        this.updateReady.set(false);
      }
    });

    // ADR-0002: `unrecoverable` löst wie entschieden einen Reload aus.
    this.swUpdate.unrecoverable.subscribe(() => {
      this.reload();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.dismissedForSession.set(false);
      }
    });
  }

  /** "Neu laden": wendet das bereitstehende Update an und lädt neu. */
  async applyUpdate(): Promise<void> {
    await this.swUpdate.activateUpdate();
    this.reload();
  }

  /**
   * "Später": blendet das Banner für die laufende Vordergrundphase aus,
   * wendet das Update nicht an. Wird bei `visibilitychange` → sichtbar
   * zurückgesetzt (siehe Klassenkommentar).
   */
  dismissForSession(): void {
    this.dismissedForSession.set(true);
  }

  private reload(): void {
    this.reloadPage();
  }
}
