# ADR-0010: Barcode-Scan und Open Food Facts als zweite Katalogquelle — Scanner-Adapter im Feature, `fetch` statt HttpClient, Barcode-Lookup an der Datenbank, `foods` bleibt vollständig

- **Status**: accepted
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `food-catalog` (wirkt auf `app-shell`, `data-platform`)
- **task_id**: `PO-2026-09-20-008`

## Kontext

Paket 008 löst den in ADR-0008 Punkt 2 offen gehaltenen Erweiterungspunkt
ein: die zweite Katalogquelle. Dabei sind fünf Dinge zu entscheiden, die
nach 009/010 teuer umkehrbar sind.

1. **Ort des Scanners.** Die Context-Map führt für `food-catalog` neben
   `src/app/food-search/` auch einen Ordner `src/app/scanner/` — angelegt
   1:1 aus dem Feature-Request, bevor klar war, dass der Scanner
   ausschließlich aus dem Eingabe-Sheet heraus erreichbar ist. Ein eigener
   Feature-Ordner erzwingt genau den Feature-zu-Feature-Import, den
   ADR-0001 ausschließt.
2. **Neue Laufzeitabhängigkeit.** `BarcodeDetector` ist nicht überall
   verfügbar (Safari/iOS); die Paket-Constraints fordern einen
   zxing-js-Fallback. Das ist die erste npm-Laufzeitabhängigkeit neben
   Angular/Supabase/rxjs.
3. **HTTP-Weg.** Es gibt im Projekt bisher keinen einzigen HTTP-Aufruf
   außerhalb von `@supabase/supabase-js`; `provideHttpClient` ist in
   `app.config.ts` **nicht** registriert. Alle Dienste sind
   `async`/`await`-basiert, nicht Observable-basiert.
4. **Lokaler Barcode-Treffer vs. Sitzungs-Cache.** ADR-0008 Punkt 3 lädt
   `foods` einmal je Sitzung und filtert danach im Speicher. `foods.barcode`
   ist `unique`; der Cache kann veraltet sein (zweiter Nutzer) und trägt
   das Feld bisher nicht.
5. **Unvollständige OFF-Antworten.** Die Akzeptanz fordert „fehlende
   Nährwerte bleiben leer statt 0". `foods.kcal_100g`, `protein_100g`,
   `carbs_100g`, `fat_100g` sind `not null` (Migration
   `20260920161132`), und die Tagesansicht summiert diese Werte eingebettet
   (ADR-0006).

## Entscheidung

1. **Kein Ordner `src/app/scanner/`.** Scanner-Komponente und
   Scanner-Adapter liegen in `src/app/food-search/`; der Bounded Context
   `food-catalog` umfasst ab hier genau diesen Ordner. Grund: Der Scanner
   ist kein eigenständiger Einstieg, sondern ein Zustand des bestehenden
   Eingabe-Sheets (ADR-0008 Punkt 1) und teilt dessen Store und Sitzung. Ein
   zweites Feature müsste aus `food-search` importieren oder eine zweite
   Route/einen zweiten Store bekommen — beides ohne Gegenwert. Die
   Context-Map wird entsprechend korrigiert.
2. **Zwei Scanner-Implementierungen hinter einer Schnittstelle, zxing
   nachgeladen.** `food-search.scanner.service.ts` bietet eine schmale,
   quellenunabhängige API (Start auf einem `<video>`-Element, Callback/
   Promise mit erkanntem Code, Stop). Intern: `BarcodeDetector`, wenn
   `'BarcodeDetector' in window`; sonst `@zxing/browser` per **dynamischem
   `import()` erst im Fallback-Fall** — die Abhängigkeit landet in einem
   eigenen Lazy-Chunk und belastet den Erststart nicht. Aufrufender Code
   (Komponente/Store) erfährt nie, welche Implementierung läuft. Das ist
   **keine** Abstraktion auf Vorrat im Sinne von ADR-0008 Punkt 2: Beide
   Implementierungen existieren ab dem ersten Tag.
3. **Open Food Facts über natives `fetch`, kein `HttpClient`.**
   `food-search.off.service.ts` kapselt Endpunkt, Timeout und Mapping;
   `provideHttpClient` wird **nicht** eingeführt. Gründe: keine
   Interceptor-/Observable-Anforderung, keine Auth-Header (öffentliche
   API), und der Rest des Projekts ist `async`/`await`. Das Timeout ist
   `AbortSignal.timeout(OFF_REQUEST_TIMEOUT_MS)` mit
   `OFF_REQUEST_TIMEOUT_MS = 8_000` als exportierte Konstante **in dieser
   Datei** (Tests importieren sie von dort). Sie ist ein technischer
   Betriebswert, kein fachlicher Grenzwert, und gehört deshalb weder nach
   `food-search.calculations.ts` noch nach `core/*.constants.ts`.
   Die **reine** Umrechnung einer OFF-Antwort auf 100-g-Werte
   (kJ→kcal, Portionsbezug, fehlende Felder) liegt dagegen als Funktion in
   `food-search.calculations.ts` — ohne DI und ohne `fetch` testbar. Die
   **Reihenfolge der Quellen** (lokal → OFF → manuell) bleibt wie in
   ADR-0008 Punkt 2 festgelegt in `food-search.service.ts`; Store und
   Komponenten rufen weiterhin nur diese Datei.
   OFF-Antworten werden **nicht** in `ngsw-config.json` gecacht: Der Cache
   dieses Projekts ist die `foods`-Tabelle, zwei Cache-Ebenen für dieselbe
   Information wären nicht invalidierbar.
4. **Barcode-Lookup geht gezielt an die Datenbank, nicht an den
   Sitzungs-Cache.** `food-search.service.ts` löst einen gescannten Code per
   `select(...).eq('barcode', code).maybeSingle()` auf. Gründe: Der
   Sitzungs-Cache kann den vom zweiten Nutzer angelegten Datensatz nicht
   kennen, und `barcode` ist `unique` — ein Insert gegen einen veralteten
   Cache liefe in eine Constraint-Verletzung statt in einen Treffer. Ein
   Netzaufruf **je Scan** ist unkritisch (Scan ≠ Tastendruck); die Vorgabe
   aus ADR-0008 Punkt 3 betrifft ausdrücklich nur das Tippen in der Suche.
   Jedes so gefundene oder neu gespeicherte Food wird in den Sitzungs-Cache
   **eingefügt**, statt die Liste neu zu laden (wie beim manuellen Anlegen).
   Der in ADR-0008 Punkt 3 benannte Ablösepunkt (serverseitiges `ilike`)
   wurde geprüft und ist bei zwei Nutzern **nicht** erreicht — Punkt 3
   bleibt unverändert gültig.
5. **Die Nährwertspalten von `foods` bleiben `not null` — unvollständige
   OFF-Produkte werden nicht automatisch persistiert.** Liefert OFF einen
   Treffer ohne alle vier Pflichtwerte, geht der Ablauf in das
   Anlege-Formular (Step A2) mit **vorbelegten vorhandenen** Werten; die
   fehlenden Felder bleiben **leer** (nie `0`, nie geschätzt) und werden vom
   Nutzer ergänzt. Gespeichert wird erst danach — mit `source = 'off'`
   (Herkunft, nicht Vollständigkeit) und übernommenem `barcode`. Dieses
   Paket braucht damit **keine** Migration. Grund: Nullable-Nährwerte
   verändern den Typ `Food`, den eingebetteten Lesepfad der Tagesansicht
   (ADR-0006) und jede Summenrechnung — das gehört in das Paket, das den
   Vollständigkeits-Marker einführt (`design-conventions.md`,
   „Plausibilität/Vollständigkeit"), nicht als Nebenwirkung hierher. Der
   Quellenhinweis in Step B dieses Pakets ist ausdrücklich **reiner
   Hinweistext** ohne Bewertung und wird an das persistierte
   `source === 'off'` gebunden — kein zusätzlicher transienter Zustand
   „frisch geholt".

## Konsequenzen

- Positiv: `food-search.service.ts` bleibt der einzige Katalogzugang;
  Komponenten und Store erfahren von OFF und vom Scanner nichts außer
  Ergebnis- und Fehlerzuständen. Der Erststart bleibt ohne zxing-Gewicht.
  Ohne Schema-Änderung bleibt `diary` von diesem Paket unberührt.
- Negativ/Trade-off: Jeder Scan kostet einen Supabase-Roundtrip, auch wenn
  das Food im Cache läge. Unvollständige OFF-Produkte kosten den Nutzer
  Handarbeit, statt sie mit Lücken zu speichern — bewusst, bis Paket 009 die
  Nullable-Frage entscheidet. Der zxing-Fallback ist nur auf Geräten ohne
  `BarcodeDetector` überhaupt ausführbar, also nicht auf jedem
  Entwicklungsrechner manuell prüfbar.
- Betrifft künftig: Das Paket mit Korrektur/Plausibilität erbt aus Punkt 5
  die offene Nullable-Entscheidung und muss sie als eigenes ADR treffen.
  `foods` wächst ab hier durch den OFF-Cache — der Ablösepunkt aus ADR-0008
  Punkt 3 ist bei jedem weiteren Katalogpaket erneut zu prüfen.

## Alternativen (kurz)

- **`src/app/scanner/` als eigenes Feature** — verworfen: erzwingt
  Feature-zu-Feature-Import oder einen zweiten Store für denselben Vorgang
  (siehe Punkt 1).
- **zxing statisch importieren** — verworfen: belastet den Erststart aller
  Geräte für einen Fallback, den die meisten nie brauchen.
- **Nur zxing, ohne `BarcodeDetector`** — verworfen: verschenkt die
  schnellere, energiesparendere Plattform-Implementierung dort, wo sie
  existiert; die Constraints fordern sie ausdrücklich zuerst.
- **`provideHttpClient` + Interceptor für das Timeout** — verworfen: führt
  einen zweiten HTTP-Stil (Observables) für genau einen Endpunkt ein.
- **Barcode gegen den Sitzungs-Cache auflösen** — verworfen: kollidiert mit
  `barcode unique` und mit Datensätzen des zweiten Nutzers (Punkt 4).
- **Nährwertspalten jetzt nullable machen** — verworfen für dieses Paket:
  Ripple in `Food`, ADR-0006-Lesepfad und alle Summen, ohne dass die
  zugehörige Marker-UI in diesem Paket entsteht (Punkt 5).
- **Fehlende Werte als `0` speichern** — verworfen: widerspricht der
  Akzeptanz und macht „unbekannt" und „enthält nichts" ununterscheidbar
  (gleiche Begründung wie `default_portion_g`, ADR-0008 Punkt 5).
