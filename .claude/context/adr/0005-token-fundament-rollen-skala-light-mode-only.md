# ADR-0005: Token-Fundament — Rollen/Skala-Trennung, Light-Mode-only, zentrale Schwellenkonstante

- **Status**: accepted
- **Datum**: 2026-09-20
- **Bounded Context(s)**: `app-shell` (bindend für `auth`, `diary`, `food-catalog`, `meals`, `goals`, `stats`)
- **task_id**: `PO-2026-09-20-013a`

## Kontext

Alle Frontend-Pakete referenzieren Farben, Abstände, Radien, Typo- und
Motion-Werte. Ohne eine verbindliche, projektweit einzige Quelle entstehen
Literal-Werte in Komponenten-CSS, die sich nachträglich nur noch durch
Anfassen aller Komponenten korrigieren lassen. Zusätzlich braucht die
105-%-Toleranzschwelle (Kalorienring, Makro-Balken, Verlauf-Chart) genau
einen Definitionsort — sie wird in mindestens zwei Bounded Contexts
(`diary`, `stats`) ausgewertet. Der Nutzer hat am 2026-09-20 Light-Mode-only
entschieden, ein späterer Dark Mode soll aber ohne Komponentenänderung
nachrüstbar bleiben.

## Entscheidung

1. **Eine Token-Datei**: `src/styles/tokens.css`, alle Custom Properties auf
   `:root`. Keine zweite Token-Datei, keine Token-Build-Pipeline, kein
   Theming-Framework.
2. **Zwei Ebenen**: Skala-Tokens (primitiv: Neutral-Skala, Spacing, Radius,
   Typo, Motion) und Rollen-Tokens (`--color-surface`, `--color-text`,
   `--color-border`, `--color-accent`, `--color-warning`,
   `--color-macro-*`, Fokus). **Komponenten-CSS referenziert ausschließlich
   Rollen-Tokens**, nie Skala-Tokens, nie Literal-Farben.
3. **Light-Mode-only ohne Dark-Mode-Mechanik**: kein
   `@media (prefers-color-scheme)`, kein zweiter Token-Satz, kein
   Theme-Umschalter; `theme-color` und Manifest-`background_color` fest hell.
   Die Nachrüstbarkeit entsteht allein aus Punkt 2 — ein Dark Mode ergänzt
   später einen zweiten Rollen-Block und fasst keine Komponente an.
4. **Die 105-%-Toleranzschwelle ist eine TypeScript-Konstante in
   `src/app/core/nutrition.constants.ts`, kein CSS-Token.** Sie wird in
   Rechenlogik ausgewertet, nicht in CSS; eine Doppeldefinition als Token
   *und* Konstante wäre zwei Quellen für einen Wert.

## Konsequenzen

- Positiv: Farb- oder Abstandsänderungen sind eine Ein-Datei-Änderung. Dark
  Mode bleibt ohne Komponenten-Refactoring nachrüstbar. Die Schwelle ist an
  einer Stelle änderbar und für `diary` wie `stats` importierbar, ohne dass
  ein Feature aus einem anderen Feature importiert.
- Negativ/Trade-off: Die Rollen-Ebene ist eine Indirektion, die bei
  Einzelfällen wie „nur hier ein etwas dunkleres Grau" zum Anlegen eines
  weiteren Rollen-Tokens zwingt, statt einen Wert lokal zu setzen. Das ist
  gewollt. `nutrition.constants.ts` liegt in `core/`, obwohl `core/` sonst
  Dienste enthält — die Alternative (`shared/`) scheitert an der
  Zwei-Nutzer-Regel, solange nur ein Feature existiert.
- Betrifft künftig: Jedes Frontend-Paket. Neue Farbwerte kommen als
  Rollen-Token in `tokens.css` und werden dem `ux-ui-designer` über
  `notes_for_conventions` gemeldet; sie werden nicht in Komponenten
  eingestreut. Hex-Feinjustierung innerhalb derselben Farbfamilie ist zur
  Kontrast-Erfüllung erlaubt, die Rollen-/Skala-Struktur nicht.

## Alternativen (kurz)

- **Zwei Token-Sätze mit `prefers-color-scheme` von Anfang an** — verworfen,
  weil jeder Wert doppelt gepflegt und doppelt auf Kontrast geprüft werden
  müsste, für einen Modus, den der Nutzer ausdrücklich nicht will.
- **Schwelle zusätzlich als CSS-Token `--threshold-overshoot`** — verworfen,
  zwei Quellen für einen Wert; die Auswertung ist Rechenlogik, nicht Styling.
- **Schwelle in `diary/` und Re-Export nach `stats/`** — verworfen,
  Feature-zu-Feature-Import ist per `code-conventions.md` ausgeschlossen.
