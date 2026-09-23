/**
 * Reine Rechenlogik rund um einen einzelnen Gewichtswert, die mehr als ein
 * Feature nutzt (ADR-0019): Wertebereich, Eingabevalidierung und deutsche
 * Anzeigeformatierung. Genutzt von `goals` (Erfassen-Sheet, Gewicht-Ansicht)
 * und `diary` (Schnelleingabe auf der Tagesansicht). Ohne DI, ohne
 * Angular-Import. Trend-/Vorschlags-/Diagrammlogik bleibt in
 * `goals/weight.calculations.ts`, Mini-Verlauf in `diary/diary.calculations.ts`.
 */

// --- Wertebereich der Gewichtseingabe (ADR-0017 Punkt 2, ADR-0018 Punkt 2) --

/** Bewusste Doppelung zum `check`-Constraint von `weight_logs`/`goals.target_weight_kg` — beide bei Änderung nachziehen. */
export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;
export const WEIGHT_MAX_DECIMAL_PLACES = 1;

// --- Eingabevalidierung des Erfassen-Sheets ---------------------------------

export type WeightEntryValidation =
  { valid: true; value: number } | { valid: false; error: string };

function normalizeWeightNumber(raw: string): string | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || !/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function countDecimalPlaces(normalized: string): number {
  const dotIndex = normalized.indexOf('.');
  return dotIndex === -1 ? 0 : normalized.length - dotIndex - 1;
}

/**
 * Validiert die Rohtext-Eingabe des Erfassen-Sheets (design-conventions.md
 * „Erfassen-Sheet"): Pflichtfeld, Wertebereich `WEIGHT_MIN_KG`–`WEIGHT_MAX_KG`,
 * höchstens eine Nachkommastelle.
 */
export function validateWeightEntry(raw: string): WeightEntryValidation {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { valid: false, error: 'Bitte ein Gewicht eingeben.' };
  }

  const normalized = normalizeWeightNumber(trimmed);
  if (normalized === null) {
    return { valid: false, error: 'Bitte eine gültige Zahl eingeben.' };
  }

  if (countDecimalPlaces(normalized) > WEIGHT_MAX_DECIMAL_PLACES) {
    return { valid: false, error: 'Bitte höchstens eine Nachkommastelle eingeben.' };
  }

  const value = Number(normalized);
  if (value < WEIGHT_MIN_KG || value > WEIGHT_MAX_KG) {
    return {
      valid: false,
      error: `Gewicht muss zwischen ${WEIGHT_MIN_KG} und ${WEIGHT_MAX_KG} kg liegen.`,
    };
  }

  return { valid: true, value };
}

/** Deutsche Dezimalschreibweise mit genau einer Nachkommastelle, z. B. `72,4` (ohne Einheit). */
export function formatWeightKg(weightKg: number): string {
  return weightKg.toFixed(1).replace('.', ',');
}
