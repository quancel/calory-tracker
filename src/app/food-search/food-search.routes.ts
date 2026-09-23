import { Routes } from '@angular/router';
import { FoodEntrySheetComponent } from './components/food-entry-sheet/food-entry-sheet.component';

/**
 * Lazy-Routen von `food-catalog`, geladen im benannten Outlet `sheet`
 * (siehe `app.routes.ts`, ADR-0008 Punkt 1).
 */
export const FOOD_SEARCH_ROUTES: Routes = [{ path: '', component: FoodEntrySheetComponent }];
