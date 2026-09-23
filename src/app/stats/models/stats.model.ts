/**
 * Domänenmodelle des Verlaufs (siehe ADR-0014). Reine Typen, kein
 * Angular-Import — der Rohzugriff auf Supabase (snake_case) bleibt in
 * `stats.service.ts` gekapselt und mappt auf diese Typen.
 */

import type { NutritionPer100g } from '../../core/foods.calculations';

export type PeriodKind = 'week' | 'month';

/**
 * Schlanker Eintrag der Periodenabfrage — nur `date`, `amount_g` und die
 * eingebetteten Nährwerte je 100 g (ADR-0014 Punkt 5). Ohne `id`,
 * `meal_type`: der Verlauf zeigt keine Einzeleinträge.
 */
export interface StatsEntry {
  dateKey: string;
  amountG: number;
  food: NutritionPer100g;
}

/**
 * Zielzeile des Nutzers, zweite bewusste Lesestelle neben
 * `diary/diary.service.ts` (ADR-0014 Punkt 6, code-conventions.md
 * „Abweichungen"). `null` bedeutet „keine Zeile vorhanden"; ein einzelner
 * Wert `<= 0` bedeutet „für dieses Makro kein Ziel gesetzt" (ADR-0006
 * Punkt 4) — wird in `computeProgress` ausgewertet, nicht hier.
 */
export interface StatsGoal {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DayTotals {
  kcal: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
}

/**
 * Drei Balkenzustände (design-conventions.md „Balken-Chart (kcal pro
 * Tag)"): `'entries'` — normaler Balken (vergangener/heutiger Tag ODER
 * zukünftiger Tag, jeweils mit Einträgen). `'gap'` — vergangener/heutiger
 * Tag ohne Einträge (flächig). `'future-empty'` — zukünftiger Tag ohne
 * Einträge, unabhängig vom Abstand zu heute (gestrichelte Kontur, keine
 * dritte Variante jenseits heute+7).
 */
export type DayBarState = 'entries' | 'gap' | 'future-empty';

export interface DayBucket extends DayTotals {
  dateKey: string;
  hasEntries: boolean;
  /** `true`, wenn `dateKey` nach dem heutigen Tag liegt. */
  isFuture: boolean;
  state: DayBarState;
  /**
   * Nur vergangene/heutige Tage MIT Einträgen zählen in Durchschnitt/Nenner
   * (Nutzer-Entscheidung, PO-2026-09-20-012): jeder Zukunftstag — auch
   * einer mit Einträgen innerhalb des Vorwärtsfensters — zählt NICHT.
   */
  countsForAverage: boolean;
}

export interface PeriodBounds {
  startKey: string;
  endKey: string;
  dateKeys: readonly string[];
}

export interface PeriodAverages extends DayTotals {
  /** Anzahl der Tage, über die gemittelt wurde (Nenner) — 0 bei leerer Periode. */
  count: number;
}
