/**
 * Reine Rechenlogik der Ziele-Ansicht — ohne DI, ohne Angular-Import, ohne
 * UI-Wissen (siehe code-conventions.md „Wo was hingehört"). `goals.store.ts`
 * ruft `validateGoalField` beim Tippen/Blur und vor dem Speichern auf.
 *
 * Wertebereiche sind bewusste Doppelung zu den `check`-Constraints der
 * Migration (ADR-0007 Punkt 2/Konsequenzen): Client-Rückmeldung vor dem
 * Roundtrip, Datenbank als eigentliche Garantie. Ändert sich ein Grenzwert,
 * sind beide Stellen zu pflegen.
 */

import type { GoalFieldKey } from './models/goal.model';

export interface GoalFieldConfig {
  readonly key: GoalFieldKey;
  /** Anzeigename für Label und Fehlertexte, z. B. „Kalorien". */
  readonly label: string;
  readonly unit: 'kcal' | 'g' | 'kg';
  /** Spaltenname in `goals` (snake_case), für den Upsert-Payload. */
  readonly column: 'kcal' | 'carbs_g' | 'protein_g' | 'fat_g' | 'target_weight_kg';
  readonly min: number;
  /** `true`: `min` selbst ist ungültig (kcal `> 0`). `false`: `min` ist gültig (Makros `>= 0`, „Ziel entfernen"). */
  readonly minExclusive: boolean;
  readonly max: number;
  /**
   * `true`: ein leeres Feld ist gültig (`value: null`) — nur das Zielgewicht
   * (ADR-0018 Punkt 2, design-conventions.md „Zielgewicht-Feldblock": „ein
   * leeres Feld ist gültig, keine Fehlermarkierung"). Die vier
   * kcal-/Makro-Felder bleiben Pflichtfelder (ADR-0007).
   */
  readonly optional: boolean;
  /** Höchstens erlaubte Nachkommastellen, z. B. `1` beim Zielgewicht (20,0–400,0 kg). `undefined` = keine Begrenzung. */
  readonly maxDecimalPlaces?: number;
}

/** Feste Reihenfolge und Grenzwerte je Feld (ADR-0007, Wertebereiche der Migration `20260921090000_goals_defaults_checks.sql`). */
export const GOAL_FIELD_CONFIG: readonly GoalFieldConfig[] = [
  {
    key: 'kcal',
    label: 'Kalorien',
    unit: 'kcal',
    column: 'kcal',
    min: 0,
    minExclusive: true,
    max: 10000,
    optional: false,
  },
  {
    key: 'carbsG',
    label: 'Kohlenhydrate',
    unit: 'g',
    column: 'carbs_g',
    min: 0,
    minExclusive: false,
    max: 1000,
    optional: false,
  },
  {
    key: 'proteinG',
    label: 'Protein',
    unit: 'g',
    column: 'protein_g',
    min: 0,
    minExclusive: false,
    max: 1000,
    optional: false,
  },
  {
    key: 'fatG',
    label: 'Fett',
    unit: 'g',
    column: 'fat_g',
    min: 0,
    minExclusive: false,
    max: 1000,
    optional: false,
  },
  {
    key: 'targetWeightKg',
    // "Gewicht" statt "Zielgewicht": GoalFieldComponent rendert das Label
    // immer als "{label}-Ziel ({unit})" (siehe goal-field.component.html) —
    // "Zielgewicht-Ziel" wäre redundant, "Gewicht-Ziel (kg)" liest sich wie
    // die drei bestehenden Felder.
    label: 'Gewicht',
    unit: 'kg',
    column: 'target_weight_kg',
    min: 20,
    minExclusive: false,
    max: 400,
    optional: true,
    maxDecimalPlaces: 1,
  },
];

export function goalFieldConfig(key: GoalFieldKey): GoalFieldConfig {
  const config = GOAL_FIELD_CONFIG.find((entry) => entry.key === key);
  if (!config) {
    throw new Error(`Unbekanntes Zielfeld: ${key}`);
  }
  return config;
}

export type GoalFieldValidation =
  | { valid: true; value: number | null }
  | { valid: false; error: string };

/**
 * Normalisiert eine Rohtext-Eingabe auf ein Dezimaltrennzeichen (`,` → `.`,
 * deutsche Eingabegewohnheit bei `inputmode="decimal"`). Liefert `null` bei
 * leerer Eingabe oder wenn die Eingabe keine reine Zahl ist (kein
 * Whitespace, kein zusätzliches Zeichen).
 */
function normalizeGoalNumber(raw: string): string | null {
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
 * Parst eine Eingabe als Zahl. Akzeptiert `,` als Dezimaltrennzeichen
 * (deutsche Eingabegewohnheit bei `inputmode="decimal"`) zusätzlich zu `.`.
 * Liefert `null` bei leerer Eingabe oder wenn die Eingabe keine reine Zahl
 * ist (kein Whitespace, kein zusätzliches Zeichen).
 */
export function parseGoalNumber(raw: string): number | null {
  const normalized = normalizeGoalNumber(raw);
  return normalized === null ? null : Number(normalized);
}

/**
 * Validiert die Rohtext-Eingabe eines Zielfelds gegen dessen Wertebereich.
 * Leer/nicht-numerisch/negativ (bzw. `<= 0` bei kcal) werden mit einem
 * deutschen Hinweistext abgelehnt. `0` ist für die drei Makros ein gültiger
 * Wert und bedeutet „Ziel entfernen" (ADR-0007) — kein Fehler.
 *
 * Beim **optionalen** Zielgewicht (ADR-0018 Punkt 2, `config.optional`) ist
 * eine leere Eingabe dagegen gültig und liefert `value: null` — „ein leeres
 * Feld ist gültig, keine Fehlermarkierung", entfernt bei Speicherung den
 * gesetzten Zielwert (design-conventions.md „Zielgewicht-Feldblock").
 */
export function validateGoalField(key: GoalFieldKey, raw: string): GoalFieldValidation {
  const config = goalFieldConfig(key);
  const trimmed = raw.trim();

  if (trimmed === '') {
    if (config.optional) {
      return { valid: true, value: null };
    }
    return { valid: false, error: 'Bitte einen Wert eingeben.' };
  }

  const normalized = normalizeGoalNumber(trimmed);
  if (normalized === null) {
    return { valid: false, error: 'Bitte eine gültige Zahl eingeben.' };
  }

  if (
    config.maxDecimalPlaces !== undefined &&
    countDecimalPlaces(normalized) > config.maxDecimalPlaces
  ) {
    return {
      valid: false,
      error: `${config.label} darf höchstens ${config.maxDecimalPlaces} Nachkommastelle${config.maxDecimalPlaces === 1 ? '' : 'n'} haben.`,
    };
  }

  const value = Number(normalized);

  const belowMin = config.minExclusive ? value <= config.min : value < config.min;
  if (belowMin) {
    return {
      valid: false,
      error: config.minExclusive
        ? `${config.label}-Ziel muss größer als ${config.min} ${config.unit} sein.`
        : config.min === 0
          ? `${config.label}-Ziel darf nicht negativ sein.`
          : `${config.label} muss mindestens ${config.min} ${config.unit} betragen.`,
    };
  }

  if (value > config.max) {
    return {
      valid: false,
      error: `${config.label}-Ziel darf höchstens ${config.max} ${config.unit} betragen.`,
    };
  }

  return { valid: true, value };
}
