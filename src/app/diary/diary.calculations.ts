/**
 * Reine Rechenlogik der Tagesansicht — ohne DI, ohne Angular-Import, ohne
 * UI-Wissen (siehe code-conventions.md „Wo was hingehört", ADR-0006
 * Punkt 3). `diary.store.ts` ruft diese Funktionen ausschließlich in
 * `computed` auf.
 *
 * Kalendertag-Arithmetik und -Beschriftung sowie die Ziel-/Überschuss-
 * berechnung liegen seit Paket PO-2026-09-20-012 in
 * `core/date.calculations.ts` bzw. `core/progress.calculations.ts`
 * (zweiter Nutzer `stats`, ADR-0014 Punkt 7) — hier bleibt nur, was
 * ausschließlich `diary` auswertet.
 */

import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, type MealType } from '../core/meal-type.constants';
import { type DayTotals, type DiaryEntry, type MealSection } from './models/diary.model';

/**
 * Tageszeit-Vorauswahl für den FAB (Kernanforderung Paket
 * PO-2026-09-20-004): 05–11 Uhr Frühstück, 11–16 Uhr Mittag, 16–22 Uhr
 * Abend, außerhalb (22–05 Uhr) Snacks als Fallback. Untere Grenze
 * inklusiv, obere Grenze exklusiv.
 */
export function suggestedMealTypeForHour(hour: number): MealType {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'snack';
}

function entryKcal(entry: DiaryEntry): number {
  return (entry.amountG / 100) * entry.food.kcal100g;
}

function entryMacroG(entry: DiaryEntry, key: 'proteinG100g' | 'carbsG100g' | 'fatG100g'): number {
  return (entry.amountG / 100) * entry.food[key];
}

/** Tagessumme kcal + drei Makros aus Einträgen × Foods (amount_g/100 * Wert je 100g). */
export function computeDayTotals(entries: readonly DiaryEntry[]): DayTotals {
  return entries.reduce<DayTotals>(
    (totals, entry) => ({
      kcal: totals.kcal + entryKcal(entry),
      carbsG: totals.carbsG + entryMacroG(entry, 'carbsG100g'),
      proteinG: totals.proteinG + entryMacroG(entry, 'proteinG100g'),
      fatG: totals.fatG + entryMacroG(entry, 'fatG100g'),
    }),
    { kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 },
  );
}

/**
 * Gruppiert Einträge nach Mahlzeit-Sektion in fester Reihenfolge
 * (Frühstück/Mittag/Abend/Snacks) — alle vier Sektionen sind immer
 * enthalten, auch ohne Einträge.
 */
export function computeMealSections(entries: readonly DiaryEntry[]): MealSection[] {
  return MEAL_TYPE_ORDER.map((mealType) => {
    const sectionEntries = entries.filter((entry) => entry.mealType === mealType);
    return {
      mealType,
      label: MEAL_TYPE_LABELS[mealType],
      kcal: sectionEntries.reduce((sum, entry) => sum + entryKcal(entry), 0),
      entries: sectionEntries,
    };
  });
}
