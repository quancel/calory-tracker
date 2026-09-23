/**
 * Reine Rechenlogik, die nur `food-catalog` nutzt — ohne DI, ohne
 * Angular-Import, ohne UI-Wissen (code-conventions.md „Wo was hingehört").
 * Rechenlogik mit einem zweiten Nutzer (`meals`) liegt seit Paket 010 in
 * `core/foods.calculations.ts` (ADR-0012 Punkt 2): `filterFoodsByQuery`,
 * `parseDecimal`, `validateNameField`, `validateAmountField`,
 * `resolveDefaultAmount`, `computeLiveNutrition`,
 * `isNutritionIncomplete`, `findPlausibilityFindings`,
 * `resolvePlausibilityMarker`, `plausibilityMarkerStatusText`.
 */

import { MEAL_TYPE_ORDER, type MealType } from '../core/meal-type.constants';
import {
  type NutritionMaybeNull,
  type TextFieldValidation,
  parseDecimal,
  validateNameField,
} from '../core/foods.calculations';
import type { Food } from '../core/foods.service';
import type { CreateFoodInput } from './models/food.model';

export type { TextFieldValidation };
export type NumberFieldValidation =
  { valid: true; value: number } | { valid: false; error: string };
export type OptionalPositiveValidation =
  { valid: true; value: number | null } | { valid: false; error: string };

/** Pflichtfeld je 100g (Kalorien/Protein/Kohlenhydrate/Fett): Zahl >= 0. */
export function validateNutrientField(label: string, raw: string): NumberFieldValidation {
  if (raw.trim() === '') {
    return { valid: false, error: `Bitte einen Wert für ${label} eingeben.` };
  }
  const value = parseDecimal(raw);
  if (value === null) {
    return { valid: false, error: 'Bitte eine gültige Zahl eingeben.' };
  }
  if (value < 0) {
    return { valid: false, error: `${label} darf nicht negativ sein.` };
  }
  return { valid: true, value };
}

/** Standardportion (ADR-0008 Punkt 5): optional — leer bleibt `null`, ausgefüllt muss `> 0` sein. */
export function validateDefaultPortionField(raw: string): OptionalPositiveValidation {
  if (raw.trim() === '') {
    return { valid: true, value: null };
  }
  const value = parseDecimal(raw);
  if (value === null) {
    return { valid: false, error: 'Bitte eine gültige Zahl eingeben.' };
  }
  if (value <= 0) {
    return { valid: false, error: 'Standardportion muss größer als 0 sein, falls angegeben.' };
  }
  return { valid: true, value };
}

export interface CreateFoodFormValues {
  name: string;
  kcal100g: string;
  proteinG100g: string;
  carbsG100g: string;
  fatG100g: string;
  defaultPortionG: string;
  /** Vorbelegt aus einem Scan (ADR-0010 Punkt 5); sonst leer. Kein eigenes Formularfeld, nur Anzeige. */
  barcode: string;
}

export interface CreateFoodValidation {
  readonly name: TextFieldValidation;
  readonly kcal100g: NumberFieldValidation;
  readonly proteinG100g: NumberFieldValidation;
  readonly carbsG100g: NumberFieldValidation;
  readonly fatG100g: NumberFieldValidation;
  readonly defaultPortionG: OptionalPositiveValidation;
  /** Geparste, gültige Eingabe — nur gesetzt, wenn ALLE Felder gültig sind. */
  readonly value: CreateFoodInput | null;
}

/**
 * Validiert das gesamte Step-A2-Formular. Jedes Feld liefert seinen eigenen
 * Zustand (für Inline-Fehlermeldungen je Feld, design-conventions.md
 * „Formulare"); `value` ist nur gesetzt, wenn alle sechs Felder gültig sind
 * (steuert den Submit-Button „Anlegen").
 */
export function validateCreateFoodForm(values: CreateFoodFormValues): CreateFoodValidation {
  const name = validateNameField(values.name);
  const kcal100g = validateNutrientField('Kalorien', values.kcal100g);
  const proteinG100g = validateNutrientField('Protein', values.proteinG100g);
  const carbsG100g = validateNutrientField('Kohlenhydrate', values.carbsG100g);
  const fatG100g = validateNutrientField('Fett', values.fatG100g);
  const defaultPortionG = validateDefaultPortionField(values.defaultPortionG);

  let value: CreateFoodInput | null = null;
  if (
    name.valid &&
    kcal100g.valid &&
    proteinG100g.valid &&
    carbsG100g.valid &&
    fatG100g.valid &&
    defaultPortionG.valid
  ) {
    value = {
      name: name.value,
      kcal100g: kcal100g.value,
      proteinG100g: proteinG100g.value,
      carbsG100g: carbsG100g.value,
      fatG100g: fatG100g.value,
      defaultPortionG: defaultPortionG.value,
      barcode: values.barcode.trim() === '' ? null : values.barcode.trim(),
    };
  }

  return { name, kcal100g, proteinG100g, carbsG100g, fatG100g, defaultPortionG, value };
}

/** Fehlender/ungültiger `mealType`-Query-Parameter fällt defensiv auf `'snack'` zurück (ADR-0009 Punkt 6/7). */
export function normalizeMealType(raw: string | null): MealType {
  return (MEAL_TYPE_ORDER as readonly string[]).includes(raw ?? '') ? (raw as MealType) : 'snack';
}

/**
 * Rohform eines Open-Food-Facts-Produkts, wie `food-search.off.service.ts`
 * sie liefert (siehe dort `OffRawProduct`). Hier ohne Import aus der
 * Dienstdatei definiert (gleiche Duplikation wie `core/entries.service.ts`
 * ggü. `Food`) — reine Rechenlogik bleibt ohne Kenntnis vom Netzwerkzugriff.
 */
export interface OffProductRaw {
  product_name?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    energy_100g?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
}

export interface OffNormalizedProduct {
  name: string;
  barcode: string;
  kcal100g: number | null;
  proteinG100g: number | null;
  carbsG100g: number | null;
  fatG100g: number | null;
}

const KJ_PER_KCAL = 4.184;

/**
 * Reine Umrechnung einer OFF-Antwort auf 100g-Werte (ADR-0010 Punkt 3):
 * kJ→kcal nur als Fallback, wenn `energy-kcal_100g` fehlt. Fehlende oder
 * negative Felder bleiben `null` — nie `0`, nie geschätzt (ADR-0010 Punkt 5).
 */
export function normalizeOffProduct(raw: OffProductRaw, barcode: string): OffNormalizedProduct {
  const nutriments = raw.nutriments ?? {};
  const kcalFromKj =
    nutriments.energy_100g !== undefined ? nutriments.energy_100g / KJ_PER_KCAL : undefined;

  return {
    name: (raw.product_name ?? '').trim(),
    barcode,
    kcal100g: toRoundedOrNull(nutriments['energy-kcal_100g'] ?? kcalFromKj),
    proteinG100g: toRoundedOrNull(nutriments.proteins_100g),
    carbsG100g: toRoundedOrNull(nutriments.carbohydrates_100g),
    fatG100g: toRoundedOrNull(nutriments.fat_100g),
  };
}

function toRoundedOrNull(value: number | undefined): number | null {
  if (value === undefined || Number.isNaN(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

/** Vollständig heißt: Name + alle vier Nährwerte vorhanden (ADR-0010 Punkt 5) — nur dann automatisch speicherbar. */
export function isOffProductComplete(
  product: OffNormalizedProduct,
): product is OffNormalizedProduct & {
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
} {
  return (
    product.name !== '' &&
    product.kcal100g !== null &&
    product.proteinG100g !== null &&
    product.carbsG100g !== null &&
    product.fatG100g !== null
  );
}

/**
 * Wandelt einen unvollständigen OFF-Treffer in Step-A2-Formularwerte:
 * vorhandene Felder als String, fehlende bleiben leer — NIE `0`
 * (ADR-0010 Punkt 5, Akzeptanz „fehlende OFF-Nährwerte bleiben leer").
 */
export function offProductToCreateForm(product: OffNormalizedProduct): CreateFoodFormValues {
  return {
    name: product.name,
    kcal100g: product.kcal100g !== null ? `${product.kcal100g}` : '',
    proteinG100g: product.proteinG100g !== null ? `${product.proteinG100g}` : '',
    carbsG100g: product.carbsG100g !== null ? `${product.carbsG100g}` : '',
    fatG100g: product.fatG100g !== null ? `${product.fatG100g}` : '',
    defaultPortionG: '',
    barcode: product.barcode,
  };
}

/** Vorbelegung von Step C (Korrektur, ADR-0011 Punkt 6) mit den Ist-Werten eines Foods — gleiche Form wie Step A2, reine Anzeige des Barcodes. */
export function foodToCorrectFormValues(
  food: Pick<
    Food,
    'name' | 'kcal100g' | 'proteinG100g' | 'carbsG100g' | 'fatG100g' | 'defaultPortionG' | 'barcode'
  >,
): CreateFoodFormValues {
  return {
    name: food.name,
    kcal100g: `${food.kcal100g}`,
    proteinG100g: `${food.proteinG100g}`,
    carbsG100g: `${food.carbsG100g}`,
    fatG100g: `${food.fatG100g}`,
    defaultPortionG: food.defaultPortionG !== null ? `${food.defaultPortionG}` : '',
    barcode: food.barcode ?? '',
  };
}

/** Wandelt die vier Nährwertfelder eines Formular-Entwurfs (Step A2/Step C, String-Eingaben) in die nullable-tolerante Prüfform — ungültige/leere Eingaben zählen als fehlend. */
export function nutritionDraftFromFormValues(
  values: Pick<CreateFoodFormValues, 'kcal100g' | 'proteinG100g' | 'carbsG100g' | 'fatG100g'>,
): NutritionMaybeNull {
  return {
    kcal100g: parseDecimal(values.kcal100g),
    proteinG100g: parseDecimal(values.proteinG100g),
    carbsG100g: parseDecimal(values.carbsG100g),
    fatG100g: parseDecimal(values.fatG100g),
  };
}

export type CameraErrorReason = 'permission' | 'unavailable' | 'unsupported';

/** Deutscher Hinweistext je Kamera-Fehlerursache (design-conventions.md „Fehler-Panels"). */
export function cameraErrorMessage(reason: CameraErrorReason): string {
  switch (reason) {
    case 'permission':
      return 'Kamera-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Browsereinstellungen.';
    case 'unavailable':
      return 'Kamera konnte nicht gestartet werden.';
    case 'unsupported':
      return 'Barcode-Scan wird auf diesem Gerät nicht unterstützt.';
  }
}
