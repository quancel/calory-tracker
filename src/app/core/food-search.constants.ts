/**
 * Produktwerte der Food-Suche (ADR-0021 Punkt 12) — vom Nutzer entschieden,
 * von zwei Features genutzt (Step A in `food-catalog`, M2 in `meals`) und
 * deshalb genau einmal hier. Technische Werte (Debounce, Zeitlimit,
 * Seitengröße, Fingerabdruck-Größe, Abfrage-Limit, Snapshot-Schema) stehen
 * dagegen in der Datei, die sie nutzt.
 */

/** Größe des lokalen Top-Bestands (`top_foods`), nach Beliebtheit. */
export const LOCAL_TOP_N = 5000;

/** Höchstzahl angezeigter Server-Treffer, NACH Abzug der Dubletten zum lokalen Bestand. */
export const SERVER_RESULT_LIMIT = 20;

/**
 * Mindest-Eingabelänge (nach trim) für die Serversuche. Bewusst doppelt zur
 * SQL-Regel in `search_foods` (ADR-0020 Punkt 4) — bei Änderung beide.
 */
export const MIN_SERVER_QUERY_LENGTH = 2;

/**
 * Höchstzahl angezeigter LOKALER Treffer, nach der Rang-Sortierung gekürzt.
 * Nutzerentscheidung 2026-10-01: ohne Grenze rendert ein Zeichen, das fast
 * alles trifft, bei 5.000+ lokalen Foods ~5.000 Zeilen (gemessen ~666 ms).
 * Gilt für Step A und M2 gleich; die Dubletten-Prüfung der Server-Treffer
 * läuft weiterhin gegen den GESAMTEN lokalen Treffer-Satz.
 */
export const LOCAL_RESULT_LIMIT = 50;

/** Länge der „Zuletzt verwendet"-Liste bei leerer Suche (Step A und M2 zeigen dasselbe). */
export const RECENT_FOODS_LIMIT = 10;
