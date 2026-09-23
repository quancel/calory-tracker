import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Hält NUR Formular-/Absendezustand des Login-Formulars (`submitting`,
 * generische Fehlermeldung). Der Session-/Authentifizierungszustand
 * (`isAuthenticated` etc.) lebt in `core/supabase.service.ts` und wird
 * hier bewusst NICHT dupliziert (siehe ADR-0003).
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly authService = inject(AuthService);

  private readonly submittingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly submitting = this.submittingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Meldet an. Gibt `true` bei Erfolg zurück, `false` bei Fehler (Fehlertext dann über `error()` abrufbar). */
  async signIn(email: string, password: string): Promise<boolean> {
    this.submittingState.set(true);
    this.errorState.set(null);

    const result = await this.authService.signInWithPassword(email, password);

    this.submittingState.set(false);

    if (!result.success) {
      this.errorState.set(result.message);
      return false;
    }

    return true;
  }

  clearError(): void {
    this.errorState.set(null);
  }
}
