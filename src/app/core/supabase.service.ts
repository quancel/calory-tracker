import { InjectionToken, Injectable, computed, inject, signal } from '@angular/core';
import { type Session, type SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Erzeugt den Supabase-Client. Als Token statt eines direkten
 * `createClient`-Aufrufs im Feld-Initialisierer, damit Tests den
 * *Erzeuger* per `TestBed`-Provider austauschen können, statt
 * `@supabase/supabase-js` selbst zu mocken (`vi.mock` greift bei
 * Vitest-Dep-Prebundling nicht zuverlässig gegen ein Feld, das beim
 * Modul-Laden sofort ausgewertet wird). Der echte `createClient`-Aufruf
 * bleibt ausschließlich hier — kein Feature erzeugt einen eigenen Client.
 */
export const SUPABASE_CLIENT_FACTORY = new InjectionToken<() => SupabaseClient>(
  'SUPABASE_CLIENT_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => createClient(environment.supabaseUrl, environment.supabaseAnonKey),
  },
);

/**
 * Einziger Zugriffspunkt auf den Supabase-Client und die app-weite
 * Session-Wahrheit (siehe ADR-0003).
 *
 * `@supabase/supabase-js` wird ausschließlich hier importiert — kein
 * Feature erzeugt einen eigenen Client oder importiert das Paket direkt.
 * Der Session-Zustand (`session`, `userId`, `isAuthenticated`) lebt
 * ausschließlich hier, nicht in `auth/auth.store.ts`.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly clientFactory = inject(SUPABASE_CLIENT_FACTORY);

  /** Einzige `createClient`-Stelle im gesamten Projekt (über `clientFactory`). */
  readonly client: SupabaseClient = this.clientFactory();

  private readonly sessionState = signal<Session | null>(null);

  readonly session = this.sessionState.asReadonly();
  readonly userId = computed(() => this.sessionState()?.user.id ?? null);
  readonly isAuthenticated = computed(() => this.sessionState() !== null);

  private restorePromise: Promise<void> | null = null;

  constructor() {
    this.client.auth.onAuthStateChange((_event, session) => {
      this.sessionState.set(session);
    });
  }

  /**
   * Stellt die persistierte Session (falls vorhanden) einmalig wieder her.
   * Wird über einen App-Initializer beim Bootstrap abgewartet (siehe
   * `app.config.ts`) und zusätzlich defensiv von `core/auth.guard.ts`
   * abgewartet, bevor dort ausgewertet wird. Mehrfacher Aufruf liefert
   * dasselbe (bereits aufgelöste) Promise.
   */
  restoreSession(): Promise<void> {
    if (!this.restorePromise) {
      this.restorePromise = this.client.auth.getSession().then(({ data }) => {
        this.sessionState.set(data.session);
      });
    }
    return this.restorePromise;
  }
}
