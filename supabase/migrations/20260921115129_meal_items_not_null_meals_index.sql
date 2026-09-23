-- Härtet das Schema für gespeicherte Mahlzeiten, solange beide Tabellen noch
-- leer sind (ADR-0012 Punkt 10, verfeinert meals/meal_items aus ADR-0004).
-- Additiv, editiert die Basis-Migration 20260920161132 nicht. Idempotent
-- formuliert, soweit die jeweilige DDL das zulässt (siehe Kommentare unten).

-- meal_items.meal_id und meal_items.food_id waren in der Basis-Migration
-- nullable. Beide Fremdschlüssel sind fachlich immer gesetzt -- eine
-- Position ohne Mahlzeit oder ohne Food kann im Produktcode nicht entstehen.
-- `alter column ... set not null` ist bereits idempotent (Postgres meldet
-- keinen Fehler, wenn die Spalte schon not null ist).
alter table meal_items alter column meal_id set not null;
alter table meal_items alter column food_id set not null;

-- Index auf meals(user_id) fuer den Mahlzeiten-Lesepfad (core/meals.service.ts,
-- ADR-0012 Punkt 3) -- analog zu entries_user_id_date_idx und
-- meal_items_meal_id_idx aus der Basis-Migration.
create index if not exists meals_user_id_idx on meals (user_id);
