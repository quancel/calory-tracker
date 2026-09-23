import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import type { SaveMealInput } from './models/meal.model';

export type CreateMealResult = { success: true; mealId: string } | { success: false; message: string };
export type UpdateMealResult = { success: true } | { success: false; message: string };
export type DeleteMealResult = { success: true } | { success: false; message: string };

/**
 * Einziger Schreibweg auf `meals`/`meal_items` (ADR-0012 Punkt 3). Der
 * Lesepfad (Liste mit Positionen, zwei Nutzer) liegt in
 * `core/meals.service.ts`.
 *
 * **Anlegen ist ein Zwei-Schritt mit Kompensation** (ADR-0012 Punkt 7):
 * PostgREST kennt keine mehrtabellige Transaktion. Scheitert der zweite
 * Schritt (Positionen), wird die eben angelegte Mahlzeit wieder gelöscht
 * (kompensierendes `delete`), bevor der Fehler gemeldet wird. Bewusst
 * **kein** Postgres-RPC — neues Persistenz-Pattern für einen Fall, den die
 * Kompensation abdeckt.
 *
 * **Bearbeiten ersetzt** die Positionen (`delete` aller `meal_items` der
 * Mahlzeit, danach Array-`insert`) statt sie einzeln abzugleichen — nichts
 * referenziert eine `meal_items.id` außerhalb dieses Vorgangs, ein Diff
 * wäre reiner Aufwand.
 *
 * „Keine Mahlzeit ohne Positionen" ist eine Client-Regel (M1-Speichern-
 * Button gesperrt), kein DB-Constraint (ADR-0012 Punkt 8) — diese Datei
 * verlässt sich nicht darauf und behandelt eine leere Positionsliste beim
 * Bearbeiten defensiv korrekt (löscht nur, fügt nichts ein).
 */
@Injectable({ providedIn: 'root' })
export class MealsService {
  private readonly supabase = inject(SupabaseService);

  async createMeal(input: SaveMealInput): Promise<CreateMealResult> {
    const userId = this.supabase.userId();
    if (!userId) {
      return { success: false, message: 'Nicht angemeldet.' };
    }

    const mealResponse = await this.supabase.client
      .from('meals')
      .insert({ name: input.name, user_id: userId })
      .select('id')
      .single();

    if (mealResponse.error || !mealResponse.data) {
      return { success: false, message: 'Mahlzeit konnte nicht angelegt werden.' };
    }

    const mealId = (mealResponse.data as { id: string }).id;

    if (input.items.length === 0) {
      return { success: true, mealId };
    }

    const itemsResponse = await this.supabase.client.from('meal_items').insert(
      input.items.map((item) => ({
        meal_id: mealId,
        food_id: item.foodId,
        amount_g: item.amountG,
      })),
    );

    if (itemsResponse.error) {
      // Kompensation (ADR-0012 Punkt 7): die eben angelegte Mahlzeit wieder
      // entfernen, statt eine positionslose Mahlzeit stehen zu lassen.
      await this.supabase.client.from('meals').delete().eq('id', mealId);
      return { success: false, message: 'Mahlzeit konnte nicht gespeichert werden.' };
    }

    return { success: true, mealId };
  }

  async updateMeal(mealId: string, input: SaveMealInput): Promise<UpdateMealResult> {
    const updateResponse = await this.supabase.client
      .from('meals')
      .update({ name: input.name })
      .eq('id', mealId);

    if (updateResponse.error) {
      return { success: false, message: 'Mahlzeit konnte nicht gespeichert werden.' };
    }

    const deleteResponse = await this.supabase.client
      .from('meal_items')
      .delete()
      .eq('meal_id', mealId);

    if (deleteResponse.error) {
      return { success: false, message: 'Mahlzeit konnte nicht gespeichert werden.' };
    }

    if (input.items.length === 0) {
      return { success: true };
    }

    const insertResponse = await this.supabase.client.from('meal_items').insert(
      input.items.map((item) => ({
        meal_id: mealId,
        food_id: item.foodId,
        amount_g: item.amountG,
      })),
    );

    if (insertResponse.error) {
      return { success: false, message: 'Mahlzeit konnte nicht gespeichert werden.' };
    }

    return { success: true };
  }

  /** `meal_items` werden über `on delete cascade` automatisch mitgelöscht — kein separater Schritt nötig. */
  async deleteMeal(mealId: string): Promise<DeleteMealResult> {
    const response = await this.supabase.client.from('meals').delete().eq('id', mealId);

    if (response.error) {
      return { success: false, message: 'Mahlzeit konnte nicht gelöscht werden.' };
    }

    return { success: true };
  }
}
