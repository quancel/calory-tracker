-- Neue Tabelle weight_logs: eine Gewichtsmessung je Nutzer und Kalendertag
-- (ADR-0017 Punkt 2, gilt laut ADR-0018 Punkt 0 wörtlich fort).
-- Additiv, editiert keine bestehende Migration. Idempotent formuliert:
-- wiederholtes Einspielen ist unschädlich.

create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Genau ein Gewichtswert je Kalendertag; geschrieben wird per Upsert mit
-- onConflict: 'user_id,date' (ADR-0017 Punkt 2). Der Unique-Constraint
-- erzeugt zugleich den einzigen benötigten Index -- kein zusätzlicher.
alter table weight_logs
  drop constraint if exists weight_logs_user_id_date_key;
alter table weight_logs
  add constraint weight_logs_user_id_date_key unique (user_id, date);

-- Wertebereich als check-Constraint (ADR-0004 Punkt 3), bewusste Doppelung
-- zur Client-Validierung in goals/weight.calculations.ts (ADR-0017 Punkt 2):
-- 20-400 kg und höchstens eine Nachkommastelle.
alter table weight_logs drop constraint if exists weight_logs_weight_kg_range;
alter table weight_logs add constraint weight_logs_weight_kg_range
  check (
    weight_kg >= 20.0
    and weight_kg <= 400.0
    and weight_kg = round(weight_kg, 1)
  );

alter table weight_logs enable row level security;

drop policy if exists weight_logs_select on weight_logs;
create policy weight_logs_select on weight_logs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists weight_logs_insert on weight_logs;
create policy weight_logs_insert on weight_logs
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists weight_logs_update on weight_logs;
create policy weight_logs_update on weight_logs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists weight_logs_delete on weight_logs;
create policy weight_logs_delete on weight_logs
  for delete
  to authenticated
  using (user_id = auth.uid());
