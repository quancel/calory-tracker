import { Routes } from '@angular/router';
import { MealsListComponent } from './components/meals-list/meals-list.component';

/** Top-Level-Route `mahlzeiten` — gewöhnlicher Seitenwechsel wie `ziele` (ADR-0012 Punkt 9). */
export const MEALS_ROUTES: Routes = [{ path: '', component: MealsListComponent }];
