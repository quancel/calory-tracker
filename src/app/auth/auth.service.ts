import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';

/** Domain-Ergebnis eines Anmeldeversuchs — kein Supabase-Typ nach außen. */
export type SignInResult = { success: true } | { success: false; message: string };

/**
 * Kapselt `signInWithPassword`/`signOut` und übersetzt Supabase-Fehler in
 * ein Domain-Ergebnis. Kein Signup, kein Passwort-Reset (siehe ADR-0003,
 * Constraints Paket PO-2026-09-20-002) — die beiden Accounts werden im
 * Supabase-Dashboard angelegt.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  async signInWithPassword(email: string, password: string): Promise<SignInResult> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });

    if (error) {
      // Bewusst generisch: das UI unterscheidet nicht zwischen falscher
      // E-Mail und falschem Passwort (design_notes Paket 002).
      return { success: false, message: 'E-Mail oder Passwort ist falsch.' };
    }

    return { success: true };
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }
}
