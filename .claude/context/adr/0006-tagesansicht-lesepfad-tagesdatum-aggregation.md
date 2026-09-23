# ADR-0006: Tagesansicht — Lesepfad (Einträge mit eingebetteten Foods), Tagesdatum-Schlüssel und Aggregation im Client

- **Status**: accepted
- **Datum**: 2026-09-20
- **Bounded Context(s)**: `diary` (wirkt auf `food-catalog`, `goals`, `stats`, `data-platform`)
- **task_id**: `PO-2026-09-20-004`

## Kontext

Die Tagesansicht ist das erste Paket, das fachliche Daten liest. Sie braucht
drei Dinge, für die es bisher keine Festlegung gibt:

1. **Nährwerte zu den Einträgen.** `entries` speichert nur `food_id` und
   `amount_g`; kcal/Makros liegen pro 100 g in `foods` (ADR-0004). Die
   Context-Map sagt „`diary`, `meals` → `food-catalog`: lesen Foods über das
   Food-Repository, nie über eigene Queries" — dieses Repository existiert
   noch nicht (Paket 006/007 legt `food-catalog` an), und `diary` darf laut
   `code-conventions.md` ohnehin nicht aus einem anderen Feature importieren.
2. **Den Tagesschlüssel.** `entries.date` ist eine Postgres-`date`-Spalte
   ohne Zeitzone. Ein `Date`-Objekt über `toISOString()` zu serialisieren
   verschiebt den Tag je nach Zeitzone — der Fehler zeigt sich erst abends
   bzw. für Nutzer östlich von UTC und betrifft danach jedes datenlesende
   Paket (`stats`, „gestern kopieren", Gewichtslog).
3. **Ziel-Bezug bei fehlendem Ziel.** `goals` hat genau eine Zeile je Nutzer
   mit vier `not null`-Spalten (ADR-0004). `design-conventions.md` beschreibt
   dagegen ein „kein Ziel gesetzt" **je Makro einzeln**, die `constraints` des
   Pakets sprechen von „Standardwerten für die fehlenden Felder". Drei
   Formulierungen, die sich nur mit einer Festlegung vertragen.

Alle drei Punkte sind nach 006/007 teuer umkehrbar: Dann bauen mindestens
zwei weitere Features auf demselben Lesepfad und demselben Datumsschlüssel
auf.

## Entscheidung

1. **Ein Lesepfad je Tag, als eingebettete PostgREST-Ressource.**
   `diary.service.ts` lädt die Einträge eines Tages in **einer** Abfrage auf
   `entries` mit eingebettetem `foods`-Teil (`select('id, meal_type,
   amount_g, created_at, foods(id, name, kcal_100g, carbs_100g, protein_100g,
   fat_100g)')`, gefiltert auf `date`). Die Zielzeile aus `goals` wird als
   zweite, einzeilige Abfrage geladen (`maybeSingle`).
   Das ist eine **bewusste Abweichung** von der Context-Map-Zeile oben: Deren
   Regel gilt für den *Katalog*-Zugriff (Suche, Barcode-Lookup, Anlegen und
   Korrigieren von Foods) — der bleibt ausschließlich in `food-catalog`.
   `diary` liest Foods nur **eingebettet an den eigenen Einträgen**, nie als
   Liste, nie schreibend. Wenn `food-catalog` in 006/007 entsteht, behält
   `diary` diesen Lesepfad und importiert nichts aus dem anderen Feature.
   Kein `user_id`-Filter im Client: die Abgrenzung leisten die RLS-Policies
   (ADR-0004).
2. **Der Tagesschlüssel ist ein lokaler Kalendertag als `YYYY-MM-DD`-String**
   und ist der Zustand des Stores — kein `Date`-Objekt im State, kein
   `toISOString()`, kein UTC-Zwischenschritt. Umrechnung und Tagesarithmetik
   (±1 Tag, „heute", Grenze „heute + 7") laufen ausschließlich über reine
   Funktionen, die auf lokalen Datumsfeldern arbeiten. Keine Datums-Bibliothek.
3. **Aggregation im Client, in reinen Funktionen.** Tagessummen,
   Sektions-Teilsummen und die Fortschritts-/Überschuss-Aufteilung werden
   **nicht** in der Datenbank berechnet (kein View, keine RPC, keine
   berechneten Spalten — ADR-0004 Punkt 2). Sie liegen als reine,
   DI-freie Funktionen in `src/app/diary/diary.calculations.ts` und werden im
   `diary.store.ts` über `computed` exponiert. Die Fortschrittsfunktion
   liefert Füll- und Überschussanteil **getrennt** und wertet die Schwelle
   ausschließlich über `GOAL_OVERSHOOT_TOLERANCE` aus
   `src/app/core/nutrition.constants.ts` aus (ADR-0005); `1.05` wird in
   `diary` nicht erneut definiert.
4. **„Kein Ziel gesetzt" ist definiert als: keine `goals`-Zeile vorhanden
   **oder** der betreffende Zielwert ist `<= 0`.** Damit ist das von
   `design-conventions.md` beschriebene Verhalten „je Makro einzeln kein Ziel"
   auf dem bestehenden Schema darstellbar, ohne es zu ändern. Es werden
   **keine erfundenen Standard-Zielwerte** (z. B. 2000 kcal) eingesetzt: Ein
   Fortschritt gegen ein Ziel, das der Nutzer nie gesetzt hat, wäre eine
   Falschaussage. „Läuft mit Standardwerten weiter" aus den Paket-Constraints
   meint den definierten neutralen Zustand (ungefüllter Ring/Balken,
   Ist-Wert ohne Zielbezug, keine Warnfarbe), nicht ein Ersatzziel.
5. **Keine neue Laufzeit-Abhängigkeit.** Der Kalorienring ist Inline-SVG, die
   Makro-Balken sind CSS; die Datumsauswahl nutzt das native
   `<input type="date">` mit `max`. Keine Chart-, Datums- oder
   UI-Bibliothek in diesem Paket.

## Konsequenzen

- Positiv: Ein Tag ist mit zwei Abfragen geladen, RLS-gesichert und ohne
  Feature-zu-Feature-Import. Die Rechenlogik ist ohne Angular-Kontext
  testbar (Grenzfälle 100/105/105.1 %, Werte weit über 100 %). Der
  Datumsfehler „Eintrag landet am Vortag" ist strukturell ausgeschlossen.
- Negativ/Trade-off: Die `foods`-Spaltenliste steht damit an einer Stelle
  in `diary` und an einer weiteren in `food-catalog`; ändert sich das
  Food-Schema, sind zwei Stellen zu prüfen. Das ist der Preis dafür, dass
  `diary` nicht auf ein Feature wartet, das es noch nicht gibt. Die
  Fortschrittsfunktion wird `stats` (Paket 012) ein zweites Mal brauchen —
  dann wandert sie nach `shared/` bzw. `core/` (Zwei-Nutzer-Regel), bis
  dahin bleibt sie in `diary` und wird von `stats` **nicht** importiert.
- Betrifft künftig: Pakete 006/007 bauen den Katalogzugriff in
  `food-catalog` auf und fassen den Lesepfad der Tagesansicht nicht an.
  Paket 005 (Ziele) schreibt `goals`; die Lese-Semantik „Wert `<= 0` heißt
  kein Ziel" gilt dort ebenso. Eine spätere Serverseiten-Aggregation (View
  oder RPC) bräuchte ein ablösendes ADR.

## Alternativen (kurz)

- **Foods separat nachladen** (`in`-Filter auf die `food_id`s der Einträge) —
  verworfen: zwei Abfragen statt einer für dasselbe Ergebnis, ohne dass die
  Context-Map-Regel dadurch besser eingehalten wäre (es bliebe eine eigene
  `foods`-Query in `diary`).
- **Food-Repository schon jetzt in `core/` anlegen** — verworfen: `core/` ist
  für app-weit Einmaliges; ein Katalog-Repository ist Fachlogik von
  `food-catalog` und würde dort in 006/007 ein zweites Mal entstehen oder das
  Paket vorwegnehmen.
- **Postgres-View `entries_with_nutrition` bzw. RPC für Tagessummen** —
  verworfen: widerspricht ADR-0004 („Umrechnung im Frontend"), macht jede
  Anzeigeänderung zur Migration und die Grenzfälle der 105-%-Schwelle
  schlechter testbar.
- **Erfundene Standard-Zielwerte bei fehlender `goals`-Zeile** — verworfen:
  zeigt Fortschritt gegen ein Ziel, das nie gesetzt wurde, und widerspricht
  `design-conventions.md` („Kein Ziel gesetzt").
- **`Date`-Objekt als Store-Zustand** — verworfen: die Serialisierung nach
  `date` ist dann an jeder Aufrufstelle erneut eine Fehlerquelle.
