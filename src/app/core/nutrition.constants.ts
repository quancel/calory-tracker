/**
 * Projektweite fachliche Konstanten für Nährwert-/Ziel-Berechnungen
 * (siehe .claude/context/code-conventions.md, Abschnitt "Wo was
 * hingehört", und ADR-0005).
 *
 * Wird von Feature-Code (u. a. `diary`, `stats`) importiert, sobald diese
 * Features existieren — bis dahin ist dies die alleinige Quelle des
 * Schwellenwerts. Kein Feature definiert 1.05 bzw. 105 % lokal, kein
 * Feature importiert diesen Wert aus einem anderen Feature.
 */

/**
 * Toleranzschwelle für Ziel-Überschreitungen (Kalorienring, Makro-Balken,
 * Balken-Chart im Verlauf — siehe design-conventions.md, Abschnitte
 * "Kalorienring" und "Makro-Balken").
 *
 * Semantik: Ist- bis einschließlich 105 % des Ziels gilt als neutral/
 * Akzent (keine Warnfarbe). Erst der Anteil, der über 100 % des Ziels
 * hinausgeht, wird in `--color-warning` dargestellt — die 105-%-Grenze
 * entscheidet nur, ob überhaupt eine Warnfarbe erscheint, nicht wie groß
 * das Warnsegment ist.
 */
export const GOAL_OVERSHOOT_TOLERANCE = 1.05;

/**
 * Plausibilitäts-/Vollständigkeitsprüfung eines Foods (ADR-0011 Punkt 3/4,
 * seit Paket 010 mit zwei Nutzern — `food-catalog` und `meals` — daher hier
 * statt in einem Feature, siehe ADR-0012 Punkt 2).
 */
/** >10 % Abweichung zwischen angegebenen und aus Makros errechneten kcal gilt als unplausibel. */
export const KCAL_DEVIATION_THRESHOLD = 0.1;
/** Makrosumme über 100g je 100g ist technisch unmöglich. */
export const MACRO_SUM_MAX_G_PER_100G = 100;
/** Atwater-Faktoren (kcal je Gramm) für die errechnete Energie. */
export const ATWATER_PROTEIN_KCAL_PER_G = 4;
export const ATWATER_CARBS_KCAL_PER_G = 4;
export const ATWATER_FAT_KCAL_PER_G = 9;
