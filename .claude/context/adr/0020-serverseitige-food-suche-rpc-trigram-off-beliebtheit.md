# ADR-0020: Serverseitige Food-Suche — `pg_trgm`, Spalte `foods.off_popularity`, Lese-RPCs `search_foods`/`top_foods` als neues Persistenz-Pattern

- **Status**: accepted (löst das RPC-Verbot aus ADR-0012 Punkt 7 für **lesende** Funktionen ab und ersetzt den in ADR-0008 Punkt 3 benannten serverseitigen Ablösepfad — siehe „Verhältnis zu bestehenden ADRs")
- **Datum**: 2026-09-30
- **Bounded Context(s)**: `data-platform` (wirkt auf `food-catalog`, `meals`, `offline-sync`)
- **task_id**: `PO-2026-09-30-001` (Folgepakete `PO-2026-09-30-003` Hybrid-Suche, `PO-2026-09-30-002` DACH-Import)

## Kontext

`foods` soll durch einen DACH-Import aus Open Food Facts (Paket 002) auf
~300k Zeilen wachsen. Der heutige Lesepfad (`core/foods.service.ts`, ADR-0012
Punkt 1) lädt den **gesamten** Bestand je Sitzung und filtert im Speicher; er
ist zusätzlich am PostgREST-Zeilenlimit (1000) gekappt. ADR-0008 Punkt 3 hat
genau diesen Ablösepunkt benannt. Die Suche muss deshalb serverseitig laufen,
und die App braucht eine Abfrage, die nur die „wichtigsten" Foods für den
lokalen Bestand liefert (Paket 003).

Drei Festlegungen sind nach Import und Auslieferung von 003 teuer umkehrbar:
die Spalte, in die der Import die OFF-Beliebtheit schreibt (002 hängt daran),
die Signatur/Rückgabeform der Such-Funktion (003 baut dagegen) und die Regel,
wie eigene Nutzung in den Rang eingeht, ohne die Nutzung des anderen Nutzers
offenzulegen (Datenschutzgrenze aus ADR-0004).

Ist-Stand (geprüft 2026-09-30): Im Projekt existiert **keine** Postgres-
Funktion und keine Extension-Migration. `foods.source` ist in der
Basis-Migration **nullable** (der Client liest `null` als `'manual'`,
`core/foods.service.ts`). `entries` hat den Index `(user_id, date)`.

## Entscheidung

1. **Eine additive, idempotente Migration**
   `supabase/migrations/20260930090000_foods_search_trgm_popularity.sql`:
   `create extension if not exists pg_trgm with schema extensions`
   (Supabase-Standardschema für Extensions), GIN-Trigram-Index
   `foods_name_trgm_idx` auf `foods using gin (name gin_trgm_ops)`, Spalte,
   Index und beide Funktionen aus Punkt 2–5. Keine bestehende Migration wird
   editiert, kein bestehender Spaltenwert geändert.
2. **Spalte `foods.off_popularity integer not null default 0`**, `check
   (off_popularity >= 0)` als `foods_off_popularity_check`. Semantik: OFF
   `unique_scans_n`, **gemeinsam** für beide Nutzer. Der konstante Default
   füllt bestehende Zeilen ohne Umschreiben (Metadaten-Änderung ab PG 11) und
   gibt jedem neuen Food (manuell, Scan, Import) ohne Zutun des Aufrufers
   einen gültigen Wert. **Geschrieben wird sie ausschließlich vom Import
   (002)**; die App schreibt sie nie, auch nicht beim Scan-Insert. Sie ist
   kein Nährwert und kein Nutzerwert — die Sperre aus ADR-0011 Punkt 7
   (`is_corrected`) schützt sie **nicht**: Der Import darf `off_popularity`
   auch bei korrigierten Foods aktualisieren, aber in keinem Fall eine andere
   Spalte eines Foods mit `is_corrected = true`. Fehlt `unique_scans_n` in
   OFF, schreibt der Import `0`. Zusätzlicher Index
   `foods_off_popularity_idx on foods (off_popularity desc, id)` für Punkt 5.
3. **Lesende Postgres-Funktionen sind ab hier ein zulässiges
   Persistenz-Pattern — unter festen Regeln** (auch in
   `code-conventions.md`): `language sql`, `stable`, **`security invoker`**
   (nie `security definer`), `set search_path = public, extensions,
   pg_temp`, Parameter mit Präfix `p_`, `revoke execute … from public, anon`
   und `grant execute … to authenticated` (Supabase vergibt `execute` auf
   neue Funktionen sonst ausdrücklich auch an `anon`). Begründung: Ranking
   über Textübereinstimmung, eigene Nutzung und Beliebtheit ist über
   PostgREST-Filter nicht ausdrückbar, und ein Nachladen der Kandidaten in
   den Client ist genau das, was bei 300k Zeilen wegfallen muss. `security
   invoker` hält RLS als einzige Zugriffsgrenze (ADR-0004): Die Funktion
   sieht `entries` nur mit den Policies des Aufrufers. **Schreibende**
   Funktionen bleiben ausgeschlossen, bis ein eigenes ADR sie begründet.
4. **`search_foods(p_query text, p_limit integer default 20)`** — `returns
   table (id uuid, name text, barcode text, kcal_100g numeric, protein_100g
   numeric, carbs_100g numeric, fat_100g numeric, default_portion_g numeric,
   source text, is_corrected boolean, off_popularity integer, own_use_count
   integer)`, höchstens `p_limit` Zeilen, bereits fertig sortiert.
   - Eingabe: `trim(p_query)`, auf 100 Zeichen gekürzt; `%`, `_`, `\` werden
     für `LIKE` escaped. Leer, nur Leerzeichen, `null` oder **kürzer als 2
     Zeichen** → leere Menge, kein Fehler. `p_limit` `null` → 20, geklemmt
     auf 1..50.
   - Kandidaten, **ab 3 Zeichen**: `name ilike '%' || q || '%'` (Teilwort,
     case-insensitiv, trigram-indexgestützt).
     **Bei genau 2 Zeichen**: nur Wortanfänge — `name ilike q || '%'` oder
     `name ilike '% ' || q || '%'` oder `name ilike '%(' || q || '%'` oder
     `name ilike '%-' || q || '%'`. Grund: Aus einem 2-Zeichen-Teilwort
     (`'%ei%'`) extrahiert `pg_trgm` kein Trigramm, der Index greift nicht,
     die Suche wird zum Seq-Scan über ~300k Zeilen; ein Wortanfang liefert
     die Rand-Trigramme (`'  e'`, `' ei'`) und bleibt indexgestützt. Vom
     Nutzer bestätigt (Rückfrage aus PO-2026-09-30-001, Option
     „Wortanfänge bei 2 Zeichen, Teilwort ab 3").
   - Rang (`order by`, in dieser Reihenfolge):
     1. `prio`: `coalesce(source, 'manual') = 'manual' or is_corrected` zuerst
        (manuelle/korrigierte vor allen OFF-Foods).
     2. `text_tier` aufsteigend: 0 = `lower(name) = q`, 1 = Name beginnt mit
        `q`, 2 = ein Wort beginnt mit `q` (nach Leerzeichen, `(` oder `-`),
        3 = sonstiges Teilwort. „Vergleichbare Textübereinstimmung" heißt
        „gleiches `text_tier`".
     3. `own_use_count` absteigend: Anzahl der `entries` des **Aufrufers**
        mit diesem `food_id`, berechnet zur Abfragezeit aus `entries where
        user_id = auth.uid()` (plus RLS). Kein Zähler, keine Materialisierung,
        kein Trigger — damit wirkt ein neuer Eintrag spätestens bei der
        nächsten Suche, und die Nutzung des anderen Nutzers ist
        **strukturell** unsichtbar.
     4. `off_popularity` absteigend.
     5. `name` aufsteigend, dann `id` — deterministisch.
   - Keine Ähnlichkeitsfunktion (`similarity()`) im Rang: bei Kurz-Eingaben
     passt ein großer Teil des Bestands, und eine Trigramm-Berechnung je
     Kandidat wäre der teuerste Teil der Abfrage. Die vier `text_tier`-Stufen
     sind billige Stringvergleiche.
5. **`top_foods(p_limit integer)`** — gleiche Rückgabespalten wie
   `search_foods` **ohne** `own_use_count` (nutzerunabhängig: identisch für
   beide Nutzer), `order by off_popularity desc, id asc`, `limit
   greatest(p_limit, 0)`. Kein Filter auf `source` oder `off_popularity > 0`:
   Vor dem Import liefert sie damit den gesamten (kleinen) Bestand. Das
   PostgREST-Limit (`max_rows` 1000) wirkt **auch auf RPC-Ergebnisse**; der
   Aufrufer (003) holt die N Zeilen deshalb seitenweise per Range
   (`.range(from, from + 999)` auf den `rpc`-Aufruf) mit derselben stabilen
   Sortierung, bis eine Seite kürzer als 1000 ist oder N erreicht ist. Die
   Funktion selbst kappt nie unter `p_limit`.
6. **Prüfabfrage als eigene Datei**
   `supabase/checks/20260930090000_foods_search_explain.sql` (neu,
   `code-conventions.md`): `explain (analyze, buffers)` des
   **Kandidaten-Prädikats** für `'joghurt'` und `'ei'`, einmal regulär und
   einmal in `begin; set local enable_seqscan = off; … rollback;`. Grund:
   Ein `explain` auf `select * from search_foods(…)` zeigt nur einen
   `Function Scan` und beweist nichts; und vor dem Import ist `foods` so
   klein, dass der Planer korrekt einen Seq-Scan wählt — der zweite Lauf
   zeigt dann, dass der Index **benutzbar** ist. Das Prädikat in der
   Prüfdatei und in der Funktion ist wortgleich zu halten (Kommentar an
   beiden Stellen).
7. **Nicht-Ziele**: keine Akzent-/Umlaut-Faltung (`unaccent`), keine
   Mehrwort-UND-Suche, kein Volltext (`tsvector`), kein Schreibweg für
   `off_popularity` in der App, keine Änderung an `foods`-Policies.

## Nachtrag 2026-10-01 — Messwerte nach dem DACH-Import (PO-2026-09-30-002)

Signatur, Rückgabeform und Rang aus Punkt 4/5 sind **unverändert**; ergänzt
werden Umsetzungsregel und Messwerte.

- **Zu Punkt 4, Kandidatenmenge als zwei `union all`-Zweige**: ein Zweig
  nur für Länge 2 (Wortanfänge), ein Zweig nur für Länge ≥ 3 (Teilwort),
  jeweils über die Längenbedingung ausgeschlossen. Grund (gemessen auf
  261k Zeilen): Ein einziges Prädikat mit `or` über beide Fälle ließ den
  Planer bei 2 Zeichen den Trigram-Index vollständig abarbeiten (~1,2 s);
  mit getrennten Zweigen 9–24 ms. Ein künftiger Umbau, der die Zweige
  wieder zu einem `or` zusammenfasst, ist eine Regression. Die Prüfdatei
  (Punkt 6) prüft die Prädikate beider Zweige wortgleich.
- **Zu Punkt 5**: `top_foods(null)` liefert 0 Zeilen (`limit
  greatest(null, 0)` → `limit 0`); bestätigt, kein Fehler.
- **Speicher (korrigiert die Schätzung unter „Konsequenzen")**: gemessen
  nach Import von 261.399 Zeilen Tabelle 36 MB, Trigram-Index 25 MB, alle
  Indizes zusammen 59 MB — deutlich unter den geschätzten ~120 MB, weit
  unter dem Free-Plan-Limit von 500 MB.

## Verhältnis zu bestehenden ADRs

- **ADR-0012 Punkt 7**: Die *Entscheidung* (Mahlzeit speichern per
  Zwei-Schritt mit Kompensation) gilt fort. Abgelöst ist nur die dort und in
  „Alternativen" genannte Begründung „RPC wäre ein neues Persistenz-Pattern"
  — für **lesende** Funktionen gilt ab hier Punkt 3. Ein Umbau des
  Mahlzeit-Speicherns auf eine Funktion bräuchte weiterhin ein eigenes ADR
  (schreibend).
- **ADR-0008 Punkt 3** (Ablösepfad „serverseitiges `ilike` mit Debounce"):
  serverseitig ersetzt durch Punkt 4 dieses ADR. Die **clientseitige**
  Ablösung (Lade-Strategie „einmal je Sitzung alles laden", Ort des lokalen
  Bestands, Debounce, Zusammenführung lokal/Server) entscheidet Paket 003 in
  einem eigenen ADR (vorgesehen: ADR-0021); bis dahin gilt ADR-0012 Punkt 1
  unverändert.
- **ADR-0014 Punkt 5** („keine View/RPC" für `stats`) bleibt: Das war eine
  Entscheidung für jenen Lesepfad, kein Projektverbot, und wird hier nicht
  angefasst.
- ADR-0004, ADR-0010 Punkt 5, ADR-0011 gelten unverändert.

## Konsequenzen

- Positiv: Suche bleibt bei ~300k Zeilen indexgestützt; 003 und 002 haben
  eine feste Schnittstelle (Spaltenname, Signaturen, Rückgabeform). Die
  Nutzungsgrenze zwischen den Nutzern liegt in RLS, nicht in Funktionslogik.
- Negativ/Trade-off: Die Such-Logik liegt erstmals in SQL statt in
  testbarem TypeScript; ohne Supabase-CLI (ADR-0004) gibt es keine
  automatisierten SQL-Tests — Verifikation über die Prüfdatei und manuelle
  Abfragen des Nutzers. Wegen `set search_path` wird die Funktion nicht
  geinlined (deshalb Punkt 6). `create or replace` kann den Rückgabetyp
  nicht ändern: Eine spätere Änderung der Rückgabespalten braucht `drop
  function if exists` in einer neuen Migration und ist ein Contract-Bruch
  für 003. Speicher (Free Plan 500 MB): geschätzt ~55 MB Tabelle + ~40 MB
  Trigram-Index + ~25 MB übrige Indizes bei 300k Zeilen — **überholt durch
  Messung, siehe Nachtrag 2026-10-01** (36 MB Tabelle, 59 MB Indizes).
- Betrifft künftig: 002 schreibt `off_popularity` gemäß Punkt 2 und darf
  den Trigram-Index für den Massenimport nicht löschen, ohne ihn in
  derselben Datei wieder anzulegen. 003 ruft beide Funktionen nur aus dem
  Food-Lesedienst auf (Ort entscheidet das ADR von 003).

## Alternativen (kurz)

- **Serverseitiges `ilike` direkt über PostgREST** (ADR-0008 Punkt 3) —
  verworfen: Ranking nach eigener Nutzung und Beliebtheit ist als
  PostgREST-Filter nicht ausdrückbar.
- **`security definer` mit explizitem `auth.uid()`-Filter** — verworfen:
  umgeht RLS; ein Fehler in der Funktion legte die Nutzung des anderen
  Nutzers offen.
- **Materialisierter Nutzungszähler (Spalte/Tabelle + Trigger)** —
  verworfen: neues schreibendes Pattern, Zählerdrift, und „spätestens bei
  der nächsten Suche" ist mit Abfragezeit-Aggregation ohnehin erfüllt.
- **Volltext (`tsvector`)** — verworfen: findet keine Teilwörter
  (`joghurt` in `Naturjoghurt`).
- **Top-N als einzelne JSON-Zeile (`json_agg`)** — verworfen zugunsten
  typisierter Zeilen und Range-Paging, das PostgREST für genau diesen Zweck
  vorsieht.
