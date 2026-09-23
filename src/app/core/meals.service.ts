import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

/**
 * Mahlzeiten-**Lesepfad**: Liste mit Positionen und eingebetteten Foods,
 * eine PostgREST-Abfrage (gleiches Muster wie `diary.service.ts`,
 * ADR-0012 Punkt 3). Zwei Nutzer: die Verwaltungsansicht in `meals` und der
 * Log-Tab „Gespeicherte Mahlzeiten" im Eintrags-Sheet (`food-catalog`).
 *
 * **Schreiben** (Anlegen/Ändern/Löschen von `meals`/`meal_items`) bleibt
 * ausschließlich in `src/app/meals/meals.service.ts` — genau ein Nutzer,
 * die Zwei-Nutzer-Regel wird nicht vorsorglich gedehnt.
 *
 * Kein `user_id`-Filter im Client — RLS regelt die Sichtbarkeit serverseitig
 * (`meals_select`, `meal_items_select` über `exists`-Unterabfrage auf den
 * Elternsatz).
 */

export interface MealItemFood {
  id: string;
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
}

export interface MealItem {
  id: string;
  amountG: number;
  food: MealItemFood;
}

export interface Meal {
  id: string;
  name: string;
  items: MealItem[];
}

export type LoadMealsResult = { success: true; meals: Meal[] } | { success: false; message: string };

interface RawFood {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

interface RawMealItem {
  id: string;
  amount_g: number;
  foods: RawFood | null;
}

interface RawMeal {
  id: string;
  name: string;
  meal_items: RawMealItem[] | null;
}

const MEAL_COLUMNS =
  'id, name, meal_items(id, amount_g, foods(id, name, kcal_100g, protein_100g, carbs_100g, fat_100g))';

function toMeal(raw: RawMeal): Meal {
  const items: MealItem[] = (raw.meal_items ?? [])
    // Eine Position ohne eingebettetes Food kann durch `on delete restrict`
    // eigentlich nicht vorkommen — defensiv übersprungen statt mit
    // erfundenen Nährwerten in die Summe zu fließen (gleiches Muster wie
    // `diary.service.ts`).
    .filter((raw): raw is RawMealItem & { foods: RawFood } => raw.foods !== null)
    .map((item) => ({
      id: item.id,
      amountG: item.amount_g,
      food: {
        id: item.foods.id,
        name: item.foods.name,
        kcal100g: item.foods.kcal_100g,
        proteinG100g: item.foods.protein_100g,
        carbsG100g: item.foods.carbs_100g,
        fatG100g: item.foods.fat_100g,
      },
    }));

  return { id: raw.id, name: raw.name, items };
}

@Injectable({ providedIn: 'root' })
export class CoreMealsService {
  private readonly supabase = inject(SupabaseService);

  async loadMeals(): Promise<LoadMealsResult> {
    const response = await this.supabase.client.from('meals').select(MEAL_COLUMNS);

    if (response.error) {
      return { success: false, message: 'Gespeicherte Mahlzeiten konnten nicht geladen werden.' };
    }

    const rows = (response.data ?? []) as unknown as RawMeal[];
    return { success: true, meals: rows.map(toMeal) };
  }
}
