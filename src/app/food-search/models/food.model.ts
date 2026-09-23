/**
 * Domänenmodelle von `food-catalog` (siehe ADR-0008). `Food`/`FoodSource`
 * wurden mit Paket PO-2026-09-20-010 nach `core/foods.service.ts` verschoben
 * (ADR-0012 Punkt 1, zweiter Nutzer `meals`) — keine zweite Definition, kein
 * Re-Export von hier. Importiere `Food`/`FoodSource` direkt aus
 * `../../core/foods.service`.
 */

/** Eingabe für das manuelle Anlegen eines Foods (Step A2, ADR-0008 Punkt 5, ADR-0010 Punkt 5). */
export interface CreateFoodInput {
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
  defaultPortionG: number | null;
  /** `null` ohne vorangegangenen Scan; sonst der Barcode aus Step A2-Vorbelegung (ADR-0010 Punkt 5). */
  barcode: string | null;
}
