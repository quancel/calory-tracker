# ADR-0017: Gewichtslog & Kalorienziel-Vorschlag — Gewichtslog als Teil von `goals`, `weight_logs` mit `unique (user_id, date)`, festgelegte Rechenregel (28-Tage-Fenster, lineare Regression, 7700 kcal/kg)

- **Status**: superseded by ADR-0018
- **Datum**: 2026-09-22

> **Teil-Ablösung.** ADR-0018 ersetzt **ausschließlich Punkt 3
> (Rechenregel)** — der Vorschlag ist nicht mehr der Erhaltungsbedarf,
> sondern zielbasiert. Die Punkte 1, 2, 4, 5, 6, 7, 8 und 9 gelten
> **unverändert fort** und sind weiterhin die maßgebliche Festlegung
> (Punkt 2 wird durch ADR-0018 Punkt 5 nur um eine zweite Migration
> ergänzt). Der Status lautet trotzdem `superseded by`, weil das Vokabular
> des Index keine Teil-Ablösung kennt.
- **Bounded Context(s)**: `goals`, `data-platform` (wirkt auf `stats`, `app-shell`, `offline-sync`)
- **task_id**: `PO-2026-09-20-015`

## Kontext

Paket 015 ist das letzte Paket des Projekts und bringt drei Fragen mit, die
der bisherige Bestand nicht beantwortet:

1. **Wo lebt das Gewichtslog?** `context-map.md` führt seit Paket 001 beim
   Context `stats` „optional Gewichtslog" als Platzhalter. Die
   Design-Festlegung (`design-conventions.md`, „Gewichtslog &
   Kalorienziel-Vorschlag (Paket 015)") stellt das Gegenteil fest: Der
   Abschnitt lebt **vollständig in der Ziele-Ansicht**, unterhalb der
   Feldblöcke, ohne eigenen Tab und ohne eigenen Navigationseinstieg. Beides
   zugleich geht nicht.
2. **Wie sieht die Tabelle aus?** Die Festlegung „genau ein Gewichtswert je
   Kalendertag" verlangt einen Unique-Constraint und damit eine
   Schreib-Semantik (Upsert mit Bestätigungsdialog statt Insert), die keine
   bestehende Tabelle vorgibt.
3. **Wie lautet die Rechenregel?** Das freigegebene Paket verlangt einen
   Kalorienziel-Vorschlag „aus dem Gewichtsverlauf" und eine dokumentierte
   Rechenregel, **spezifiziert die Formel aber nicht**. Ohne Festlegung
   erfindet sie der Lead im Implementierungsschritt, sie steht nirgends
   begründet, und die Abnahmekriterien („Grenzen/Mindestdatenlage
   dokumentiert") sind nicht prüfbar.

Alle drei Punkte sind teuer umkehrbar: Punkt 1 legt den Ort von ca. sechs
neuen Dateien fest, Punkt 2 eine migrierte Tabelle, Punkt 3 eine fachliche
Regel, die dem Nutzer eine Zahl als Empfehlung anzeigt.

## Entscheidung

1. **Kein neuer Bounded Context — das Gewichtslog gehört zu `goals`.**
   Sämtlicher Frontend-Code liegt in `src/app/goals/`; die Tabelle gehört
   wie alle anderen zu `data-platform`. Begründung: Der Abschnitt hat keine
   eigene Route, keinen eigenen Navigationseinstieg und seine einzige
   schreibende Wirkung nach außen ist das Setzen des **Kalorienziels** —
   also genau der Zuständigkeit von `goals`. Ein eigener Context
   (`weight-tracking`) erzwänge eine Cross-Context-Abhängigkeit auf `goals`
   für eine Ansicht, die ohnehin in `goals` gerendert wird.
   `context-map.md` wird entsprechend korrigiert: Der Halbsatz „optional
   Gewichtslog" verschwindet bei `stats`, die Zuständigkeit von `goals`
   wird um „Gewichtslog und Kalorienziel-Vorschlag" erweitert. `stats`
   bleibt von diesem Paket **unberührt** (keine Datei, kein Import).
2. **Neue Tabelle `weight_logs` mit `unique (user_id, date)`**, eigene
   additive Migration nach dem Muster aus ADR-0004:
   `id uuid pk default gen_random_uuid()`, `user_id uuid not null references
   auth.users(id) on delete cascade`, `date date not null`, `weight_kg
   numeric not null`, `created_at timestamptz not null default now()`,
   `updated_at timestamptz not null default now()`; RLS aktiviert, vier
   Policies `weight_logs_select/_insert/_update/_delete` auf
   `user_id = auth.uid()`; Index über den Unique-Constraint
   (`weight_logs_user_id_date_key`) — kein zusätzlicher Index.
   Wertebereich als `check`-Constraints: `weight_kg >= 20 and weight_kg <=
   400` **und** `weight_kg = round(weight_kg, 1)` (höchstens eine
   Nachkommastelle). Das ist wie in ADR-0007 eine bewusste Doppelung zur
   Client-Validierung in `goals/weight.calculations.ts`; beide Stellen sind
   bei einer Änderung nachzuziehen. **Keine** Postgres-`enum`, keine View,
   keine RPC, keine berechnete Spalte (ADR-0004 Punkt 2).
   Geschrieben wird mit `upsert({ user_id, date, weight_kg, updated_at },
   { onConflict: 'user_id,date' })` — der Bestätigungsdialog beim Ersetzen
   ist reine UI und **keine** Absicherung; die Datenbank garantiert nur die
   Eindeutigkeit. Gelöscht wird über die `id` des Datensatzes.
3. **Die Rechenregel — festgelegt und an zwei Stellen dokumentiert.**
   Berechnet wird der **Erhaltungsbedarf**: die Kalorienmenge, bei der das
   Gewicht laut bisherigem Verlauf konstant bliebe. Die Karte bietet diesen
   Wert als Beobachtung an, nicht als Diät-Empfehlung.
   - **Fenster**: die letzten 28 Kalendertage einschließlich heute
     (`WEIGHT_TREND_WINDOW_DAYS = 28`), Tagesschlüssel als lokaler
     `YYYY-MM-DD`-String über `core/date.calculations.ts` (ADR-0006).
   - **Mindestdatenlage** (jede Bedingung einzeln, mit eigenem
     Erklärungstext): mindestens 3 Messungen im Fenster · Spanne zwischen
     ältester und jüngster Messung im Fenster mindestens 14 Tage · jüngste
     Messung **überhaupt** höchstens 28 Tage alt · mindestens 14 Tage mit
     mindestens einem `entries`-Datensatz im Fenster
     (`MIN_INTAKE_DAYS = 14`, siehe Punkt 4).
   - **Trend**: lineare Regression (Least Squares) von `weight_kg` über den
     Tagesabstand zum ältesten Punkt im Fenster; Ergebnis ist eine Steigung
     in kg/Tag. Bewusst Regression statt „erster gegen letzter Wert": Eine
     einzelne Tagesschwankung (Wasser, Messzeitpunkt) verschiebt sonst den
     ganzen Vorschlag.
   - **Umrechnung**: `7700 kcal je kg` Körpergewicht
     (`KCAL_PER_KG_BODY_WEIGHT = 7700`, Faustregel nach Wishnofsky).
     `trendKcalPerDay = slopeKgPerDay × 7700`.
   - **Ist-Zufuhr**: Mittelwert der Tages-kcal über die Tage **mit**
     Einträgen im Fenster — Nenner sind die erfassten Tage, nicht 28
     (gleiche Semantik wie `countsForAverage` in `stats.calculations.ts`;
     ein nicht erfasster Tag ist eine Lücke, kein Nulltag).
   - **Vorschlag**: `suggestedKcal = round((avgIntakeKcal − trendKcalPerDay)
     / 10) × 10` — auf volle 10 kcal gerundet.
   - **Plausibilitätsgrenze**: Liegt `suggestedKcal` außerhalb
     `1200 … 6000 kcal`, wird **kein** Vorschlag gezeigt, sondern derselbe
     neutrale Hinweistext wie bei zu dünner Datenlage. Ein aus wenigen
     Messpunkten hochgerechneter Extremwert darf in dieser App nicht als
     Empfehlung erscheinen.
   Die Regel steht als Modulkommentar in `goals/weight.calculations.ts`
   (Herleitung, alle Konstanten, alle Grenzen) und als Abschnitt
   „Kalorienziel-Vorschlag" in `README.md` (kurz, für Nutzer lesbar, mit
   dem ausdrücklichen Hinweis, dass es eine Faustregel und kein
   medizinischer Rat ist). Alle Konstanten liegen **einmal** in
   `goals/weight.calculations.ts` — nicht in `core/nutrition.constants.ts`,
   solange nur `goals` sie auswertet (Zwei-Nutzer-Regel, ADR-0005).
4. **Die Ist-Zufuhr liest `goals` selbst — bewusste zweite Bereichsabfrage
   auf `entries`.** `goals/goals.service.ts` bekommt eine eigene schlanke
   Abfrage `date, amount_g, foods(kcal_100g)` mit `gte`/`lte` auf `date`;
   der Index `entries_user_id_date_idx` deckt sie, kein `user_id`-Filter im
   Client (RLS). Sie ist schlanker als die des Verlaufs (nur kcal, keine
   Makros). Verworfen wurde, `stats.service.loadPeriod` nach
   `core/` zu ziehen: Das fasst im letzten Paket des Projekts ein
   abgeschlossenes Feature ohne fachlichen Gewinn an. Es gilt dieselbe
   Regel wie für die Zielzeile (ADR-0014 Punkt 6): **beim dritten Leser**
   wandert der Bereichslesepfad nach `core/`; bis dahin steht die Doppelung
   in `code-conventions.md` unter „Abweichungen". Die Mengenumrechnung
   benutzt `computeLiveNutrition()` aus `core/foods.calculations.ts` — die
   Formel wird nicht erneut geschrieben.
5. **Zweiter Signal-Store im Feature `goals`: `goals/weight.store.ts`** —
   ausdrückliche, hier begründete Abweichung von der Konvention „kein
   zweiter Store je Feature ohne ADR". `GoalsStore` ist vollständig auf die
   vier unabhängigen Feld-Speichervorgänge zugeschnitten (ADR-0007 Punkt 4);
   Gewichtsliste, Sheet-Zustand, Dialogzustand und Vorschlags-Lebenszyklus
   haben damit nichts gemeinsam und würden ihn verdoppeln. `WeightStore`
   injiziert `GoalsStore` **nur** für die Übernahme
   (`GoalsStore.setInput('kcal', …)` + `GoalsStore.save('kcal')`) — damit
   bleibt `goals.service.ts` der einzige Schreibweg auf `goals` (ADR-0007
   Punkt 3) und der übernommene Wert erscheint sichtbar im Kalorien-
   Feldblock, mit dessen bestehender „Gespeichert"-Rückmeldung. Kein
   zweiter Schreibpfad, kein stiller Hintergrund-Save.
6. **Verworfener Vorschlag ist Client-State im `WeightStore`, keine
   Persistenz.** Gemerkt wird der **verworfene kcal-Wert**
   (`dismissedSuggestionKcal: number | null`), nicht ein Boolean: Die Karte
   bleibt ausgeblendet, solange der neu berechnete Vorschlag exakt diesem
   Wert entspricht, und erscheint wieder, sobald eine neue oder geänderte
   Messung zu einem abweichenden Wert führt. Der Zustand überlebt die
   Sitzung nicht und wird beim Verlassen der Ziele-Route geleert — keine
   Spalte, keine Tabelle, keine Schema-Erweiterung an `goals` (Festlegung
   aus dem Paket).
7. **Liniendiagramm als eigene Inline-SVG-Komponente, keine
   Chart-Bibliothek** (Fortschreibung ADR-0014 Punkt 4 — der dort
   angekündigte „nächste Anlass" ist hiermit geprüft und fällt genauso
   aus): `goals/components/weight-chart/`. Jeder Messpunkt ist ein
   fokussierbares interaktives Element mit vollständigem `aria-label`
   (Datum + Gewicht), dazu eine `sr-only`-Tabelle mit allen Werten. Lücken
   werden **nicht interpoliert** (gestrichelte Verbindung, kein erfundener
   Zwischenwert). Fenster der Darstellung: letzte 90 Tage, kein
   Zeitraum-Umschalter — bewusst **nicht** identisch mit dem 28-Tage-Fenster
   der Rechenregel (Punkt 3); das Diagramm zeigt den Verlauf, die Regel
   wertet den aktuellen Trend aus. Beide Fenster stehen als benannte
   Konstanten nebeneinander in `weight.calculations.ts`.
   Das Balken-Chart aus `stats` wird **nicht** wiederverwendet und nicht
   nach `shared/` gezogen: Es teilt mit dem Liniendiagramm kein Verhalten
   außer dem Tooltip-Timing.
8. **Das Erfassen-Sheet ist ein In-Feature-Sheet ohne Auxiliary-Route.**
   Es wird aus der Ziele-Ansicht selbst geöffnet, nicht aus einem anderen
   Feature — die `sheet`-Outlet-Regel (ADR-0008 Punkt 1) greift hier
   ausdrücklich **nicht**. Verwendet werden die bestehenden Bausteine
   `shared/ui/bottom-sheet/` (Rahmen) und `shared/ui/confirm-dialog/`
   (Ersetzen-Bestätigung, Löschen-Bestätigung, Übernahme-Bestätigung) —
   kein eigener Sheet-Rahmen und kein eigener Dialog im Feature
   (ADR-0012 Punkt 5).
9. **Kein Offline-Puffer für Gewichtsschreibvorgänge.** ADR-0016 bleibt auf
   `entries` beschränkt: `weight_logs` wird nicht in die Queue, nicht in die
   IndexedDB-Schnappschüsse und nicht in `core/entry-*.service.ts`
   aufgenommen. Ein Schreibvorgang ohne Netz scheitert sichtbar mit
   Fehlermeldung. Grund: Der Puffer trägt seine Komplexität (Idempotenz-
   schlüssel, Backoff, Sync-Marker) nur für den Erfassungsfluss des
   Tagebuchs; ein Gewichtseintrag pro Tag rechtfertigt sie nicht, und ein
   client-vergebener Schlüssel kollidiert mit dem Upsert auf
   `(user_id, date)`.

## Konsequenzen

- Positiv: Das letzte Paket kommt ohne neuen Bounded Context, ohne neue
  Laufzeit-Abhängigkeit, ohne Änderung an `stats`, `diary`, `app.routes.ts`
  oder der Navigation aus. Betroffen sind genau zwei Orte: `src/app/goals/`
  und eine neue Migration.
- Positiv: Der Vorschlag hat genau **eine** Wirkung auf gespeicherte Daten —
  denselben feldweisen Upsert, den auch die manuelle Eingabe benutzt. Es
  entsteht kein zweiter Schreibweg auf `goals` und keine Historie.
- Negativ/Trade-off: `entries` wird ab jetzt an **zwei** Stellen über einen
  Zeitraum gelesen (`stats.service.ts`, `goals.service.ts`). Bewusst in
  Kauf genommen (Punkt 4); beim dritten Leser wandert der Pfad nach `core/`.
- Negativ/Trade-off: Der Vorschlag hängt an der **Erfassungsdisziplin**. Wer
  nur die Hälfte seiner Mahlzeiten loggt, bekommt einen zu niedrigen
  Erhaltungsbedarf angeboten. Abgefedert wird das nur grob (mindestens 14
  erfasste Tage, Plausibilitätsgrenze 1200–6000 kcal) — nicht beseitigt.
  Der Kartentext bleibt deshalb bewusst beobachtend formuliert.
- Negativ/Trade-off: Zwei Stores im Feature `goals`. Wer die Konvention
  liest, muss dieses ADR kennen; der Verweis steht in `code-conventions.md`.
- Negativ/Trade-off: Die 7700-kcal-Faustregel ist eine grobe Näherung
  (ignoriert Körperzusammensetzung und Anpassungseffekte). Für zwei private
  Nutzer und einen ausdrücklich unverbindlichen Vorschlag ist sie
  angemessen; jede genauere Regel (Harris-Benedict, adaptive Schätzung)
  bräuchte Körpergröße, Alter und Aktivitätsniveau — also neue Felder, neue
  Eingaben und ein ablösendes ADR.
- Betrifft künftig: Eine nachträgliche Datums-Erfassung („Gewicht für einen
  vergangenen Tag") ist mit `unique (user_id, date)` und dem Upsert bereits
  schemaseitig vorbereitet; sie braucht nur ein Datumsfeld im Sheet und
  kein neues ADR. Eine Historisierung von `goals` bleibt ausgeschlossen
  (ADR-0004/0007).

## Alternativen (kurz)

- **Eigener Bounded Context `weight-tracking` bzw. Verortung in `stats`** —
  verworfen: Die Ansicht lebt laut Design vollständig in der Ziele-Ansicht
  und schreibt das Kalorienziel. Ein zweiter Context erzeugt eine
  Cross-Context-Abhängigkeit für null zusätzliche Trennung; eine Verortung
  in `stats` bräuchte entweder einen Feature-zu-Feature-Import (verboten)
  oder einen dritten Umzug nach `core/`.
- **Vorschlag aus dem bestehenden Kalorienziel statt aus der Ist-Zufuhr**
  (`Ziel − Trendenergie`) — verworfen: unterstellt, dass der Nutzer sein
  Ziel exakt trifft. Trifft er es nicht, verstärkt der Vorschlag den
  Fehler mit jedem Durchlauf. Braucht außerdem ein gesetztes kcal-Ziel und
  schweigt sonst.
- **Nur Trendanzeige ohne Zahl („du nimmst 0,3 kg/Woche zu")** — verworfen:
  Das freigegebene Paket verlangt einen konkreten Kalorienziel-Vorschlag mit
  „Übernehmen".
- **Differenz erster/letzter Messwert statt Regression** — verworfen: Eine
  einzelne Tagesschwankung am Rand des Fensters verschiebt den Vorschlag um
  mehrere hundert kcal.
- **Mittelwert über alle 28 Tage inklusive nicht erfasster Tage (Nulltage)**
  — verworfen: zieht die Ist-Zufuhr systematisch nach unten und
  widerspricht der bereits etablierten Lücken-Semantik aus ADR-0014.
- **`weight_kg numeric(5,1)` statt `numeric` + `check`** — verworfen:
  `numeric(5,1)` **rundet** stillschweigend statt abzulehnen; der
  `check`-Constraint weist eine zweite Nachkommastelle sichtbar zurück,
  passend zur Client-Validierung.
- **Gewichtseinträge in den Offline-Puffer aufnehmen** — verworfen: siehe
  Punkt 9; der client-vergebene Idempotenzschlüssel aus ADR-0016 passt
  nicht zu einem Upsert auf `(user_id, date)`.
- **Verworfenen Vorschlag persistieren** (Spalte/Tabelle) — nicht zulässig:
  ausdrückliche Festlegung im Paket („keine Schema-Erweiterung, keine
  Persistenz über die Sitzung hinaus").
