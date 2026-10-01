-- Prüfabfragen zur Migration 20260930090000_foods_search_trgm_popularity.sql
-- (PO-2026-09-30-001, ADR-0020 Punkt 6). KEINE Migration — nie unter
-- supabase/migrations/ ablegen. Rein lesend bzw. in begin ... rollback.
--
-- Warum nicht `explain select * from search_foods(...)`: das zeigt nur einen
-- "Function Scan" und beweist nichts über den Index. Geprüft wird deshalb das
-- KANDIDATEN-PRÄDIKAT aus dem Funktionsrumpf von search_foods
-- (CTEs params + hits). Es ist hier WORTGLEICH zum Funktionsrumpf in
-- supabase/migrations/20260930090000_foods_search_trgm_popularity.sql
-- gehalten; nur p_query ist durch ein Literal ersetzt und die Select-Liste der
-- Zweige auf f.id gekürzt (im Funktionsrumpf f.*). Ändert sich eines von
-- beiden, muss das andere nachgezogen werden.
--
-- Lesehilfe:
--   * Lauf 1 (regulär): Vor dem Import ist foods klein, der Planer wählt zu
--     Recht "Seq Scan". Nach dem Import (~300k Zeilen) soll hier "Bitmap Index
--     Scan on foods_name_trgm_idx" stehen.
--   * Lauf 2 (enable_seqscan = off): zeigt, dass der Index BENUTZBAR ist —
--     "Bitmap Index Scan on foods_name_trgm_idx" muss auch bei kleinem foods
--     erscheinen. Bei 'ei' (2 Zeichen, nur Wortanfänge) ebenfalls; ein
--     Teilwort-Muster '%ei%' würde hier einen Seq-Scan erzwingen.
--   * Im SQL Editor läuft alles als Rolle postgres: RLS greift nicht und
--     auth.uid() ist null, own_use_count der Kontroll-selects ist deshalb 0.

-- =========================================================================
-- A. explain, regulär
-- =========================================================================

-- A1: 'joghurt' (>= 3 Zeichen: Teilwort)
explain (analyze, buffers)
with params as (
  select
    lower(left(btrim(coalesce('joghurt'::text, '')), 100)) as q,
    replace(replace(replace(lower(left(btrim(coalesce('joghurt'::text, '')), 100)),
      '\', '\\'), '%', '\%'), '_', '\_') as esc,
    char_length(left(btrim(coalesce('joghurt'::text, '')), 100)) as len
)
select f.id
from params p
cross join public.foods f
where p.len >= 3
  and f.name ilike '%' || p.esc || '%'
union all
select f.id
from params p
cross join public.foods f
where p.len = 2
  and (
    f.name ilike p.esc || '%'
    or f.name ilike '% ' || p.esc || '%'
    or f.name ilike '%(' || p.esc || '%'
    or f.name ilike '%-' || p.esc || '%'
  );

-- A2: 'ei' (genau 2 Zeichen: nur Wortanfänge)
explain (analyze, buffers)
with params as (
  select
    lower(left(btrim(coalesce('ei'::text, '')), 100)) as q,
    replace(replace(replace(lower(left(btrim(coalesce('ei'::text, '')), 100)),
      '\', '\\'), '%', '\%'), '_', '\_') as esc,
    char_length(left(btrim(coalesce('ei'::text, '')), 100)) as len
)
select f.id
from params p
cross join public.foods f
where p.len >= 3
  and f.name ilike '%' || p.esc || '%'
union all
select f.id
from params p
cross join public.foods f
where p.len = 2
  and (
    f.name ilike p.esc || '%'
    or f.name ilike '% ' || p.esc || '%'
    or f.name ilike '%(' || p.esc || '%'
    or f.name ilike '%-' || p.esc || '%'
  );

-- =========================================================================
-- B. explain mit enable_seqscan = off (Index benutzbar?)
-- =========================================================================

begin;
set local enable_seqscan = off;

-- B1: 'joghurt'
explain (analyze, buffers)
with params as (
  select
    lower(left(btrim(coalesce('joghurt'::text, '')), 100)) as q,
    replace(replace(replace(lower(left(btrim(coalesce('joghurt'::text, '')), 100)),
      '\', '\\'), '%', '\%'), '_', '\_') as esc,
    char_length(left(btrim(coalesce('joghurt'::text, '')), 100)) as len
)
select f.id
from params p
cross join public.foods f
where p.len >= 3
  and f.name ilike '%' || p.esc || '%'
union all
select f.id
from params p
cross join public.foods f
where p.len = 2
  and (
    f.name ilike p.esc || '%'
    or f.name ilike '% ' || p.esc || '%'
    or f.name ilike '%(' || p.esc || '%'
    or f.name ilike '%-' || p.esc || '%'
  );

-- B2: 'ei'
explain (analyze, buffers)
with params as (
  select
    lower(left(btrim(coalesce('ei'::text, '')), 100)) as q,
    replace(replace(replace(lower(left(btrim(coalesce('ei'::text, '')), 100)),
      '\', '\\'), '%', '\%'), '_', '\_') as esc,
    char_length(left(btrim(coalesce('ei'::text, '')), 100)) as len
)
select f.id
from params p
cross join public.foods f
where p.len >= 3
  and f.name ilike '%' || p.esc || '%'
union all
select f.id
from params p
cross join public.foods f
where p.len = 2
  and (
    f.name ilike p.esc || '%'
    or f.name ilike '% ' || p.esc || '%'
    or f.name ilike '%(' || p.esc || '%'
    or f.name ilike '%-' || p.esc || '%'
  );

rollback;

-- =========================================================================
-- C. Kontroll-selects (Funktionen liefern, Sortierung stimmt)
-- =========================================================================

-- Treffer vor allen OFF-Foods: manuell/korrigiert zuerst, dann text_tier.
select name, source, is_corrected, off_popularity, own_use_count
from public.search_foods('joghurt', 10);

-- Zwei Zeichen: nur Wortanfänge. Ein Name wie 'Dreieck' darf nicht erscheinen.
select name from public.search_foods('ei', 10);

-- Eingabegrenzen: je 0 Zeilen (1 Zeichen, nur Leerzeichen, null, Platzhalter).
select (select count(*) from public.search_foods('e')) as ein_zeichen,
       (select count(*) from public.search_foods('   ')) as nur_leerzeichen,
       (select count(*) from public.search_foods(null)) as null_eingabe,
       (select count(*) from public.search_foods('%%%')) as platzhalter;

-- top_foods: nach off_popularity absteigend, id aufsteigend.
select name, off_popularity from public.top_foods(5);

-- Rechte: authenticated ja, anon und public nein (zwei Zeilen je Funktion
-- erwartet: postgres und authenticated).
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('search_foods', 'top_foods')
order by routine_name, grantee;

-- =========================================================================
-- D. Größen (Free Plan: 500 MB; Schätzung bei 300k Zeilen ~55 MB Tabelle,
--    ~40 MB Trigram-Index, ~25 MB übrige Indizes)
-- =========================================================================

select count(*) as foods_zeilen,
       count(*) filter (where off_popularity > 0) as mit_beliebtheit
from public.foods;

select pg_size_pretty(pg_table_size('public.foods')) as tabelle,
       pg_size_pretty(pg_indexes_size('public.foods')) as indizes_gesamt,
       pg_size_pretty(pg_relation_size('public.foods_name_trgm_idx')) as trigram_index,
       pg_size_pretty(pg_relation_size('public.foods_off_popularity_idx')) as beliebtheits_index,
       pg_size_pretty(pg_database_size(current_database())) as datenbank_gesamt;

select indexrelid::regclass as index, indisvalid as gueltig
from pg_index
where indrelid = 'public.foods'::regclass
  and indexrelid::regclass::text in ('foods_name_trgm_idx', 'foods_off_popularity_idx');
