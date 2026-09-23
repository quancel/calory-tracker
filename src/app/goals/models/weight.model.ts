/**
 * Domänenmodelle des Gewichtslogs und Kalorienziel-Vorschlags (ADR-0017,
 * ADR-0018). Reine Typen, kein Angular-Import. Eigenständig von
 * `goal.model.ts` (`GoalValues` trägt nur `targetWeightKg`, keine Messreihe)
 * — Messungen und Ziel bleiben unterschiedliche Fachlichkeiten, auch wenn
 * beide in `goals` gelesen/geschrieben werden. Der Messwert-Typ selbst
 * (`WeightLogEntry`) liegt seit ADR-0019 in `core/weight-logs.service.ts`.
 */

/** Tages-kcal-Summe für die Ist-Zufuhr des Vorschlags (ADR-0017 Punkt 4). */
export interface IntakeDay {
  readonly dateKey: string;
  readonly kcal: number;
}

/**
 * Ergebnis von `computeCalorieSuggestion()` — ein Summentyp, keine Zahl mit
 * Sonderwerten (ADR-0018 Punkt 4, code-conventions.md „Gewichtslog und
 * Kalorienziel-Vorschlag"). Die Komponente trifft keine dieser
 * Fallunterscheidungen selbst und rechnet nichts nach.
 */
export type CalorieSuggestionResult =
  | 'no-entries'
  | 'no-target'
  | 'insufficient'
  | { readonly kind: 'suggestion'; readonly kcal: number; readonly holding: boolean };
