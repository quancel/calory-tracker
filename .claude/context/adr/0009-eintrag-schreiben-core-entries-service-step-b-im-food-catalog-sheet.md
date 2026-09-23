# ADR-0009: Eintrag schreiben — `core/entries.service.ts` als einziger Schreibweg auf `entries`, Step B bleibt im `food-catalog`-Sheet, `MealType` wandert nach `core/`

- **Status**: accepted
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `diary`, `food-catalog` (wirkt auf `app-shell`, `meals`, `data-platform`)
- **task_id**: `PO-2026-09-20-007`

## Kontext

Paket 007 baut Step B (Menge erfassen, Eintrag speichern) des Sheets, das
Paket 006 angelegt hat — den in ADR-0008 Punkt 4 benannten Übergabepunkt
(`FoodSearchStore.selectFood()`, `DiaryShellComponent.onEntryClick()`).
Dabei kollidieren drei bestehende Festlegungen:

1. **`entries` gehört fachlich zu `diary`** (Context-Map), das Sheet aber
   zu `food-catalog`. Schreibt das Sheet über `food-search.service.ts`,
   besitzt `food-catalog` plötzlich den Schreibpfad auf `entries`.
2. **Kein Feature importiert aus einem anderen Feature** (ADR-0001,
   ADR-0007 Punkt 5, ADR-0008). Das Sheet kann `DiaryStore`/`DiaryService`
   also nicht aufrufen, und `diary` kann die Sheet-Komponente nicht
   einbinden.
3. **`foods` darf nur über `food-search.service.ts` gelesen werden**
   (ADR-0008 Punkt 2). Ein Step B in `diary` bräuchte die Nährwerte je
   100 g für die Live-Berechnung **vor** dem Speichern und müsste dafür
   den Katalog lesen.

Zusätzlich verlangt das Paket, dass ein gespeicherter Eintrag „sofort in
der Tagesansicht erscheint" — die Tagesansicht bleibt beim Sheet-Öffnen
gemountet (ADR-0008 Punkt 1) und lädt von sich aus nicht nach.

Die Entscheidung ist teuer umkehrbar: Paket 010 („Mahlzeit loggen")
und Paket 011 („gestern kopieren") schreiben dieselbe Tabelle aus zwei
weiteren Features.

## Entscheidung

1. **Step B bleibt im bestehenden Eintrags-Sheet in `food-search`** —
   dritter Step derselben Komponente, dieselbe Auxiliary-Route
   `(sheet:eintrag-erfassen)`. Grund: Das gewählte `Food` liegt dort
   bereits als Objekt im `FoodSearchStore` (Sitzungs-Cache, ADR-0008
   Punkt 3); die Live-Berechnung während der Mengeneingabe braucht
   dadurch **keinen** zusätzlichen Read und keinen Katalogzugriff aus
   einem fremden Context (Kontextpunkt 3).
2. **Der Schreibpfad auf `entries` liegt in `src/app/core/entries.service.ts`** —
   `insert`, `update`, `delete` sowie `loadEntry(entryId)` (ein Eintrag
   mit eingebettetem Food, gleiches PostgREST-Muster wie
   `diary.service.ts`). Begründung: Der Dienst hat ab Paket 011 drei
   Aufrufer aus drei Features (`food-catalog` 007, `meals` 010, `diary`
   011); genau dafür ist `core/` vorgesehen („Geteiltes geht über
   `core/`", Context-Map). Weder `food-catalog` noch `diary` bekommt damit
   Hoheit über die Tabelle eines anderen Features.
   **`entries.user_id` hat keinen DB-Default** (anders als
   `foods.created_by`) — der Dienst setzt ihn explizit aus
   `SupabaseService.userId()`, wie `goals.service.ts`. RLS
   (`entries_insert/_update/_delete`) bleibt die eigentliche Absicherung.
3. **Der Lesepfad des Tages bleibt unverändert bei `diary`.** ADR-0006
   wird nicht abgelöst: `diary.service.loadDay()` bleibt die Quelle der
   Tagesansicht. Die `foods`-Spaltenliste steht damit an einer dritten
   Stelle — bewusst in Kauf genommen (wie schon in ADR-0006/0008), statt
   `entries` vollständig aus `diary` herauszulösen.
4. **Die Tagesansicht aktualisiert sich über ein Revisions-Signal, nicht
   über einen Aufruf.** `EntriesService` exponiert
   `readonly revision: Signal<number>`, das nach **jedem** erfolgreichen
   Schreibvorgang erhöht wird. `DiaryStore` beobachtet es per `effect` und
   lädt den aktuellen Tag neu. Richtung der Abhängigkeit: `diary` → `core`,
   **nie** umgekehrt — `core/` bekommt kein Feature-Wissen. Kein
   optimistisches Einfügen in den Store: `id`/`created_at` erzeugt der
   Server, und Mengenänderung, Sektionswechsel und alle Summen ergeben
   sich aus dem Reload ohne zweite Rechenstelle.
5. **Bearbeiten und Löschen laufen über dasselbe Sheet und dieselbe
   Route**, unterschieden durch einen zusätzlichen optionalen
   Query-Parameter `entryId`. Ist er gesetzt, lädt das Sheet den Eintrag
   über `EntriesService.loadEntry()` und öffnet direkt Step B; `diary`
   übergibt also nur die ID, keine Nährwerte über die URL. Damit gibt es
   genau **eine** Step-B-Implementierung für Anlegen und Bearbeiten, und
   `diary` importiert weiterhin nichts aus `food-search`.
6. **`MealType`, `MEAL_TYPE_ORDER` und `MEAL_TYPE_LABELS` wandern nach
   `src/app/core/meal-type.constants.ts`.** Mit der Mahlzeit-Chip-Reihe im
   Sheet-Header ist die Zwei-Nutzer-Regel erfüllt (`diary` **und**
   `food-catalog`); beide importieren aus `core/`, keines aus dem anderen
   Feature. `suggestedMealTypeForHour()` bleibt in `diary.calculations.ts`
   — einziger Aufrufer ist der FAB der Tagesansicht, und das Sheet bekommt
   die Mahlzeit stets als Parameter übergeben (fehlt oder ist er ungültig,
   fällt das Sheet defensiv auf `'snack'` zurück, wie die untere
   Fallback-Stufe derselben Funktion).

## Konsequenzen

- Positiv: `diary` und `food-catalog` bleiben importfrei voneinander,
  obwohl ein Bedienfluss quer über beide läuft. Anlegen und Bearbeiten
  teilen sich eine Implementierung. Paket 010 und 011 schreiben `entries`
  über denselben Dienst, ohne ein Feature anzufassen, das ihnen nicht
  gehört.
- Negativ/Trade-off: `core/` bekommt mit `entries.service.ts` den ersten
  Dienst mit fachlichem Tabellenbezug — die Grenze „`core/` enthält
  keinen Feature-Code" wird bewusst gedehnt (Präzedenz:
  `core/nutrition.constants.ts`, ADR-0005). Der Zugriff auf `entries` ist
  auf zwei Dateien verteilt (Tagesliste in `diary.service.ts`,
  Einzelsatz + Schreiben in `core/entries.service.ts`); bei
  Spaltenänderungen sind beide nachzuziehen. Das Revisions-Signal lädt den
  ganzen Tag neu statt nur den geänderten Eintrag — bei zwei Nutzern und
  einer Tagesliste akzeptiert.
- Betrifft künftig: Paket 010 (Mahlzeit loggen → n Einträge in einem
  Schreibvorgang) und Paket 011 („gestern kopieren" inkl. Rücknahme)
  erweitern `core/entries.service.ts`, statt eigene Schreibwege zu bauen.
  Der Bestätigungsdialog liegt in diesem Paket noch in
  `food-search/components/confirm-dialog/`; Paket 010 ist der zweite
  Nutzer und verschiebt ihn dann nach `shared/ui/confirm-dialog/`
  (Zwei-Nutzer-Regel, gleiche Begründung wie beim Sheet-Rahmen in
  ADR-0008).

## Alternativen (kurz)

- **Step B als eigene Route/Komponente in `diary`** — verworfen: Für die
  Live-Berechnung müsste `diary` das Food am Katalog vorbei lesen
  (ADR-0008 Punkt 2) oder alle Nährwerte über Query-Parameter
  transportieren.
- **Schreiben über `food-search.service.ts`** — verworfen:
  `food-catalog` bekäme den Schreibpfad auf `entries`, gegen die
  Context-Map.
- **Eintrag-Zustand komplett aus `DiaryStore` nach `core/` ziehen** —
  verworfen: großer Umbau am bereits abgenommenen ADR-0006-Lesepfad,
  ohne Gewinn gegenüber dem Revisions-Signal.
- **Optimistisches Einfügen des neuen Eintrags in `DiaryStore`** —
  verworfen: zweite Rechenstelle für Summen/Sektionen und erfundene
  `id`/`created_at`, für einen kaum spürbaren Zeitgewinn bei einer
  Tagesliste.
- **Eigener Bounded Context `entries`** — verworfen: Over-Engineering für
  zwei Nutzer; ein Dienst in `core/` leistet dasselbe.
