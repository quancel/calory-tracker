# ADR-0012: Gespeicherte Mahlzeiten — Katalog-Lesepfad und Sitzungs-Cache nach `core/`, geteilte Sheet-/Dialog-/Marker-Bausteine nach `shared/ui/`, Mahlzeiten-Lesepfad in `core/`

- **Status**: accepted (löst ADR-0008 ab — siehe „Verhältnis zu ADR-0008")
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `meals`, `food-catalog` (wirkt auf `app-shell`, `diary`, `data-platform`)
- **task_id**: `PO-2026-09-20-010`

## Kontext

Paket 010 ist der in ADR-0008, ADR-0009 und ADR-0011 jeweils ausdrücklich
vorgemerkte Umzugspunkt: Mit dem Mahlzeit-Sheet entsteht der **zweite
Nutzer** von Sheet-Rahmen, Bestätigungsdialog und Plausibilitäts-Logik.
Zusätzlich kollidieren drei bestehende Festlegungen:

1. **`meals` braucht den Food-Katalog** (Step M2 Suche, Step M3 Menge mit
   Live-Berechnung und Marker, design-conventions.md „Mahlzeit-Sheet"),
   darf aber nicht aus `food-catalog` importieren (ADR-0001). Der Katalog
   ist heute ausschließlich über `food-search.service.ts` erreichbar
   (ADR-0008 Punkt 2), der Sitzungs-Cache liegt in `food-search.store.ts`
   (ADR-0008 Punkt 3).
2. **`food-catalog` braucht die Mahlzeiten-Daten**: Der Log-Weg ist per
   Design **kein** eigener Einstieg, sondern ein Segment-Tab in Step A des
   bestehenden Eintrags-Sheets (design-conventions.md „Segment-Tabs im
   Eintrags-Sheet"). Die Abhängigkeit läuft also in **beide** Richtungen —
   ein Feature-zu-Feature-Import wäre in jeder Richtung nötig und ist in
   jeder Richtung ausgeschlossen.
3. **Beide Mahlzeiten-Listen müssen identisch sortiert sein** (Akzeptanz:
   „identische Reihenfolge"), liegen aber in zwei verschiedenen Features.

Belegter Ist-Stand (geprüft am 2026-09-21):

- `meals`, `meal_items` existieren seit der Basis-Migration
  `20260920161132` **inklusive vollständiger RLS**: `meals` über
  `user_id = auth.uid()`, `meal_items` über `exists`-Unterabfrage auf den
  Elternsatz. `meals.name` hat **keinen** Unique-Index — doppelte Namen
  sind bereits zulässig. `meal_items.meal_id` und `meal_items.food_id`
  sind jedoch **nullable**.
- Der Sheet-Rahmen ist **keine** eigene Komponente: Backdrop, Drag-Handle,
  Schließen, Escape/Tab-Fokusfalle (`FOCUSABLE_SELECTOR`) stecken direkt in
  `food-entry-sheet.component.{ts,html,css}`. Die Extraktion ist echtes
  Refactoring, kein Dateiumzug.
- `confirm-dialog` ist bereits eine zustandslose Komponente mit
  Inputs/Outputs (`food-search/components/confirm-dialog/`) — hier genügt
  der Umzug.
- Der Marker ist ebenfalls keine Komponente, sondern Inline-Markup in einem
  `.marker-slot` der Trefferliste; in der Trefferliste ist der Slot
  zusätzlich **Tap-Ziel** für Step C (Korrektur).
- `core/entries.service.ts` kann heute nur **einzelne** Einträge anlegen.

## Entscheidung

1. **Der Katalog-Lesepfad samt Sitzungs-Cache wandert nach
   `src/app/core/foods.service.ts`.** Der Dienst hält den Food-Bestand als
   Signal (`foods`), lädt ihn einmal je Sitzung (`ensureLoaded()`,
   `retryLoad()`) und bietet `upsertFood(food)` für die In-place-Pflege
   nach Anlegen/Korrigieren. **`food-search.service.ts` bleibt der einzige
   Schreibweg auf `foods`** (`createFood`, `createFoodFromOff`,
   `updateFood`) und der einzige Zugang zu Open Food Facts und zum
   Barcode-Lookup. Es gibt weiterhin **genau einen** Cache im Projekt —
   `FoodSearchStore` und der neue `MealsStore` filtern beide über
   `CoreFoodsService.foods()` mit je eigener Query. Zwei Caches wären die
   eigentliche Gefahr: Ein in Step A2 angelegtes Food würde in M2 fehlen.
2. **Reine Food-/Nährwert-Rechenlogik mit zwei Nutzern wandert nach
   `src/app/core/foods.calculations.ts`**, die Schwellen nach
   `src/app/core/nutrition.constants.ts` (damit ist der in ADR-0011 Punkt 3
   benannte Umzugspunkt eingelöst). Umzuziehen sind: `filterFoodsByQuery`,
   `parseDecimal`, `validateNameField`, `validateAmountField`,
   `resolveDefaultAmount`, `computeLiveNutrition`, `isNutritionIncomplete`,
   `findPlausibilityFindings`, `resolvePlausibilityMarker`,
   `plausibilityMarkerStatusText` samt Typen (`NutritionMaybeNull`,
   `NutritionPer100g`, `LiveNutrition`, `PlausibilityFinding`,
   `PlausibilityMarker`) und die Konstanten `KCAL_DEVIATION_THRESHOLD`,
   `MACRO_SUM_MAX_G_PER_100G`, `ATWATER_*`. **In `food-catalog` bleibt**,
   was nur dort Nutzer hat: OFF-Normalisierung, Step-A2-Formularvalidierung
   (`validateCreateFoodForm`, `validateNutrientField`,
   `validateDefaultPortionField`, `nutritionDraftFromFormValues`,
   `foodToCorrectFormValues`), `normalizeMealType`, `cameraErrorMessage`.
   Der Typ `Food`/`FoodSource` wird in `core/foods.service.ts` definiert
   und exportiert; `food-search/models/food.model.ts` behält
   `CreateFoodInput` und importiert `Food` von dort — **keine** zweite
   Definition, kein Re-Export.
   Die Prüf**logik** selbst wird dabei nicht verändert: Reihenfolge und
   Grenzfälle aus ADR-0011 Punkt 4 gelten unverändert weiter, die
   bestehenden Tests ziehen mit um.
3. **Der Mahlzeiten-Lesepfad liegt in `src/app/core/meals.service.ts`, der
   Schreibpfad bleibt im Feature.** `core/meals.service.ts` lädt die Liste
   der Mahlzeiten mit Positionen und eingebetteten Foods (eine
   PostgREST-Abfrage, gleiches Muster wie `diary.service.ts`) — zwei
   Nutzer: die Verwaltungsansicht in `meals` und der Log-Tab in
   `food-catalog`. **Anlegen, Ändern und Löschen** von `meals`/`meal_items`
   bleiben in `src/app/meals/meals.service.ts`: dafür gibt es genau einen
   Nutzer, und die Zwei-Nutzer-Regel wird nicht vorsorglich gedehnt.
   Sortierung und Summenbildung liegen als reine Funktionen in
   `src/app/core/meals.calculations.ts` (`sortMealsByName`,
   `computeMealTotals`) — **eine** Quelle ist die einzige belastbare Art,
   die geforderte identische Reihenfolge beider Listen zu garantieren.
4. **Sortierung im Client, nicht in der Datenbank**:
   `Intl.Collator('de', { sensitivity: 'base' })` in
   `core/meals.calculations.ts`, kein `order by name collate …` über
   PostgREST. Gründe: Die Listen werden ohnehin im Client zusammengeführt
   (Summen), eine Sortierung an der Abfrage wäre eine zweite Stelle, und
   Umlautbehandlung/Case-Insensitivität sind so ohne Angular-Kontext
   testbar (Akzeptanz verlangt genau diese Grenzfälle).
5. **Die drei geteilten UI-Bausteine ziehen nach `shared/ui/`:**
   - `shared/ui/bottom-sheet/` — zustandsloser Rahmen (Backdrop,
     Drag-Handle, Schließen-Button, Escape/Tab-Fokusfalle) mit
     `ng-content` und Output `close`. Das ist Refactoring am abgenommenen
     Eintrags-Sheet und läuft **verhaltensneutral** gegen die bestehenden
     Sheet-Tests; die Step-Logik bleibt in der jeweiligen Sheet-Komponente.
   - `shared/ui/confirm-dialog/` — reiner Umzug der bestehenden Komponente
     (ADR-0009 Konsequenzen).
   - `shared/ui/plausibility-marker/` — Input `marker`, Screenreader-Text
     aus `plausibilityMarkerStatusText`. Der Baustein ist **von sich aus
     nicht interaktiv**; nur wo der Aufrufer den optionalen Output
     `correct` bindet (Trefferliste Step A), wird der Slot zum Tap-Ziel.
     Damit bleibt der Korrektur-Einstieg eine Entscheidung des Aufrufers
     und wandert nicht als verstecktes Verhalten in `shared/`.
6. **Loggen schreibt n Einträge in einem Vorgang** über eine neue Methode
   `EntriesService.createEntries(inputs: CreateEntryInput[])` (ein
   Array-`insert`, `revision` wird **einmal** erhöht). Damit ist das Loggen
   atomar und die Tagesansicht lädt einmal statt n-mal nach. ADR-0009
   Punkt 2 wird damit fortgeschrieben, nicht geändert: Es bleibt der einzige
   Schreibweg auf `entries`. Es entsteht **keine** Rückverknüpfung von
   `entries` auf `meals` — kein Sondertyp, keine neue Spalte, geloggte
   Positionen sind danach gewöhnliche Einträge.
7. **Speichern einer Mahlzeit ist ein Zwei-Schritt mit Kompensation.**
   PostgREST kennt keine mehrtabellige Transaktion: erst `insert` in
   `meals`, dann Array-`insert` der Positionen; scheitert der zweite
   Schritt, löscht der Dienst die eben angelegte Mahlzeit wieder
   (kompensierendes `delete`) und meldet den Fehler. Beim Bearbeiten werden
   die Positionen **ersetzt** (`delete` aller `meal_items` der Mahlzeit,
   danach Array-`insert`) statt einzeln abgeglichen — nichts referenziert
   eine `meal_items.id`, ein Diff wäre reiner Aufwand. Bewusst **kein**
   Postgres-RPC/`function`: Das wäre ein neues Persistenz-Pattern im
   Projekt für einen Fall, den die Kompensation abdeckt.
8. **„Keine Mahlzeit ohne Positionen" ist eine Client-Regel, kein
   DB-Constraint.** Der Speichern-Button in M1 ist gesperrt, solange Name
   leer oder Positionsliste leer ist; Verwaltungsliste und Log-Tab stellen
   eine positionslose Mahlzeit defensiv nicht-interaktiv dar
   (design-conventions.md). Eine DB-seitige Garantie bräuchte einen Trigger
   oder ein deferred Constraint — gegen einen Zustand, der beim Anlegen
   **zwangsläufig transient** auftritt. Das ist ausdrücklich kein
   Widerspruch zum Learning „Zugriffsregeln gehören in RLS": Hier geht es
   um eine Vollständigkeitsregel, nicht um Datenschutz zwischen Nutzern —
   der Zugriffsschutz liegt vollständig in den bestehenden Policies.
9. **Topologie**: Die Verwaltungsansicht ist eine gewöhnliche Top-Level-
   Route `mahlzeiten` (lazy, `authGuard`) — wie `ziele` ein echter
   Seitenwechsel (ADR-0007). Das **Mahlzeit-Sheet** ist eine **zweite**
   Auxiliary-Route im bestehenden `sheet`-Outlet
   (`mahlzeit-bearbeiten`, optionaler Query-Parameter `mealId`), die
   Komponente liegt in `meals`. Beide Einstiege (Header-Icon der
   Tagesansicht, „+"/Zeilen-Tap der Verwaltungsansicht) navigieren per
   Router; kein Feature importiert aus einem anderen.
10. **Datenbank**: Es fehlt nichts Funktionales — Tabellen und RLS
    existieren und sind korrekt. Eine additive Migration härtet nur, was
    jetzt noch kostenlos ist, weil beide Tabellen leer sind:
    `meal_items.meal_id` und `meal_items.food_id` auf `not null`, plus
    `meals_user_id_idx`. Gleiche Begründung wie ADR-0008 Punkt 5
    („vor dem ersten Schreibpfad, danach braucht es eine Bereinigung").

## Verhältnis zu ADR-0008

ADR-0012 **löst ADR-0008 ab**, aber nur in zwei von fünf Punkten:

- **Ersetzt**: Punkt 2 (`food-search.service.ts` als einziger Katalogzugang
  — gilt fortan nur noch für den **Schreibweg** und die externen Quellen)
  und Punkt 3 (Ort des Sitzungs-Caches — jetzt `core/foods.service.ts`).
  Die **Lade-Strategie** aus Punkt 3 bleibt inhaltlich unverändert: einmal
  je Sitzung laden, danach rein im Speicher filtern, kein `ilike` je
  Tastendruck, kein Debounce. Auch der dort benannte Ablösepunkt
  (serverseitige Suche, sobald `foods` groß wird) gilt fort und bräuchte
  weiterhin ein eigenes ablösendes ADR.
- **Gilt unverändert fort**: Punkt 1 (Eingabe-Sheet als Auxiliary-Route der
  App-Shell), Punkt 4 (Übergabepunkt, historisch) und Punkt 5
  (`default_portion_g = null` heißt „nicht gesetzt", auf beiden Ebenen).

## Konsequenzen

- Positiv: `meals` und `food-catalog` bleiben importfrei voneinander,
  obwohl die Abhängigkeit in beide Richtungen läuft. Es gibt weiterhin
  genau einen Food-Cache, genau eine Plausibilitätslogik, genau einen
  Schreibweg auf `entries` und genau eine Sortierfunktion für beide
  Mahlzeiten-Listen. Die in drei ADRs vorgemerkten Umzüge sind damit
  abgeschlossen und nicht erneut vertagt.
- Negativ/Trade-off: `core/` wächst um vier Dateien mit fachlichem Bezug
  (`foods.service.ts`, `foods.calculations.ts`, `meals.service.ts`,
  `meals.calculations.ts`) — die in ADR-0009 begonnene Dehnung der Grenze
  „`core/` enthält keinen Feature-Code" wird fortgesetzt. Der Zugriff auf
  `meals` ist auf zwei Dateien verteilt (Lesen in `core/`, Schreiben im
  Feature), wie schon bei `entries`; bei Spaltenänderungen sind beide
  nachzuziehen. Das Paket enthält außerdem einen erheblichen
  Refactoring-Anteil an bereits abgenommenem Code (`food-catalog`), bevor
  die eigentliche Funktion entsteht.
- Das Speichern einer Mahlzeit ist nicht transaktional; im seltenen
  Fehlerfall zwischen beiden Schritten greift die Kompensation aus Punkt 7.
  Schlägt auch die Kompensation fehl, bleibt eine positionslose Mahlzeit
  zurück — dafür existiert die defensive Darstellung aus Punkt 8.
- Betrifft künftig: Paket 011 („gestern kopieren") nutzt
  `EntriesService.createEntries()` aus Punkt 6 statt n Einzel-Inserts.
  Jedes weitere Sheet nutzt `shared/ui/bottom-sheet/`; ein Sheet-Rahmen
  im Feature ist ab hier eine Abweichung, die ein ADR braucht.

## Alternativen (kurz)

- **Mahlzeit-Sheet in `food-catalog` bauen** (wo Suche und Mengen-Step
  schon liegen) — verworfen: `food-catalog` bekäme den Schreibpfad auf
  `meals`/`meal_items`, gegen die Context-Map; dieselbe Begründung, mit der
  ADR-0009 den `entries`-Schreibpfad nicht bei `food-catalog` gelassen hat.
- **`meals` navigiert für „Food hinzufügen" auf die bestehende
  Eintrags-Sheet-Route (Auswahlmodus mit `returnTo`)** — verworfen: Beide
  Sheets teilen sich dasselbe Outlet, der Mahlzeit-Entwurf (Name,
  Positionsliste) würde beim Routenwechsel zerstört und müsste
  zwischengespeichert werden.
- **Katalog-Zugang komplett (inkl. Schreiben, OFF, Barcode) nach `core/`
  ziehen** — verworfen: OFF-Anbindung und Scanner haben genau einen
  Nutzer; `core/` würde ohne Gegenwert um die externe Quelle wachsen.
- **Mahlzeiten-Liste serverseitig sortieren** (`order by name collate
  "de-DE-x-icu"`) — verworfen: zweite Sortierstelle neben der
  Client-Aggregation, schlechter testbar, und die Akzeptanz verlangt
  ausdrücklich Identität beider Listen (Punkt 4).
- **Atomares Speichern über eine Postgres-Funktion (RPC)** — verworfen:
  neues Persistenz-Pattern im Projekt (bisher ausschließlich PostgREST auf
  Tabellen) für einen Fall, den die Kompensation abdeckt (Punkt 7).
- **`meals`-Sortier-/Summenlogik im jeweiligen Feature doppeln** —
  verworfen: zwei Implementierungen derselben Regel, deren Gleichheit ein
  Akzeptanzkriterium ist.
