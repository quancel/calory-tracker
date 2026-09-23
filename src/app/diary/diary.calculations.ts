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

import { addDaysToKey, diffInDays } from '../core/date.calculations';
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, type MealType } from '../core/meal-type.constants';
import { formatWeightKg } from '../core/weight.calculations';
import type { WeightLogEntry } from '../core/weight-logs.service';
import {
  type DayTotals,
  type DiaryEntry,
  type MealSection,
  type WeightTrendSummary,
} from './models/diary.model';

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

// --- Gewichtskarte: Mini-Verlauf (ADR-0019) ---------------------------------

/** Fenster des Mini-Verlaufs auf der Tagesansicht — bewusst kürzer als das 90-Tage-Diagramm der Gewicht-Ansicht. */
export const WEIGHT_CARD_WINDOW_DAYS = 30;

/**
 * Kompakte Trend-Zusammenfassung für die Gewichtskarte: jüngste Messung,
 * Veränderung zwischen ältester und jüngster Messung im Fenster und die
 * Sparkline-Punkte, normalisiert auf `0…1` (x = Position im Zeitfenster,
 * y = 0 unten/leichtester Wert, 1 oben/schwerster Wert). Die Umrechnung in
 * SVG-Koordinaten macht die Komponente.
 */
export function computeWeightTrendSummary(
  logs: readonly WeightLogEntry[],
  referenceDateKey: string,
): WeightTrendSummary {
  const startKey = addDaysToKey(referenceDateKey, -(WEIGHT_CARD_WINDOW_DAYS - 1));
  const points = logs
    .filter((log) => log.dateKey >= startKey && log.dateKey <= referenceDateKey)
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  if (points.length === 0) {
    return { latest: null, deltaKg: null, spanDays: 0, sparkline: [], values: [] };
  }

  const first = points[0];
  const latest = points[points.length - 1];
  const weights = points.map((p) => p.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min;

  return {
    latest,
    deltaKg: points.length > 1 ? roundToTenth(latest.weightKg - first.weightKg) : null,
    spanDays: diffInDays(first.dateKey, latest.dateKey),
    sparkline: points.map((p) => ({
      x: diffInDays(startKey, p.dateKey) / (WEIGHT_CARD_WINDOW_DAYS - 1),
      y: range === 0 ? 0.5 : (p.weightKg - min) / range,
    })),
    values: points,
  };
}

function roundToTenth(value: number): number {
  // `+ 0` normalisiert `-0` zu `0`, damit „±0,0 kg" statt „−0,0 kg" entsteht.
  return Math.round(value * 10) / 10 + 0;
}

/**
 * Text der Veränderung, z. B. „−0,8 kg in 14 Tagen", „+0,3 kg in 1 Tag",
 * „±0,0 kg in 7 Tagen". Echtes Minuszeichen (U+2212) wie im übrigen
 * Zahlensatz. `null` ohne zweite Messung.
 */
export function formatWeightDelta(summary: WeightTrendSummary): string | null {
  if (summary.deltaKg === null) return null;
  const { deltaKg, spanDays } = summary;
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '\u2212' : '±';
  const days = spanDays === 1 ? '1 Tag' : `${spanDays} Tagen`;
  return `${sign}${formatWeightKg(Math.abs(deltaKg))} kg in ${days}`;
}
