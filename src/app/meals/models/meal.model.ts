/**
 * Domänenmodelle des Schreibpfads von `meals` (siehe ADR-0012 Punkt 3).
 * Der Lesepfad (`Meal`/`MealItem` mit eingebetteten Foods) liegt in
 * `core/meals.service.ts` — diese Datei enthält nur die Eingabeform für
 * Anlegen/Ändern.
 */

export interface MealItemInput {
  foodId: string;
  amountG: number;
}

export interface SaveMealInput {
  name: string;
  items: readonly MealItemInput[];
}
