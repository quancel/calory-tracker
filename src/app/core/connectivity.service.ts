import { Injectable, signal } from '@angular/core';

/**
 * Einziger Zugriffspunkt auf `navigator.onLine` und die `online`/`offline`-
 * Events (siehe code-conventions.md, ADR-0016 Punkt 9). Kein Feature, kein
 * Store und kein anderer Dienst liest diese Browser-APIs selbst — gleiches
 * Muster wie `SwUpdate` in `core/app-update.service.ts` (ADR-0015).
 *
 * Eine Online-Phase (ADR-0016 Punkt 9) beginnt mit einem `online`-Event bzw.
 * einem App-Start bei `navigator.onLine === true` und endet mit dem
 * nächsten `offline`-Event — Aufrufer, die auf einen Wechsel zu „online"
 * reagieren wollen (`core/entry-sync.service.ts`), beobachten `online()`
 * selbst per `effect()`, kein Observable-Kanal nötig (Projekt ist
 * `async`/`await`-basiert, ADR-0010).
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly onlineState = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  readonly online = this.onlineState.asReadonly();

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.onlineState.set(true));
    window.addEventListener('offline', () => this.onlineState.set(false));
  }
}
