/**
 * Reine Sortier-/Summenlogik für gespeicherte Mahlzeiten — EINE Quelle für
 * beide Listen (Verwaltungsansicht in `meals`, Log-Tab in `food-catalog`),
 * damit die geforderte identische Reihenfolge/Darstellung garantiert ist
 * (ADR-0012 Punkt 3/4). Ohne DI, ohne Angular-Import, ohne UI-Wissen.
 */

export interface MealItemNutrition {
  amountG: number;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
}

export interface MealTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealSummaryLike {
  name: string;
}

const COLLATOR = new Intl.Collator('de', { sensitivity: 'base' });

/**
 * Alphabetisch, case-insensitive, deutsche Sortierreihenfolge
 * (design-conventions.md „Gespeicherte Mahlzeiten"). Kein Sekundärkriterium
 * — Namen dürfen doppelt vorkommen (kein Unique-Index, ADR-0012 Kontext).
 * Sortierung im Client, nicht per `order by` (ADR-0012 Punkt 4).
 */
export function sortMealsByName<T extends MealSummaryLike>(meals: readonly T[]): T[] {
  return [...meals].sort((a, b) => COLLATOR.compare(a.name, b.name));
}

/** kcal-Gesamtsumme + Makrosummen einer Mahlzeit — reine Skalierung `amount_g / 100` je Position, wie Step B/M3 (nie persistiert). */
export function computeMealTotals(items: readonly MealItemNutrition[]): MealTotals {
  return items.reduce(
    (totals, item) => {
      const factor = item.amountG / 100;
      return {
        kcal: totals.kcal + item.kcal100g * factor,
        proteinG: totals.proteinG + item.proteinG100g * factor,
        carbsG: totals.carbsG + item.carbsG100g * factor,
        fatG: totals.fatG + item.fatG100g * factor,
      };
    },
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
