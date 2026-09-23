/**
 * Reine Rechenlogik des Gewichtslogs und Kalorienziel-Vorschlags — ohne DI,
 * ohne Angular-Import, ohne UI-Wissen (code-conventions.md „Wo was
 * hingehört"). `weight.store.ts` ruft diese Funktionen ausschließlich in
 * `computed` auf.
 *
 * ## Die Rechenregel (ADR-0017 Punkt 3, Rechenregel-Teil abgelöst durch
 * ADR-0018 Punkt 3 — **Faustregel, kein medizinischer Rat**)
 *
 * Berechnet wird der Kalorienwert, der zum **gesetzten Zielgewicht** führt
 * (nicht mehr nur der Erhaltungsbedarf wie in der ursprünglichen ADR-0017-
 * Fassung). Vier Schritte:
 *
 * 1. **Erhaltungsbedarf (Basis)**: `maintenanceKcal = avgIntakeKcal −
 *    slopeKgPerDay × KCAL_PER_KG_BODY_WEIGHT`. `slopeKgPerDay` ist die
 *    Steigung einer linearen Regression (Least Squares) von `weight_kg`
 *    über den Tagesabstand zum ältesten Punkt im Fenster der letzten
 *    `WEIGHT_TREND_WINDOW_DAYS` Tage (bewusst Regression statt „erster
 *    gegen letzter Wert" — eine einzelne Tagesschwankung verschiebt sonst
 *    den ganzen Vorschlag). `avgIntakeKcal` ist der Mittelwert der
 *    Tages-kcal über die Tage **mit** Einträgen im selben Fenster (Nenner =
 *    erfasste Tage, nicht die Fenstergröße — ein nicht erfasster Tag ist
 *    eine Lücke, kein Nulltag, gleiche Semantik wie `countsForAverage` in
 *    `stats.calculations.ts`). `KCAL_PER_KG_BODY_WEIGHT = 7700` ist die
 *    Wishnofsky-Faustregel.
 * 2. **Zielrate**: `delta = targetWeightKg − currentWeightKg` (das
 *    **letzte gemessene** Gewicht, nicht der auf heute fortgeschriebene
 *    Regressionswert — Kartentext und Formel müssen dieselbe Zahl
 *    benutzen). `|delta| <= GOAL_WEIGHT_TOLERANCE_KG (0,5)` ist der
 *    **Halten-Fall** (`targetRateKgPerDay = 0`). Sonst ist das Vorzeichen
 *    der Zielrate das Vorzeichen von `delta`, gedeckelt auf höchstens
 *    `MAX_WEEKLY_LOSS_KG (0,5)` kg/Woche Abnahme bzw.
 *    `MAX_WEEKLY_GAIN_KG (0,25)` kg/Woche Zunahme (asymmetrische
 *    Nutzerfestlegung, keine Ableitung).
 * 3. **Vorschlag**: `rawKcal = maintenanceKcal + targetRateKgPerDay ×
 *    KCAL_PER_KG_BODY_WEIGHT`, gerundet auf volle 10 kcal. Zusammengezogen:
 *    `suggestedKcal ≈ avgIntakeKcal − (slopeKgPerDay − targetRateKgPerDay) ×
 *    7700` — korrigiert wird die **Differenz zwischen beobachtetem und
 *    gewünschtem Trend**, nicht der gewünschte Trend allein. Ohne diese
 *    Trendkorrektur würde ein Nutzer, der sein Ziel bereits im gewünschten
 *    Tempo verfolgt, bei jeder Übernahme erneut ein Defizit aufgeschlagen
 *    bekommen (Aufschaukel-Effekt, siehe ADR-0018 Testtabelle Zeile 3).
 * 4. **Plausibilitätsgrenze**: liegt `suggestedKcal` außerhalb
 *    `SUGGESTION_MIN_KCAL … SUGGESTION_MAX_KCAL` (1200–6000), wird **kein**
 *    Vorschlag gezeigt.
 *
 * **Mindestdatenlage** (vor der Berechnung geprüft, jede Bedingung
 * einzeln): mindestens `MIN_MEASUREMENTS` (3) Messungen im
 * `WEIGHT_TREND_WINDOW_DAYS`-Fenster (28 Tage) · Spanne zwischen ältester
 * und jüngster Messung im Fenster mindestens `MIN_MEASUREMENT_SPAN_DAYS`
 * (14) Tage · jüngste Messung **überhaupt** höchstens
 * `MAX_MEASUREMENT_AGE_DAYS` (28) Tage alt · mindestens `MIN_INTAKE_DAYS`
 * (14) Tage mit mindestens einem `entries`-Datensatz im Fenster.
 *
 * **Zustands-Priorität** (`computeCalorieSuggestion`, deckungsgleich mit
 * design-conventions.md „Zustands-Priorität der Vorschlagskarte"): keine
 * Gewichtseinträge → kein Zielgewicht → Mindestdatenlage/Plausibilität
 * verletzt → Vorschlag (ggf. Halten-Fall). Ohne gesetztes Zielgewicht gibt
 * es **keinen** Vorschlag, unabhängig von der Messpunktanzahl (ADR-0018
 * Punkt 4).
 *
 * Das Liniendiagramm zeigt ein **eigenes**, längeres Fenster
 * (`WEIGHT_CHART_WINDOW_DAYS`, 90 Tage) — bewusst nicht identisch mit dem
 * 28-Tage-Trendfenster: das Diagramm zeigt den Verlauf, die Regel wertet
 * den aktuellen Trend aus (ADR-0017 Punkt 7).
 */

import { addDaysToKey, diffInDays } from '../core/date.calculations';
import type { WeightLogEntry } from '../core/weight-logs.service';
import type { CalorieSuggestionResult, IntakeDay } from './models/weight.model';

// --- Fenster ---------------------------------------------------------------

/** Trend-/Mindestdatenlage-Fenster der Rechenregel (ADR-0017 Punkt 3). */
export const WEIGHT_TREND_WINDOW_DAYS = 28;
/** Darstellungsfenster des Liniendiagramms (ADR-0017 Punkt 7) — bewusst länger als das Trendfenster. */
export const WEIGHT_CHART_WINDOW_DAYS = 90;

// --- Mindestdatenlage --------------------------------------------------------

export const MIN_MEASUREMENTS = 3;
export const MIN_MEASUREMENT_SPAN_DAYS = 14;
export const MAX_MEASUREMENT_AGE_DAYS = 28;
export const MIN_INTAKE_DAYS = 14;

// --- Rechenregel-Konstanten (ADR-0018 Punkt 3) -----------------------------

/** Wishnofsky-Faustregel: kcal je kg Körpergewicht. */
export const KCAL_PER_KG_BODY_WEIGHT = 7700;
/** Toleranz um das Zielgewicht, innerhalb derer der Halten-Fall gilt. */
export const GOAL_WEIGHT_TOLERANCE_KG = 0.5;
/** Obergrenze der Zielrate bei Abnahme (kg/Woche). */
export const MAX_WEEKLY_LOSS_KG = 0.5;
/** Obergrenze der Zielrate bei Zunahme (kg/Woche) — bewusst asymmetrisch zur Abnahme. */
export const MAX_WEEKLY_GAIN_KG = 0.25;
/** Plausibilitätsgrenze des Vorschlags (ADR-0017 Punkt 3 Konsequenzen, ADR-0018 Schritt 4). */
export const SUGGESTION_MIN_KCAL = 1200;
export const SUGGESTION_MAX_KCAL = 6000;

// --- Trend (lineare Regression) ---------------------------------------------

function sortByDateKeyAsc<T extends { dateKey: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
}

/**
 * Steigung (kg/Tag) einer linearen Regression (Least Squares) von
 * `weightKg` über den Tagesabstand zum ältesten Punkt. Liefert `0` bei
 * weniger als zwei Punkten oder wenn alle Punkte denselben Tag haben
 * (Division durch 0 vermieden) — beides tritt nach erfüllter
 * Mindestdatenlage praktisch nicht auf, die Funktion bleibt trotzdem
 * defensiv für sich genommen testbar.
 */
export function computeWeightTrendSlope(measurements: readonly WeightLogEntry[]): number {
  if (measurements.length < 2) return 0;

  const sorted = sortByDateKeyAsc(measurements);
  const oldestKey = sorted[0].dateKey;
  const xs = sorted.map((m) => diffInDays(oldestKey, m.dateKey));
  const ys = sorted.map((m) => m.weightKg);
  const n = xs.length;

  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

// --- Rechenregel-Formel (ADR-0018 Punkt 3, Schritte 1–4) --------------------

export interface CalorieSuggestionFormulaInput {
  readonly avgIntakeKcal: number;
  readonly slopeKgPerDay: number;
  readonly currentWeightKg: number;
  readonly targetWeightKg: number;
}

export interface CalorieSuggestionFormulaResult {
  readonly maintenanceKcal: number;
  readonly suggestedKcal: number;
  readonly holding: boolean;
  /** `false` = Plausibilitätsgrenze verletzt, kein Vorschlag anzeigen (Schritt 4). */
  readonly withinPlausibleRange: boolean;
}

/**
 * Reine Formel-Implementierung der Schritte 1–4 aus ADR-0018 Punkt 3 —
 * unabhängig von Regression/Mindestdatenlage testbar (Vorzeichen-/
 * Begrenzungs-/Halten-Fall-Tests der Testtabelle in ADR-0018).
 */
export function computeCalorieSuggestionFormula(
  input: CalorieSuggestionFormulaInput,
): CalorieSuggestionFormulaResult {
  const { avgIntakeKcal, slopeKgPerDay, currentWeightKg, targetWeightKg } = input;

  // Schritt 1 — Erhaltungsbedarf (Basis).
  const maintenanceKcal = avgIntakeKcal - slopeKgPerDay * KCAL_PER_KG_BODY_WEIGHT;

  // Schritt 2 — Zielrate.
  const delta = targetWeightKg - currentWeightKg;
  let targetRateKgPerDay: number;
  let holding: boolean;
  if (Math.abs(delta) <= GOAL_WEIGHT_TOLERANCE_KG) {
    targetRateKgPerDay = 0;
    holding = true;
  } else if (delta < 0) {
    targetRateKgPerDay = -Math.min(MAX_WEEKLY_LOSS_KG, Math.abs(delta)) / 7;
    holding = false;
  } else {
    targetRateKgPerDay = Math.min(MAX_WEEKLY_GAIN_KG, Math.abs(delta)) / 7;
    holding = false;
  }

  // Schritt 3 — Vorschlag.
  const rawKcal = maintenanceKcal + targetRateKgPerDay * KCAL_PER_KG_BODY_WEIGHT;
  const suggestedKcal = Math.round(rawKcal / 10) * 10;

  // Schritt 4 — Plausibilitätsgrenze.
  const withinPlausibleRange =
    suggestedKcal >= SUGGESTION_MIN_KCAL && suggestedKcal <= SUGGESTION_MAX_KCAL;

  return { maintenanceKcal, suggestedKcal, holding, withinPlausibleRange };
}

// --- Mindestdatenlage --------------------------------------------------------

export interface DataSufficiencyInput {
  readonly measurementsInWindow: readonly WeightLogEntry[];
  readonly latestMeasurementDateKey: string;
  readonly intakeDaysInWindowCount: number;
  readonly referenceDateKey: string;
}

/** Prüft die vier Mindestdatenlage-Bedingungen aus ADR-0017 Punkt 3 einzeln, verknüpft mit UND. */
export function hasSufficientData(input: DataSufficiencyInput): boolean {
  const {
    measurementsInWindow,
    latestMeasurementDateKey,
    intakeDaysInWindowCount,
    referenceDateKey,
  } = input;

  if (measurementsInWindow.length < MIN_MEASUREMENTS) return false;

  const sorted = sortByDateKeyAsc(measurementsInWindow);
  const spanDays = diffInDays(sorted[0].dateKey, sorted[sorted.length - 1].dateKey);
  if (spanDays < MIN_MEASUREMENT_SPAN_DAYS) return false;

  const ageDays = diffInDays(latestMeasurementDateKey, referenceDateKey);
  if (ageDays > MAX_MEASUREMENT_AGE_DAYS) return false;

  if (intakeDaysInWindowCount < MIN_INTAKE_DAYS) return false;

  return true;
}

// --- Gesamt-Pipeline: Zustands-Priorität ------------------------------------

export interface ComputeCalorieSuggestionInput {
  /** **Alle** vorhandenen Messungen (nicht nur das Trendfenster) — für „keine Einträge" und „jüngste Messung überhaupt". */
  readonly measurements: readonly WeightLogEntry[];
  /** Tages-kcal-Summen der Ist-Zufuhr, bereits auf das `WEIGHT_TREND_WINDOW_DAYS`-Fenster eingegrenzt oder darüber hinausgehend (wird hier zusätzlich gefiltert). */
  readonly intakeDays: readonly IntakeDay[];
  readonly targetWeightKg: number | null;
  readonly referenceDateKey: string;
}

/**
 * Zustandsmaschine der Vorschlagskarte (ADR-0018 Punkt 4,
 * design-conventions.md „Zustands-Priorität der Vorschlagskarte") — erste
 * zutreffende Bedingung gewinnt. Liefert einen Summentyp, keine Zahl mit
 * Sonderwerten; die Komponente trifft keine dieser Fallunterscheidungen
 * selbst.
 */
export function computeCalorieSuggestion(
  input: ComputeCalorieSuggestionInput,
): CalorieSuggestionResult {
  const { measurements, intakeDays, targetWeightKg, referenceDateKey } = input;

  if (measurements.length === 0) return 'no-entries';
  if (targetWeightKg === null) return 'no-target';

  const windowStartKey = addDaysToKey(referenceDateKey, -(WEIGHT_TREND_WINDOW_DAYS - 1));
  const measurementsInWindow = measurements.filter(
    (m) => m.dateKey >= windowStartKey && m.dateKey <= referenceDateKey,
  );
  const intakeDaysInWindow = intakeDays.filter(
    (d) => d.dateKey >= windowStartKey && d.dateKey <= referenceDateKey,
  );

  const latestMeasurement = sortByDateKeyAsc(measurements)[measurements.length - 1];

  const sufficientData = hasSufficientData({
    measurementsInWindow,
    latestMeasurementDateKey: latestMeasurement.dateKey,
    intakeDaysInWindowCount: intakeDaysInWindow.length,
    referenceDateKey,
  });
  if (!sufficientData) return 'insufficient';

  const slopeKgPerDay = computeWeightTrendSlope(measurementsInWindow);
  const avgIntakeKcal =
    intakeDaysInWindow.reduce((sum, day) => sum + day.kcal, 0) / intakeDaysInWindow.length;

  const formula = computeCalorieSuggestionFormula({
    avgIntakeKcal,
    slopeKgPerDay,
    currentWeightKg: latestMeasurement.weightKg,
    targetWeightKg,
  });

  if (!formula.withinPlausibleRange) return 'insufficient';

  return { kind: 'suggestion', kcal: formula.suggestedKcal, holding: formula.holding };
}

// --- Liniendiagramm (ADR-0017 Punkt 7) ---------------------------------------

export interface WeightChartSegment {
  readonly fromIndex: number;
  readonly toIndex: number;
  /** `true`: mindestens ein Tag ohne Eintrag zwischen den beiden Punkten — gestrichelt, nicht interpoliert. */
  readonly hasGap: boolean;
}

/** Gewichtsmessungen innerhalb des 90-Tage-Diagrammfensters, aufsteigend nach Datum. */
export function filterWeightChartWindow(
  measurements: readonly WeightLogEntry[],
  referenceDateKey: string,
): WeightLogEntry[] {
  const startKey = addDaysToKey(referenceDateKey, -(WEIGHT_CHART_WINDOW_DAYS - 1));
  return sortByDateKeyAsc(
    measurements.filter((m) => m.dateKey >= startKey && m.dateKey <= referenceDateKey),
  );
}

/** Verbindungssegmente zwischen aufeinanderfolgenden Diagrammpunkten, je mit Lücken-Markierung. */
export function buildWeightChartSegments(points: readonly WeightLogEntry[]): WeightChartSegment[] {
  const segments: WeightChartSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const hasGap = diffInDays(points[i].dateKey, points[i + 1].dateKey) > 1;
    segments.push({ fromIndex: i, toIndex: i + 1, hasGap });
  }
  return segments;
}

export interface WeightChartYDomain {
  readonly min: number;
  readonly max: number;
}

/**
 * Y-Wertebereich des Diagramms ohne feste Skala (design-conventions.md
 * „Liniendiagramm": „Y-Achse ohne feste Skala/Gitter"), mit kleinem
 * Puffer, damit Punkte am Rand nicht am Diagrammrand kleben. Bei einem
 * einzigen Punkt oder identischen Werten wird ein Mindestbereich von 1 kg
 * erzwungen, um eine Division durch 0 bei der Positionierung auszuschließen.
 */
export function computeWeightChartYDomain(points: readonly WeightLogEntry[]): WeightChartYDomain {
  if (points.length === 0) return { min: 0, max: 1 };

  const weights = points.map((p) => p.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);

  if (min === max) {
    return { min: min - 0.5, max: max + 0.5 };
  }

  const padding = (max - min) * 0.1;
  return { min: min - padding, max: max + padding };
}
