import { Routes } from '@angular/router';
import { authGuard, redirectIfAuthenticatedGuard } from './core/auth.guard';

/**
 * Top-Level-Routen — alles lazy (siehe code-conventions.md).
 *
 * Alle vier geschützten Ansichten (`tagebuch`, `verlauf`, `ziele`,
 * `mahlzeiten`) liegen ab Paket PO-2026-09-20-012 als `children` unter
 * einer pfadlosen Layout-Route (ADR-0014 Punkt 1): der `authGuard` steht
 * **einmal** hier statt viermal an den Kindern. `MainLayoutComponent`
 * rendert den primären `<router-outlet/>` und darunter die
 * Bottom-Navigation (`src/app/shell/`). Die Sichtbarkeit der Navigation
 * ergibt sich allein aus der Routenzugehörigkeit — kein `showNav`-Signal,
 * kein URL-Vergleich. `ziele`/`mahlzeiten` sind tab-lose Kinder derselben
 * Layout-Route (ADR-0014 Punkt 3) und behalten ihren Icon-Einstieg aus dem
 * Tagesansicht-Header.
 *
 * `login` bleibt ohne `authGuard` und außerhalb der Layout-Route (keine
 * Bottom-Navigation vor dem Login), führt aber bei bestehender Session über
 * `redirectIfAuthenticatedGuard` zu `tagebuch` weiter.
 *
 * Die beiden Auxiliary-Routen im benannten Outlet `sheet`
 * (`eintrag-erfassen`, `mahlzeit-bearbeiten`) bleiben top-level **neben**
 * der Layout-Route (ADR-0014 Punkt 2) — `app.html` behält beide Outlets,
 * das Sheet liegt damit weiterhin über allem, auch über der
 * Bottom-Navigation. Die bestehenden Aufrufe
 * `router.navigate([{ outlets: { sheet: [...] } }])` aus `diary`/`meals`
 * bleiben unverändert gültig (absolut ab Wurzel, ADR-0008 Punkt 1 /
 * ADR-0012 Punkt 9 gelten fort).
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canActivate: [redirectIfAuthenticatedGuard],
    loadChildren: () => import('./auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shell/components/main-layout/main-layout.component').then(
        (m) => m.MainLayoutComponent,
      ),
    children: [
      {
        path: 'tagebuch',
        loadChildren: () => import('./diary/diary.routes').then((m) => m.DIARY_ROUTES),
      },
      {
        path: 'verlauf',
        loadChildren: () => import('./stats/stats.routes').then((m) => m.STATS_ROUTES),
      },
      {
        path: 'ziele',
        loadChildren: () => import('./goals/goals.routes').then((m) => m.GOALS_ROUTES),
      },
      {
        path: 'mahlzeiten',
        loadChildren: () => import('./meals/meals.routes').then((m) => m.MEALS_ROUTES),
      },
    ],
  },
  {
    path: 'eintrag-erfassen',
    outlet: 'sheet',
    canActivate: [authGuard],
    loadChildren: () => import('./food-search/food-search.routes').then((m) => m.FOOD_SEARCH_ROUTES),
  },
  {
    // Zweite Auxiliary-Route im Outlet `sheet` (ADR-0012 Punkt 9) — das
    // Mahlzeit-Sheet von `meals`, optionaler Query-Parameter `mealId`.
    path: 'mahlzeit-bearbeiten',
    outlet: 'sheet',
    canActivate: [authGuard],
    loadChildren: () => import('./meals/meals-sheet.routes').then((m) => m.MEALS_SHEET_ROUTES),
  },
  { path: '**', redirectTo: 'login' },
];
