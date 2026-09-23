/**
 * Domänenmodelle der Ziele-Ansicht (siehe ADR-0007). Reine Typen, kein
 * Angular-Import. Bewusst eigenständig von `diary/models/diary.model.ts`
 * (`DiaryGoal`) — kein Feature importiert aus einem anderen Feature
 * (code-conventions.md); beide Typen bilden dieselbe `goals`-Zeile ab, aber
 * aus der Sicht des jeweils eigenen Features.
 */

/**
 * `targetWeightKg` ist ADR-0018 Punkt 6: ein fünftes Feld desselben
 * feldweisen Speicherns, kein Zustand des `WeightStore` (der es nur liest).
 */
export type GoalFieldKey = 'kcal' | 'carbsG' | 'proteinG' | 'fatG' | 'targetWeightKg';

/** Feste Anzeige-/Formularreihenfolge der **vier** kcal-/Makro-Feldblöcke oben in der Ansicht. */
export const GOAL_FIELD_ORDER: readonly GoalFieldKey[] = ['kcal', 'carbsG', 'proteinG', 'fatG'];

/**
 * Alle fünf Feldschlüssel — treibt den Store-Record und `load()`. Bewusst
 * getrennt von `GOAL_FIELD_ORDER` (ADR-0018 Punkt 6): Das Zielgewicht wird
 * **nicht** in der `@for`-Schleife der vier Feldblöcke gerendert, sondern als
 * erstes Element des Gewichtslog-Abschnitts (`design-conventions.md`), mit
 * derselben `GoalFieldComponent`.
 */
export const ALL_GOAL_FIELD_KEYS: readonly GoalFieldKey[] = [...GOAL_FIELD_ORDER, 'targetWeightKg'];

/**
 * Vollständige Zielzeile. `null` (auf Store-Ebene je Feld) bedeutet „noch
 * nicht geladen" — ein tatsächlicher Wert `0` ist ein gültiger, gespeicherter
 * Zustand („kein Ziel gesetzt", ADR-0007). `targetWeightKg` ist abweichend
 * **nullable mit eigener Bedeutung**: `null` heißt hier „kein Zielgewicht
 * gesetzt" (ADR-0018 Punkt 2) — nicht „kein Ziel geladen".
 */
export interface GoalValues {
  kcal: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  targetWeightKg: number | null;
}

/**
 * Zustand eines einzelnen Speichervorgangs (ADR-0007 Punkt 4). Es gibt
 * bewusst **keinen** formularweiten Zustand — jedes Feld trägt seinen
 * eigenen.
 */
export type GoalFieldSaveState = 'idle' | 'saving' | 'saved' | 'error';
