-- Basis-Migration: Schema und Row Level Security für data-platform.
-- Siehe ADR-0004 (Postgres-Schema, RLS-Pattern, Migrations-Workflow).
-- Idempotent formuliert: wiederholtes Einspielen ist unschädlich.

-- =========================================================================
-- foods: gemeinsamer Bestand beider Nutzer (lesen und schreiben)
-- =========================================================================

create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  barcode text unique,
  kcal_100g numeric not null check (kcal_100g >= 0),
  protein_100g numeric not null check (protein_100g >= 0),
  carbs_100g numeric not null check (carbs_100g >= 0),
  fat_100g numeric not null check (fat_100g >= 0),
  default_portion_g numeric,
  source text check (source in ('off', 'manual')),
  is_corrected boolean not null default false,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table foods enable row level security;

drop policy if exists foods_select on foods;
create policy foods_select on foods
  for select
  to authenticated
  using (true);

drop policy if exists foods_insert on foods;
create policy foods_insert on foods
  for insert
  to authenticated
  with check (true);

drop policy if exists foods_update on foods;
create policy foods_update on foods
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists foods_delete on foods;
create policy foods_delete on foods
  for delete
  to authenticated
  using (true);

-- =========================================================================
-- entries: strikt nutzergebunden
-- =========================================================================

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references foods(id) on delete restrict,
  amount_g numeric not null check (amount_g > 0),
  created_at timestamptz not null default now()
);

create index if not exists entries_user_id_date_idx on entries (user_id, date);

alter table entries enable row level security;

drop policy if exists entries_select on entries;
create policy entries_select on entries
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists entries_insert on entries;
create policy entries_insert on entries
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists entries_update on entries;
create policy entries_update on entries
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists entries_delete on entries;
create policy entries_delete on entries
  for delete
  to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- meals: strikt nutzergebunden
-- =========================================================================

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table meals enable row level security;

drop policy if exists meals_select on meals;
create policy meals_select on meals
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists meals_insert on meals;
create policy meals_insert on meals
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists meals_update on meals;
create policy meals_update on meals
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists meals_delete on meals;
create policy meals_delete on meals
  for delete
  to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- meal_items: keine eigene user_id, Bindung über meals (Elternsatz)
-- =========================================================================

create table if not exists meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid references meals(id) on delete cascade,
  food_id uuid references foods(id) on delete restrict,
  amount_g numeric not null check (amount_g > 0)
);

create index if not exists meal_items_meal_id_idx on meal_items (meal_id);

alter table meal_items enable row level security;

drop policy if exists meal_items_select on meal_items;
create policy meal_items_select on meal_items
  for select
  to authenticated
  using (
    exists (
      select 1 from meals m
      where m.id = meal_items.meal_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists meal_items_insert on meal_items;
create policy meal_items_insert on meal_items
  for insert
  to authenticated
  with check (
    exists (
      select 1 from meals m
      where m.id = meal_items.meal_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists meal_items_update on meal_items;
create policy meal_items_update on meal_items
  for update
  to authenticated
  using (
    exists (
      select 1 from meals m
      where m.id = meal_items.meal_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from meals m
      where m.id = meal_items.meal_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists meal_items_delete on meal_items;
create policy meal_items_delete on meal_items
  for delete
  to authenticated
  using (
    exists (
      select 1 from meals m
      where m.id = meal_items.meal_id
        and m.user_id = auth.uid()
    )
  );

-- =========================================================================
-- goals: eine Zeile je Nutzer, keine Historisierung (user-bestätigt)
-- =========================================================================

create table if not exists goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kcal numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  updated_at timestamptz not null default now()
);

alter table goals enable row level security;

drop policy if exists goals_select on goals;
create policy goals_select on goals
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists goals_insert on goals;
create policy goals_insert on goals
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists goals_update on goals;
create policy goals_update on goals
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists goals_delete on goals;
create policy goals_delete on goals
  for delete
  to authenticated
  using (user_id = auth.uid());
