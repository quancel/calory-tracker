/**
 * Mahlzeiten-Typ als projektweite Konstante (siehe code-conventions.md
 * "Wo was hingehört", ADR-0009 Punkt 6). Ursprünglich in
 * `diary/models/diary.model.ts` (ADR-0006); wandert mit Paket
 * PO-2026-09-20-007 nach `core/`, weil ab diesem Paket zwei Features
 * (`diary` und `food-catalog`) denselben Typ und dieselben
 * Anzeige-Konstanten brauchen (Mahlzeit-Chip-Reihe im Eintrags-Sheet).
 * Kein Re-Export aus `diary` — beide Features importieren direkt von hier.
 *
 * `suggestedMealTypeForHour()` bleibt bewusst in `diary/diary.calculations.ts`
 * (einziger Aufrufer ist der FAB der Tagesansicht, ADR-0009 Punkt 6).
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Feste Anzeige-Reihenfolge der vier Mahlzeiten-Sektionen/-Chips. */
export const MEAL_TYPE_ORDER: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_TYPE_LABELS: Readonly<Record<MealType, string>> = {
  breakfast: 'Frühstück',
  lunch: 'Mittag',
  dinner: 'Abend',
  snack: 'Snacks',
};
