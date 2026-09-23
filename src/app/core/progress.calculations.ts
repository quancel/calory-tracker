/**
 * Ziel-/Überschussberechnung eines Ist-Werts gegen ein Ziel — genau eine
 * Quelle im Projekt (siehe code-conventions.md „Wo was hingehört",
 * ADR-0014 Punkt 7). Reine Funktion ohne DI, ohne Angular-Import, ohne
 * UI-Wissen.
 *
 * Umzug aus `diary/diary.calculations.ts` mit Paket PO-2026-09-20-012:
 * zweiter Nutzer `stats` (Zwei-Nutzer-Regel, ADR-0005). Verhaltensneutraler
 * Umzug — keine Änderung an Logik oder Ergebnissen, nur der Ort. Die
 * Semantik „kein Ziel gesetzt = keine Zeile oder Wert <= 0" (ADR-0006
 * Punkt 4) wird ausschließlich hier ausgewertet.
 */

import { GOAL_OVERSHOOT_TOLERANCE } from './nutrition.constants';

/**
 * Ergebnis der Füll-/Überschussberechnung eines Ist-Werts gegen ein Ziel
 * (siehe design-conventions.md „Kalorienring"/„Makro-Balken",
 * `GOAL_OVERSHOOT_TOLERANCE` aus `core/nutrition.constants.ts`).
 */
export interface ProgressResult {
  /** `false`, wenn keine Zeile vorhanden ist oder der Zielwert `<= 0` ist — dann keine erfundenen Standardwerte. */
  hasGoal: boolean;
  actual: number;
  goal: number | null;
  /** 0..1, bei `hasGoal: false` immer 0. */
  fillFraction: number;
  /** >= 0, Anteil relativ zum Ziel jenseits von 100 %. */
  overshootFraction: number;
  /** >= 0, absoluter Überschuss in derselben Einheit wie `actual`. */
  overshootAbsolute: number;
  /** `true`, sobald `actual` die 105-%-Toleranzschwelle überschreitet. */
  isWarning: boolean;
}

/**
 * Füll-/Überschussanteil eines Ist-Werts gegen ein Ziel, getrennt
 * ausgewertet (ADR-0006 Punkt 3). `goalValue` ist `null`/`undefined` oder
 * `<= 0`, wenn kein Ziel gesetzt ist — dann `hasGoal: false` und keine
 * erfundenen Standardwerte (ADR-0006 Punkt 4, design-conventions.md „Kein
 * Ziel gesetzt").
 *
 * `fillFraction` ist immer auf 100 % des Ziels gekappt. `overshootFraction`
 * (relativ) und `overshootAbsolute` bilden den Anteil jenseits des Ziels ab
 * — unabhängig von `isWarning`. `isWarning` wird erst wahr, sobald der Ist-
 * Wert die `GOAL_OVERSHOOT_TOLERANCE`-Schwelle (105 %) überschreitet;
 * zwischen 100 % und einschließlich 105 % bleibt die Darstellung neutral/
 * Akzent (design-conventions.md „Kalorienring"/„Makro-Balken").
 */
export function computeProgress(
  actual: number,
  goalValue: number | null | undefined,
): ProgressResult {
  const hasGoal = goalValue != null && goalValue > 0;

  if (!hasGoal) {
    return {
      hasGoal: false,
      actual,
      goal: null,
      fillFraction: 0,
      overshootFraction: 0,
      overshootAbsolute: 0,
      isWarning: false,
    };
  }

  const goal = goalValue as number;
  const ratio = actual / goal;

  return {
    hasGoal: true,
    actual,
    goal,
    fillFraction: Math.min(ratio, 1),
    overshootFraction: Math.max(ratio - 1, 0),
    overshootAbsolute: Math.max(actual - goal, 0),
    isWarning: ratio > GOAL_OVERSHOOT_TOLERANCE,
  };
}
