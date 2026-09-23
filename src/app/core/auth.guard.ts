import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

/**
 * Schützt Routen hinter dem Login (aktuell `tagebuch`). `login` bleibt
 * ungeschützt (siehe ADR-0003).
 *
 * Wertet erst aus, nachdem die persistierte Session wiederhergestellt
 * wurde — `restoreSession()` liefert dasselbe (ggf. bereits aufgelöste)
 * Promise wie der App-Initializer in `app.config.ts`, ein erneuter
 * Reload wirft angemeldete Nutzer daher nicht auf `login` zurück.
 */
export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  await supabase.restoreSession();

  return supabase.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

/**
 * Schützt die `login`-Route in die andere Richtung: bei bestehender
 * Session führt `/login` sofort zu `/tagebuch` weiter, statt das
 * (dann sinnlose) Formular erneut zu zeigen.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  await supabase.restoreSession();

  return supabase.isAuthenticated() ? router.createUrlTree(['/tagebuch']) : true;
};
