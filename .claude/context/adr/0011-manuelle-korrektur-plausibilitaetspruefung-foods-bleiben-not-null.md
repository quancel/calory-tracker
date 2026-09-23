# ADR-0011: Manuelle Korrektur und Plausibilitätsprüfung — Nährwertspalten bleiben `not null`, Prüflogik als reine Funktion, `is_corrected` als Vorrangflagge

- **Status**: accepted
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `food-catalog` (wirkt auf `data-platform`, `diary`, `meals`)
- **task_id**: `PO-2026-09-20-009`

## Kontext

ADR-0010 Punkt 5 hat die Nullable-Frage der vier Nährwertspalten
ausdrücklich an „das Paket mit Korrektur/Vollständigkeits-Marker"
delegiert — das ist dieses Paket. Zusätzlich entstehen hier drei Dinge
erstmals: ein **Schreibweg auf bestehende** `foods` (bisher gab es nur
`insert`), eine **fachliche Prüflogik** über Nährwerte, und ein
**Vorrangbegriff** (`is_corrected`), der künftige Schreiber binden muss.

Belegter Ist-Stand (geprüft am 2026-09-21):

- `foods.is_corrected boolean not null default false` existiert seit der
  Basis-Migration `20260920161132`; `foods_update` erlaubt jedem
  authentifizierten Nutzer `update` (`using (true)`). Für dieses Paket ist
  **keine** Migration nötig.
- `FOOD_COLUMNS` in `food-search.service.ts` selektiert `is_corrected`
  **nicht**, `Food` in `models/food.model.ts` trägt das Feld nicht.
- `entries.food_id` referenziert `foods`; Nährwerte sind **nicht** in
  `entries` kopiert (ADR-0006 liest sie eingebettet).
- Es existiert heute **kein** Pfad, der ein bestehendes Food überschreibt:
  `lookupBarcode()` liefert bei lokalem Treffer sofort zurück und ruft OFF
  gar nicht erst auf.
- Der 20px-Marker-Slot in der Trefferliste existiert leer
  (`food-entry-sheet.component.html`, `.marker-slot`).

## Entscheidung

1. **`kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g` bleiben
   `not null`.** Die Nullable-Frage aus ADR-0010 Punkt 5 wird damit
   **verneint**, nicht erneut vertagt: Ein persistiertes Food ist immer
   vollständig. Gründe: Nullable verändert `Food`, den eingebetteten
   Lesepfad der Tagesansicht (ADR-0006) und **jede** Summenrechnung, auch
   in `meals` (Paket 010) — ein Ripple, dem in diesem Paket kein Nutzen
   gegenübersteht, weil die einzige Quelle unvollständiger Werte
   (unvollständiger OFF-Treffer) per ADR-0010 Punkt 5 ohnehin über das
   Formular vervollständigt wird. Ein späteres Lockern von `not null` ist
   eine additive Migration; die Gegenrichtung wäre eine Datenmigration.
2. **„Unvollständig" bleibt trotzdem ein erstklassiger, getesteter
   Befund** — aber über **Form-/Entwurfswerte**, nicht über persistierte.
   Die Prüffunktion nimmt eine nullable-tolerante Nährwertform
   (`kcal100g: number | null` usw.) entgegen und wird sowohl mit
   Formularwerten (Step A2/Step C, vorbelegter OFF-Treffer) als auch mit
   `Food`/`StepBFood` aufgerufen. Folge und bewusst akzeptiert: In der
   Suchtrefferliste kann der Marker „unvollständig" heute nicht auftreten;
   sichtbar wird dort nur „unplausibel". Der Code dafür ist kein
   Vorratscode, sondern der Pfad, den das Anlege-/Korrekturformular
   tatsächlich nutzt.
3. **Prüflogik als reine Funktion in
   `src/app/food-search/food-search.calculations.ts`**, nicht im Store und
   nicht in einer Komponente (code-conventions.md „Wo was hingehört",
   ADR-0006). Sie liefert eine **Liste aller zutreffenden Befunde** mit
   den konkreten Zahlen (für das Banner der Detailansicht); die
   Priorisierung auf genau einen Marker für Einzel-Slot-Kontexte ist eine
   zweite, ebenfalls reine Funktion darüber. Die Grenzwerte (10 %
   kcal-Abweichung, 100 g Makrosumme je 100 g, Atwater-Faktoren) stehen als
   **exportierte Konstanten in derselben Datei** — nicht in
   `core/nutrition.constants.ts`: Es gibt heute genau einen nutzenden
   Feature-Ordner (Zwei-Nutzer-Regel, ADR-0005). Der Umzugspunkt ist
   benannt, siehe Konsequenzen.
4. **Reihenfolge der Prüfungen ist Teil der Entscheidung, nicht
   Auslegungssache**: Die Makrosummen-Prüfung läuft immer über die
   **vorhandenen** Werte (auch bei fehlendem Wert); die
   kcal-Abweichungsprüfung läuft **nur** bei vier vorhandenen Werten und
   erzeugt sonst **keinen** Befund. „Unvollständig" gilt unabhängig davon.
   Grund: Aus fehlenden Werten mit 0 zu rechnen, erzeugt eine scheinbare
   kcal-Abweichung von 100 % — ein Falsch-Befund, der genau das Vertrauen
   zerstört, das der Marker aufbauen soll. Die 0-Regel gilt ausschließlich
   für die **Mengenberechnung** (Step B, Tagessumme), nicht für die
   Prüfung.
5. **Die Prüfung markiert, sie blockiert nicht.** Kein Befund verhindert
   das Speichern eines Foods oder eines Eintrags, und es gibt keine
   Bestätigungs-/Ignorieren-Aktion. Der Befund ist damit reine
   Darstellungsableitung aus den Werten und wird **nirgends persistiert**
   (keine Spalte, kein Flag) — er bleibt automatisch aktuell, wenn sich
   Werte oder Schwellen ändern.
6. **Korrektur läuft über `food-search.service.ts`** als neue
   `updateFood`-Methode, die `is_corrected = true` **im selben `update`**
   mitschreibt (ein Roundtrip, kein Zwei-Schritt, der halb scheitern kann).
   `food-search.service.ts` bleibt der einzige Katalogzugang (ADR-0008
   Punkt 2); `is_corrected` wird zu `FOOD_COLUMNS` und zu `Food`
   hinzugefügt. Der Store aktualisiert den Sitzungs-Cache **in place** mit
   der Antwortzeile, statt neu zu laden (wie beim Anlegen, ADR-0010
   Punkt 4).
7. **`is_corrected` ist eine Sperre für Schreiber, keine Anzeige.** Regel
   ab hier: **Kein automatischer Schreibweg überschreibt ein Food mit
   `is_corrected = true`** — heute gibt es keinen solchen Pfad (siehe
   Kontext), die Regel gilt für jeden künftigen (Refresh aus OFF,
   Import, Offline-Sync). Das Flag erzeugt **kein** eigenes UI-Element;
   es ist kein Qualitätssiegel und wird nicht neben dem Food-Namen
   angezeigt.

## Konsequenzen

- Positiv: Kein Migrations-, kein `diary`-Anteil — das Paket bleibt
  vollständig im Frontend und in `food-catalog`. `Food` bleibt in allen
  bestehenden Summen ein Typ ohne `null`.
- Eine Korrektur wirkt **rückwirkend** auf bereits gespeicherte Einträge,
  weil `entries` die Nährwerte nicht kopiert, sondern per `food_id`
  eingebettet liest (ADR-0006). Gestrige Tagessummen können sich nach
  einer Korrektur ändern. Das ist die gewollte Lesart von „korrigierte
  Werte haben Vorrang", aber es ist eine echte, für den Nutzer sichtbare
  Folge — siehe offene Frage im Handoff.
- Negativ/Trade-off: Der Marker „unvollständig" ist in der Trefferliste
  vorerst unerreichbar (Punkt 2). Wer ihn dort sehen will, braucht die
  Nullable-Migration als eigenes Paket, inklusive Ripple in ADR-0006.
- Betrifft künftig: Paket 010 (`meals`) zeigt denselben Marker in M2/M3
  (`design-conventions.md`). `meals` darf nicht aus `food-catalog`
  importieren (ADR-0001) — **dann**, nicht früher, wandern Prüffunktion und
  Schwellen nach `src/app/core/nutrition.constants.ts` bzw. eine reine
  `core`-Rechendatei, und der Marker wird zur Komponente unter
  `src/app/shared/ui/`. Das ist der in Punkt 3 benannte Umzugspunkt.

## Alternativen (kurz)

- **Nährwertspalten jetzt nullable machen** — verworfen: teurer Ripple in
  `diary`/`meals` ohne Gegenwert in diesem Paket (Punkt 1). Bewusst als
  offene Frage an den Nutzer gespiegelt, nicht stillschweigend entschieden.
- **Befunde persistieren (Spalte `is_implausible`)** — verworfen: veraltet
  bei jeder Wertänderung und bei jeder Schwellenänderung, zweite Quelle
  für eine ableitbare Information.
- **Prüfung im Store als `computed`** — verworfen: nur über `TestBed`
  prüfbar, während die Akzeptanz überwiegend Grenzfall-Tests verlangt
  (9/10/11 %).
- **`is_corrected` in zwei Schritten setzen (Update, dann Flag)** —
  verworfen: zwei Roundtrips mit halb-fertigem Zwischenzustand.
- **Korrektur als eigener Dienst/eigene Datei neben
  `food-search.service.ts`** — verworfen: Schreibweg auf denselben Katalog,
  gehört in den einen Katalogzugang (ADR-0008 Punkt 2).
