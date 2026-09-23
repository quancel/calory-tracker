/**
 * Reine Food-/Nährwert-Rechenlogik mit zwei Nutzern (`food-catalog` und
 * `meals`, ADR-0012 Punkt 2) — ohne DI, ohne Angular-Import, ohne
 * UI-Wissen. Was nur `food-catalog` nutzt (OFF-Normalisierung,
 * Step-A2-Formularvalidierung, Kamera-Fehlertexte) bleibt in
 * `food-search/food-search.calculations.ts`.
 */

import {
  ATWATER_CARBS_KCAL_PER_G,
  ATWATER_FAT_KCAL_PER_G,
  ATWATER_PROTEIN_KCAL_PER_G,
  KCAL_DEVIATION_THRESHOLD,
  MACRO_SUM_MAX_G_PER_100G,
} from './nutrition.constants';
import type { Food } from './foods.service';

/**
 * Teilstring-Suche, case-insensitive, gegen den bereits geladenen
 * Sitzungs-Cache — kein Netzzugriff.
 */
export function filterFoodsByQuery(foods: readonly Food[], query: string): Food[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === '') {
    return [...foods];
  }
  return foods.filter((food) => food.name.toLowerCase().includes(normalized));
}

export type TextFieldValidation = { valid: true; value: string } | { valid: false; error: string };
export type AmountFieldValidation =
  { valid: true; value: number } | { valid: false; error: string };

/** Akzeptiert `,` als Dezimaltrennzeichen zusätzlich zu `.` (wie goals.calculations.ts `parseGoalNumber`). */
export function parseDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || !/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

/** Name-Pflichtfeld (Step A2): nicht leer, getrimmt. */
export function validateNameField(raw: string): TextFieldValidation {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { valid: false, error: 'Bitte einen Namen eingeben.' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Mengenfeld (Step B / Mahlzeit-Sheet M3, ADR-0009 Punkt 8): leer/nicht-
 * numerisch/0/negativ wird abgelehnt. **Keine Obergrenze**.
 */
export function validateAmountField(raw: string): AmountFieldValidation {
  if (raw.trim() === '') {
    return { valid: false, error: 'Bitte eine Menge eingeben.' };
  }
  const value = parseDecimal(raw);
  if (value === null) {
    return { valid: false, error: 'Bitte eine gültige Zahl eingeben.' };
  }
  if (value <= 0) {
    return { valid: false, error: 'Menge muss größer als 0 sein.' };
  }
  return { valid: true, value };
}

/** Vorbelegung der Menge (ADR-0009 Punkt 10): `defaultPortionG`, sonst 100 — reine UI-Vorbelegung, nie zurückgeschrieben. */
export function resolveDefaultAmount(food: Pick<Food, 'defaultPortionG'>): string {
  return food.defaultPortionG !== null ? `${food.defaultPortionG}` : '100';
}

export interface NutritionPer100g {
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
}

export interface LiveNutrition {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Live-Berechnung (Step B / M3): reine Skalierung `amount_g / 100`, nie persistiert. */
export function computeLiveNutrition(food: NutritionPer100g, amountG: number): LiveNutrition {
  const factor = amountG / 100;
  return {
    kcal: food.kcal100g * factor,
    proteinG: food.proteinG100g * factor,
    carbsG: food.carbsG100g * factor,
    fatG: food.fatG100g * factor,
  };
}

/**
 * Nullable-tolerante Nährwertform (ADR-0011 Punkt 2): Grundlage der
 * Plausibilitäts-/Vollständigkeitsprüfung.
 */
export interface NutritionMaybeNull {
  kcal100g: number | null;
  proteinG100g: number | null;
  carbsG100g: number | null;
  fatG100g: number | null;
}

export function isNutritionIncomplete(nutrition: NutritionMaybeNull): boolean {
  return (
    nutrition.kcal100g === null ||
    nutrition.proteinG100g === null ||
    nutrition.carbsG100g === null ||
    nutrition.fatG100g === null
  );
}

/**
 * Live-Hilfswert für die Formulare (Anlegen/Korrigieren): rechnet aus den
 * bereits eingegebenen Makros die Energie nach Atwater aus, damit der
 * Nutzer beim kcal-Feld nicht selbst rechnen muss. `null`, solange
 * Protein/Kohlenhydrate/Fett nicht alle vorhanden sind — reine Anzeige,
 * nie persistiert, keine Bewertung (kein Bezug zu KCAL_DEVIATION_THRESHOLD).
 */
export function computeKcalFromMacros(
  nutrition: Pick<NutritionMaybeNull, 'proteinG100g' | 'carbsG100g' | 'fatG100g'>,
): number | null {
  if (
    nutrition.proteinG100g === null ||
    nutrition.carbsG100g === null ||
    nutrition.fatG100g === null
  ) {
    return null;
  }
  return round1(
    nutrition.proteinG100g * ATWATER_PROTEIN_KCAL_PER_G +
      nutrition.carbsG100g * ATWATER_CARBS_KCAL_PER_G +
      nutrition.fatG100g * ATWATER_FAT_KCAL_PER_G,
  );
}

export type PlausibilityFindingKind = 'incomplete' | 'macro-sum-exceeded' | 'kcal-deviation';

export interface PlausibilityFinding {
  readonly kind: PlausibilityFindingKind;
  /** Fertiger deutscher Text mit den konkreten Zahlen (Banner der Detailansicht, design-conventions.md). */
  readonly message: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Liefert ALLE zutreffenden Befunde (design-conventions.md „Anzeige in der
 * Detailansicht"), nicht nur den priorisierten. Reihenfolge der Prüfungen
 * ist Teil der Entscheidung (ADR-0011 Punkt 4): Die Makrosummen-Prüfung
 * läuft immer über die vorhandenen Werte (auch bei fehlendem Wert); die
 * kcal-Abweichungsprüfung läuft NUR bei allen vier vorhandenen Werten und
 * wird sonst nicht ausgeführt (kein Falsch-Befund aus einer 0-Annahme).
 * „Unvollständig" gilt unabhängig davon, sobald mindestens ein Pflichtwert
 * fehlt.
 */
export function findPlausibilityFindings(nutrition: NutritionMaybeNull): PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];

  if (isNutritionIncomplete(nutrition)) {
    findings.push({
      kind: 'incomplete',
      message:
        'Nicht alle Pflichtwerte (Kalorien, Protein, Kohlenhydrate, Fett je 100 g) sind ausgefüllt.',
    });
  }

  const macroSum =
    (nutrition.proteinG100g ?? 0) + (nutrition.carbsG100g ?? 0) + (nutrition.fatG100g ?? 0);
  if (macroSum > MACRO_SUM_MAX_G_PER_100G) {
    findings.push({
      kind: 'macro-sum-exceeded',
      message: `Summe der Makronährstoffe ${round1(macroSum)} g liegt über 100 g je 100 g.`,
    });
  }

  if (
    nutrition.kcal100g !== null &&
    nutrition.proteinG100g !== null &&
    nutrition.carbsG100g !== null &&
    nutrition.fatG100g !== null
  ) {
    const computedKcal =
      nutrition.proteinG100g * ATWATER_PROTEIN_KCAL_PER_G +
      nutrition.carbsG100g * ATWATER_CARBS_KCAL_PER_G +
      nutrition.fatG100g * ATWATER_FAT_KCAL_PER_G;

    // computedKcal === 0 (alle Makros 0) macht eine relative Abweichung
    // nicht definierbar — bewusst kein Befund, statt Division durch 0.
    if (computedKcal > 0) {
      const deviation = Math.abs(nutrition.kcal100g - computedKcal) / computedKcal;
      if (deviation > KCAL_DEVIATION_THRESHOLD) {
        const direction = nutrition.kcal100g > computedKcal ? 'mehr' : 'weniger';
        findings.push({
          kind: 'kcal-deviation',
          message:
            `Angegebene Energie ${round1(nutrition.kcal100g)} kcal weicht ` +
            `${Math.round(deviation * 100)}% (${direction}) von berechneten ${round1(computedKcal)} kcal ab.`,
        });
      }
    }
  }

  return findings;
}

/** Genau ein Marker für Einzel-Slot-Kontexte (Suchtrefferliste, Step B, M2/M3): „unplausibel" hat Vorrang vor „unvollständig" (design-conventions.md). */
export type PlausibilityMarker = { readonly kind: 'implausible' | 'incomplete' } | null;

export function resolvePlausibilityMarker(nutrition: NutritionMaybeNull): PlausibilityMarker {
  const findings = findPlausibilityFindings(nutrition);
  if (findings.some((finding) => finding.kind !== 'incomplete')) {
    return { kind: 'implausible' };
  }
  if (findings.some((finding) => finding.kind === 'incomplete')) {
    return { kind: 'incomplete' };
  }
  return null;
}

/** Screenreader-Text vor dem Food-Namen (design-conventions.md): benennt nur den angezeigten, priorisierten Status. */
export function plausibilityMarkerStatusText(marker: NonNullable<PlausibilityMarker>): string {
  return marker.kind === 'implausible' ? 'Nährwerte unplausibel' : 'Nährwerte unvollständig';
}
