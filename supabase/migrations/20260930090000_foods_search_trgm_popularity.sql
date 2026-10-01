-- Suchfundament für foods (PO-2026-09-30-001, ADR-0020).
-- Additiv und idempotent: wiederholtes Einspielen ist unschädlich.
-- Prüfabfragen dazu: supabase/checks/20260930090000_foods_search_explain.sql
--
-- Inhalt:
--   1. Extension pg_trgm (Schema extensions, Supabase-Standard)
--   2. foods.off_popularity (OFF unique_scans_n, vom Import gefüllt, ADR-0020 Punkt 2)
--   3. Indizes: Trigram auf foods.name, Beliebtheit für top_foods
--   4. Lese-RPCs search_foods / top_foods (security invoker, RLS bleibt die Grenze)

-- =========================================================================
-- 1. Extension
-- =========================================================================

create extension if not exists pg_trgm with schema extensions;

-- =========================================================================
-- 2. foods.off_popularity
-- =========================================================================
-- Gemeinsamer Wert für beide Nutzer. Geschrieben wird er nur vom Import
-- (Paket 002), nie von der App. not null default 0: bestehende Zeilen und
-- App-Inserts bleiben unverändert gültig.

alter table public.foods
  add column if not exists off_popularity integer not null default 0;

alter table public.foods
  drop constraint if exists foods_off_popularity_check;
alter table public.foods
  add constraint foods_off_popularity_check check (off_popularity >= 0);

-- =========================================================================
-- 3. Indizes
-- =========================================================================

create index if not exists foods_name_trgm_idx
  on public.foods using gin (name extensions.gin_trgm_ops);

create index if not exists foods_off_popularity_idx
  on public.foods (off_popularity desc, id);

-- =========================================================================
-- 4. Lese-Funktionen
-- =========================================================================

-- search_foods: Teilwort-Suche mit Rang (ADR-0020 Punkt 4).
--   * Eingabe: trim, auf 100 Zeichen gekürzt, %, _, \ für LIKE escaped.
--     Kürzer als 2 Zeichen, leer oder null -> leere Menge.
--   * Ab 3 Zeichen Teilwort (ilike '%q%'); bei genau 2 Zeichen nur
--     Wortanfänge (sonst liefert pg_trgm kein Trigramm -> Seq-Scan).
--   * Rang: manuell/korrigiert vor OFF; text_tier (0 gleich, 1 Name beginnt
--     mit, 2 Wort beginnt mit, 3 Teilwort); own_use_count des AUFRUFERS
--     (aus entries + RLS, zur Abfragezeit); off_popularity; name; id.
--   * source null zählt als manuell (wie im Client).
-- Das Kandidaten-Prädikat (CTEs params + hits) ist wortgleich in
-- supabase/checks/20260930090000_foods_search_explain.sql zu halten.
create or replace function public.search_foods(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  name text,
  barcode text,
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  default_portion_g numeric,
  source text,
  is_corrected boolean,
  off_popularity integer,
  own_use_count integer
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with params as (
    select
      lower(left(btrim(coalesce(p_query, '')), 100)) as q,
      replace(replace(replace(lower(left(btrim(coalesce(p_query, '')), 100)),
        '\', '\\'), '%', '\%'), '_', '\_') as esc,
      char_length(left(btrim(coalesce(p_query, '')), 100)) as len
  ),
  own as (
    select e.food_id, count(*)::integer as n
    from public.entries e
    where e.user_id = (select auth.uid())
      and e.food_id is not null
    group by e.food_id
  ),
  -- Kandidaten-Prädikat: zwei getrennte Zweige mit eigener Längenbedingung
  -- (union all, nie ein einziges OR). Mit p_query als Parameter kennt der Planer
  -- die Länge nicht; in einem OR würde der Zweig '%q%' auch bei 2 Zeichen in den
  -- BitmapOr geraten und den Index vollständig lesen (gemessen: ~1,2 s statt
  -- ~60 ms bei ~260k Zeilen). So gibt eine One-Time-Filter-Bedingung je Zweig
  -- den nicht zutreffenden Zweig frei. (hits trägt die Zeilen selbst, kein Rück-Join
  -- auf foods: der wurde als Hash Join über die ganze Tabelle geplant.)
  hits as (
    select f.*
    from params p
    cross join public.foods f
    where p.len >= 3
      and f.name ilike '%' || p.esc || '%'
    union all
    select f.*
    from params p
    cross join public.foods f
    where p.len = 2
      and (
        f.name ilike p.esc || '%'
        or f.name ilike '% ' || p.esc || '%'
        or f.name ilike '%(' || p.esc || '%'
        or f.name ilike '%-' || p.esc || '%'
      )
  ),
  cand as (
    select
      f.id, f.name, f.barcode, f.kcal_100g, f.protein_100g, f.carbs_100g,
      f.fat_100g, f.default_portion_g, f.source, f.is_corrected,
      f.off_popularity,
      coalesce(o.n, 0) as own_use_count,
      (coalesce(f.source, 'manual') = 'manual' or f.is_corrected) as prio,
      case
        when lower(f.name) = p.q then 0
        when f.name ilike p.esc || '%' then 1
        when f.name ilike '% ' || p.esc || '%'
          or f.name ilike '%(' || p.esc || '%'
          or f.name ilike '%-' || p.esc || '%' then 2
        else 3
      end as text_tier
    from hits f
    cross join params p
    left join own o on o.food_id = f.id
  )
  select
    c.id, c.name, c.barcode, c.kcal_100g, c.protein_100g, c.carbs_100g,
    c.fat_100g, c.default_portion_g, c.source, c.is_corrected,
    c.off_popularity, c.own_use_count
  from cand c
  order by
    c.prio desc,
    c.text_tier asc,
    c.own_use_count desc,
    c.off_popularity desc,
    c.name asc,
    c.id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- top_foods: die p_limit beliebtesten Foods (nutzerunabhängig, ADR-0020
-- Punkt 5). Kein Filter auf source/off_popularity. PostgREST kappt auch
-- RPC-Ergebnisse bei max_rows (1000): der Aufrufer holt seitenweise per
-- .range() mit derselben stabilen Sortierung. p_limit null -> 0 Zeilen.
create or replace function public.top_foods(p_limit integer)
returns table (
  id uuid,
  name text,
  barcode text,
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  default_portion_g numeric,
  source text,
  is_corrected boolean,
  off_popularity integer
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    f.id, f.name, f.barcode, f.kcal_100g, f.protein_100g, f.carbs_100g,
    f.fat_100g, f.default_portion_g, f.source, f.is_corrected,
    f.off_popularity
  from public.foods f
  order by f.off_popularity desc, f.id asc
  limit greatest(coalesce(p_limit, 0), 0)
$$;

-- Supabase vergibt execute auf neue Funktionen sonst auch an anon.
revoke execute on function public.search_foods(text, integer) from public, anon;
grant execute on function public.search_foods(text, integer) to authenticated;
revoke execute on function public.top_foods(integer) from public, anon;
grant execute on function public.top_foods(integer) to authenticated;
