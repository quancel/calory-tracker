# ADR-0021: Hybrid-Food-Suche — lokaler Bestand aus drei Teilen in IndexedDB, Serversuche nur über `core/foods.service.ts`, gemeinsame Suchlogik als `core/`-Factory, Statuszeile in `shared/ui/`

- **Status**: accepted (löst die **Lade-Strategie** aus ADR-0008 Punkt 3 / ADR-0012 Punkt 1 ab und den **Food-Teil** des Lesecaches aus ADR-0016 Punkt 8 — siehe „Verhältnis zu bestehenden ADRs")
- **Datum**: 2026-09-30
- **Bounded Context(s)**: `food-catalog`, `meals`, `offline-sync` (wirkt auf `data-platform` nur lesend)
- **task_id**: `PO-2026-09-30-003` (baut gegen ADR-0020 aus `PO-2026-09-30-001`)

## Kontext

`foods` wächst durch den DACH-Import (002) auf ~300k Zeilen. Der heutige
Lesepfad `core/foods.service.ts` lädt je Sitzung `from('foods').select(…)`
**ohne Filter** und ist dabei still auf 1000 Zeilen gekappt;
`food-search.service.ts` enthält mit `search()` einen zweiten, ungenutzten
Volllade-Pfad. ADR-0020 liefert serverseitig `search_foods`/`top_foods`. Offen
war die Client-Seite: Was liegt lokal, wie wird es aktuell gehalten, wie
werden lokale und Server-Treffer zusammengeführt — für **zwei** Features
(Step A, M2) mit identischem Ergebnis.

Belegter Ist-Stand (2026-09-30): `local-db.service.ts` Version 1, Store
`foods-snapshot` mit einem Schlüssel `'current'` (ganzer Bestand).
`entries.service.ts` `bufferCreate()` (Z. 487) und
`FoodSearchStore.beginCorrect()` suchen das Food synchron in
`CoreFoodsService.foods()`. `MealItemFood` (core/meals.service.ts) trägt kein
`source` — ein Queue-Schnappschuss lässt sich daraus nicht bilden. M2 filtert
in `meals.store.ts` eine eigene Kopie der Filterlogik.

## Entscheidung

1. **Einziger Lesepfad bleibt `src/app/core/foods.service.ts`** — einziger
   Aufrufer von `rpc('top_foods')`, `rpc('search_foods')` und jeder
   `foods`-Listenabfrage. `foods()` bedeutet ab hier **lokaler Bestand**, nicht
   „Katalog". Kein Pfad lädt `foods` ungefiltert; `FoodSearchService.search()`
   entfällt. `Food` bekommt `offPopularity: number` (aus `off_popularity`,
   ADR-0020 Punkt 2); Spaltenliste und Zeilen-Abbildung werden aus
   `core/foods.service.ts` exportiert und von `food-search.service.ts`
   (Schreibweg) wiederverwendet statt doppelt geführt.
2. **Lokaler Bestand = drei Teile**, im Speicher per `id` zusammengeführt.
   Liegt dieselbe `id` in mehreren Teilen, gewinnt die **zuletzt vom Server
   geholte** Fassung; eine per `upsertFood()` übernommene Fassung gilt bis
   zur nächsten Server-Auffrischung desselben Foods (ein gespeicherter,
   veralteter Nutzer-Teil darf eine frische Korrektur nie verdecken):
   - **Top** — `top_foods(LOCAL_TOP_N)`, nutzerunabhängig.
   - **Gemeinsam** — alle Foods mit `source is null or source = 'manual' or
     is_corrected = true` (PostgREST `.or(…)`), nutzerunabhängig, **bei jedem
     Sitzungsstart** neu geladen (Akzeptanz „Foods des anderen Nutzers
     spätestens nach Neustart").
   - **Nutzer** — Foods aus eigenen `entries` (`select('food_id, foods(…)')`)
     **und** aus eigenen `meal_items` (`select('foods(…)')`), RLS-begrenzt,
     bei jedem Sitzungsstart neu geladen. Aus den `entries`-Zeilen entsteht
     zugleich `ownUseCounts` (Anzahl je `food_id`). Die `meal_items`-Foods
     gehören dazu, weil das Loggen einer gespeicherten Mahlzeit sonst bei
     temporärem Fehler nicht gepuffert werden kann (`MealItemFood` reicht
     nicht für den Queue-Schnappschuss) — ein bewusster Obermengen-Zusatz
     zur Akzeptanz-Definition.
   - Zusätzlich übernimmt `upsertFood()` jedes Food, mit dem der Nutzer
     interagiert (angelegt, korrigiert, gescannt, **ausgewählter
     Server-Treffer**), sofort in den Nutzer-Teil — im Speicher **und**
     persistiert. Der Nutzer-Teil wird beim Neuladen mit den Serverdaten
     vereinigt (Server-Fassung ersetzt die gespeicherte), nie gekürzt (außer
     beim Nutzerwechsel).
3. **IndexedDB-Layout**: `LOCAL_DB_VERSION` 1 → 2; das Upgrade leert
   `foods-snapshot` (der alte `'current'`-Schnappschuss hat die alte
   `Food`-Form). Schlüssel in `foods-snapshot`:
   `'top'` → `{ schema, topN, fingerprint, foods }`,
   `'shared'` → `{ schema, foods }`,
   `'user:<userId>'` → `{ schema, foods, useCounts }`.
   `schema` ist `FOODS_SNAPSHOT_SCHEMA` (technische Konstante in
   `foods.service.ts`); passt sie nicht, gilt der Teil als nicht vorhanden.
   Kein neuer Object Store, keine zweite Datenbank (ADR-0016 Punkt 2).
4. **Invalidierung des Top-Teils über Fingerabdruck, kein Backend-Zusatz.**
   Beim ersten `ensureLoaded()` einer Sitzung: `top_foods(TOP_FINGERPRINT_SIZE
   = 20)` holen, Fingerabdruck = verkettete `id:off_popularity` dieser Zeilen.
   Der Top-Teil wird **genau dann** vollständig neu geladen, wenn kein
   gespeicherter Teil existiert **oder** `schema`, `topN` (≠ `LOCAL_TOP_N`)
   oder Fingerabdruck abweichen. Grund: Nur der Import schreibt
   `off_popularity` (ADR-0020 Punkt 2); ein neuer OFF-Stand ändert die
   Scan-Zähler der beliebtesten Produkte praktisch immer. Schlägt die
   Fingerabdruck-Abfrage fehl (offline), bleibt der gespeicherte Teil gültig.
   Der neue Top-Teil ersetzt den alten erst, wenn **alle** Seiten geladen
   sind (atomarer Tausch im Speicher und in IndexedDB).
5. **Paging gegen das PostgREST-Limit** (alle drei Teile, ein privater
   Helfer in `foods.service.ts`): `.range(from, from + POSTGREST_PAGE_SIZE -
   1)` mit stabiler Sortierung (`top_foods` sortiert selbst; sonst
   `.order('id')`), `from` rückt um die **tatsächlich gelieferte** Zeilenzahl
   vor; Ende bei leerer Seite oder erreichter Obergrenze. Bewusst nicht
   „Seite kürzer als 1000 ⇒ Ende" (ADR-0020 Punkt 5): Wäre `max_rows`
   niedriger konfiguriert, schnitte genau das still ab.
6. **Ladezustand**: `localState: 'idle' | 'loading' | 'ready' |
   'unavailable'`. Gespeicherte Teile werden zuerst aus IndexedDB gelesen
   (sofort nutzbar, auch offline/Neustart), die Netz-Auffrischung läuft
   danach. `'unavailable'` nur, wenn für mindestens einen Teil weder frische
   noch gespeicherte Daten vorliegen — das ist Statuszeilen-Priorität 1;
   `retryLoad()` lädt die fehlenden Teile nach. Zusätzlich
   `findFood(id): Promise<Food | null>`: wartet das Lesen der gespeicherten
   Teile ab (ohne Netz) und sucht dann im Bestand.
7. **Nutzerbindung**: `CoreFoodsService` beobachtet
   `SupabaseService.userId()`. Bei Wechsel: Nutzer-Teil und `ownUseCounts`
   im Speicher leeren, `'user:<neu>'` laden, `'user:<andere>'`-Schlüssel in
   IndexedDB löschen (die Nutzung des anderen Nutzers bleibt auch lokal
   unsichtbar, Linie ADR-0004/ADR-0020). Top und Gemeinsam bleiben.
8. **Offline-Puffer**: `EntriesService.bufferCreate()` holt das Food über
   `await coreFoods.findFood(id)` statt synchron aus `foods()`. Nach jedem
   erfolgreichen oder gepufferten Anlegen ruft `EntriesService`
   `coreFoods.recordUse(foodIds)` (erhöht `ownUseCounts`, persistiert) —
   `core` → `core`, kein Feature-Aufruf. Server-Treffer werden beim
   Auswählen (Step B, M3) und vor `beginCorrect()` per `upsertFood()`
   übernommen; damit gelten Z. 487 und `beginCorrect(foodId)` unverändert.
9. **Serversuche**: `CoreFoodsService.searchServer(query, signal)` ruft
   `search_foods(p_query, p_limit = SEARCH_FOODS_REQUEST_LIMIT)` mit
   `SEARCH_FOODS_REQUEST_LIMIT = 50` (Obergrenze aus ADR-0020 Punkt 4) und
   Zeitlimit `SEARCH_FOODS_TIMEOUT_MS`; Ergebnis als Summentyp
   `success(hits: { food, ownUseCount }[]) | error | aborted`. Es wird mehr
   geholt als angezeigt, weil die Obergrenze **nach** dem Duplikat-Abzug
   gilt und die Server-Spitze sich stark mit dem lokalen Bestand überschneidet.
10. **Gemeinsame Suchlogik als Factory**: `src/app/core/hybrid-food-search.ts`
    exportiert `createHybridFoodSearch()`, aufgerufen im Feldinitialisierer
    von `FoodSearchStore` **und** `MealsStore` (je eigene Instanz, eigener
    Query). Sie hält: Query, Debounce `SERVER_SEARCH_DEBOUNCE_MS = 250`,
    Laufnummer (eine Antwort wirkt nur, wenn ihre Laufnummer die aktuelle
    ist), Abbruch per `AbortController` (ein Abbruch ist nie ein Fehler),
    Server-Phase (`idle | pending | success | error | offline`), Retry je
    Statusart, Neu-Auslösen beim Wechsel offline → online. Die **reinen**
    Regeln liegen in `core/foods.calculations.ts`: lokaler Rang, Merge mit
    Dedupe, Statuszeilen-Priorität, Leerzustand.
11. **Rang und Merge**: Lokaler Treffer = `filterFoodsByQuery` (ab 1 Zeichen).
    Rang lokal = Rang aus ADR-0020 Punkt 4 (prio manuell/korrigiert, Textstufe
    0–3, `ownUseCounts` absteigend, `offPopularity` absteigend, Name, `id`) —
    **eine** Funktion für beide Features. Server-Gruppe = Server-Reihenfolge
    unverändert, minus jede Zeile, deren `id` oder (nicht-null) `barcode` in
    der lokalen Gruppe vorkommt, danach auf `SERVER_RESULT_LIMIT` gekürzt.
    Ergebnis = lokal ++ Server.
12. **Konstanten**: `LOCAL_TOP_N = 5000`, `SERVER_RESULT_LIMIT = 20`,
    `MIN_SERVER_QUERY_LENGTH = 2` je einmal in
    `src/app/core/food-search.constants.ts` (vom Nutzer entschiedene
    Produktwerte, zwei Features). Technische Werte (Debounce, Zeitlimit,
    Seitengröße, Fingerabdruck-Größe, Abfrage-Limit, Schema) stehen in der
    jeweiligen Datei. `MIN_SERVER_QUERY_LENGTH` ist bewusst doppelt zur
    SQL-Regel in `search_foods` (ADR-0020 Punkt 4) — bei Änderung beide.
13. **Statuszeile**: `src/app/shared/ui/search-status-line/` — zustandslose
    Präsentation (Input Status-Summentyp + Ansage, Output `retry`), zwei
    Nutzer (Step A, M2). Kein Fehlerblock mehr für den Lokalbestand in
    beiden Sheets.

## Verhältnis zu bestehenden ADRs

- **ADR-0008 Punkt 3 / ADR-0012 Punkt 1**: abgelöst ist die Lade-Strategie
  („einmal je Sitzung alles laden, rein im Speicher filtern, kein Debounce").
  Fort gelten: ein Lesepfad in `core/foods.service.ts`, ein Cache,
  Schreibweg/OFF/Barcode in `food-search.service.ts`.
- **ADR-0016 Punkt 8**: abgelöst nur für den Food-Teil — der lokale Bestand
  wird nicht mehr „nur bei gescheiterter Abfrage gelesen", sondern ist der
  primäre Suchbestand. Weiterhin nie Schreibquelle (übertragen wird nur
  `food_id`). Tages-Schnappschuss unverändert.
- **ADR-0020**: Contract unverändert genutzt; Punkt 5 (Paging-Abbruch) hier
  in Punkt 5 präzisiert, nicht geändert.
- ADR-0010 Punkt 4 (Barcode-Lookup an der Datenbank) gilt unverändert.

## Konsequenzen

- Positiv: Kein Pfad lädt mehr den Gesamtbestand; Suche ab 1 Zeichen offline
  und ohne Netzaufruf; Step A und M2 teilen Regeln, Status und Konstanten
  ohne Feature-Import; der Offline-Puffer hängt nicht mehr am Zufall, ob ein
  Food im Speicher liegt.
- Negativ/Trade-off: Pro Sitzungsstart bis zu ~5 RPC-Seiten (nur bei
  Invalidierung) plus je eine paginierte Abfrage für Gemeinsam/Nutzer;
  die Gemeinsam-Abfrage ist ohne Teilindex ein Seq-Scan über `foods`
  (einmal je Sitzung, bewusst akzeptiert — ein Teilindex wäre ein eigenes
  Backend-Paket, falls messbar langsam). Ein neuer Import, der die 20
  beliebtesten Foods samt Zählern unverändert lässt, löst keinen
  Top-Neuladevorgang aus. Der Nutzer-Teil enthält auch nur ausgewählte, nie
  geloggte Foods. Bei häufigen Begriffen kann die Server-Gruppe trotz 50er
  Abfrage klein sein. Die Auffrischung beim Start kann lokale Zeilen einmalig
  umsortieren.
- Betrifft künftig: Jede neue Food-Suche nutzt `createHybridFoodSearch()`.
  Änderung von `LOCAL_TOP_N` lädt den Top-Teil beim nächsten Start neu.
  Änderung an der Rückgabeform der RPCs bricht diesen Pfad (ADR-0020).

## Alternativen (kurz)

- **Katalog-Versionsmarker vom Import (Tabelle/Spalte)** — verworfen:
  Schemaänderung in 002 für einen Zweck, den der Fingerabdruck ohne
  Migration abdeckt.
- **`count=estimated` als Fingerabdruck** — verworfen: ändert sich durch
  Autovacuum/Analyze ohne Import → unnötige Volllade-Vorgänge.
- **Hybrid-Logik je Feature-Store** — verworfen: zwei Implementierungen
  einer Regel, deren Gleichheit Akzeptanzkriterium ist.
- **Neuer `core/`-Dienst als Singleton** — verworfen: Step A und M2 brauchen
  je eigenen Query-/Antwortzustand.
- **Food-Schnappschuss als Feld in `CreateEntryInput`** — verworfen: ändert
  die Aufrufer-API von `EntriesService` (ADR-0016 Punkt 4).
