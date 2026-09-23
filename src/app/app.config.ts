import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { SupabaseService } from './core/supabase.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // Stellt die persistierte Supabase-Session wieder her, BEVOR die erste
    // Route aufgelöst wird — core/auth.guard.ts darf erst danach auswerten
    // (siehe ADR-0003), sonst wirft ein Reload angemeldete Nutzer auf
    // /login zurück.
    provideAppInitializer(() => inject(SupabaseService).restoreSession()),
  ],
};
