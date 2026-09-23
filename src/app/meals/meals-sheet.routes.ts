import { Routes } from '@angular/router';
import { MealSheetComponent } from './components/meal-sheet/meal-sheet.component';

/**
 * Zweite Auxiliary-Route im benannten Outlet `sheet` (ADR-0012 Punkt 9) —
 * das Mahlzeit-Sheet, optionaler Query-Parameter `mealId` (Bearbeiten statt
 * Neuanlegen). Eigene Routendatei getrennt von `meals.routes.ts` (dessen
 * Top-Level-Route `mahlzeiten` im primären Outlet liegt), analog zur
 * Trennung von `diary.routes.ts`/`food-search.routes.ts`.
 */
export const MEALS_SHEET_ROUTES: Routes = [{ path: '', component: MealSheetComponent }];
