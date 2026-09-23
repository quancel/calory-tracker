# ADR-0004: Postgres-Schema, RLS-Pattern und Migrations-Workflow

- **Status**: accepted
- **Datum**: 2026-09-20
- **Bounded Context(s)**: `data-platform` (wirkt auf `diary`, `food-catalog`, `meals`, `goals`, `stats`)
- **task_id**: `PO-2026-09-20-003`

## Kontext

Paket 003 legt den Bounded Context `data-platform` erstmals an: Vor diesem
Paket existiert **kein** `supabase/`-Verzeichnis im Repo und keine Tabelle.
Alle datenführenden Folgepakete (Tagesansicht, Foods, Mahlzeiten, Ziele,
Verlauf) greifen laut Context-Map direkt per PostgREST unter RLS zu — es gibt
keinen eigenen API-Server, der eine falsche Schema-Entscheidung später
abfedern könnte. Drei Punkte sind teuer umkehrbar, sobald echte Daten
liegen: die Form der fünf Tabellen, das Muster, nach dem RLS den Zugriff
bindet (besonders bei `meal_items`, das keine eigene `user_id` hat), und die
Frage, womit Migrationen angewendet werden.

## Entscheidung

1. **Fünf Tabellen in einer Basis-Migration**, Form wie in `project.md`
   vorgegeben: `foods`, `entries`, `meals`, `meal_items`, `goals`. Schlüssel
   sind `uuid` mit `default gen_random_uuid()`; Ausnahme `goals`, dessen
   Primärschlüssel die `user_id` selbst ist (genau eine Zielzeile je Nutzer,
   **keine** Historisierung).
2. **Nutzerbezug** überall als `uuid references auth.users(id) on delete
   cascade`. Nährwerte werden ausschließlich pro 100 g gespeichert; es gibt
   keine berechneten kcal-/Makro-Spalten — Umrechnung passiert im Frontend.
3. **Wertebereiche als `check`-Constraints, nicht als Postgres-`enum`-Typen**
   (`source in ('off','manual')`, `meal_type in
   ('breakfast','lunch','dinner','snack')`). Ein Wert lässt sich damit per
   neuer Migration ändern, ohne `alter type` und ohne dass PostgREST-Clients
   einen benutzerdefinierten Typ kennen müssen.
4. **RLS-Pattern**, auf allen fünf Tabellen aktiviert, je vier Policies
   (select/insert/update/delete):
   - `entries`, `meals`, `goals`: direkt `user_id = auth.uid()` (bei
     `insert` als `with check`).
   - `meal_items`: **kein** eigenes `user_id`-Feld, sondern Bindung über den
     Elternsatz — `exists (select 1 from meals m where m.id =
     meal_items.meal_id and m.user_id = auth.uid())`. Die Tabelle wird
     dadurch nicht denormalisiert, und die Zugehörigkeit kann nicht von der
     des Parents abweichen.
   - `foods`: gemeinsamer Bestand — alle vier Policies gelten für Rolle
     `authenticated` ohne `user_id`-Bedingung. `created_by` ist reine
     Herkunftsinformation (`default auth.uid()`), **keine** Zugriffsgrenze.
5. **Fremdschlüssel auf `foods` sind `on delete restrict`** (`entries.food_id`,
   `meal_items.food_id`). Foods sind gemeinsam editierbar; ein Löschen darf
   keine fremden Tagesdaten entwerten. `meal_items.meal_id` dagegen ist
   `on delete cascade` (echte Komposition).
6. **Migrations-Workflow**: SQL-Dateien unter
   `supabase/migrations/<YYYYMMDDHHMMSS>_<beschreibung>.sql`, additiv und
   nach dem Commit unveränderlich. Die Benennung ist CLI-kompatibel, aber es
   wird **keine** Supabase-CLI-Abhängigkeit ins Projekt aufgenommen: Der
   dokumentierte Weg ist das Einspielen im SQL-Editor des Dashboards in
   Dateireihenfolge, optional `supabase db push` mit global installierter
   CLI. Jede Migration ist deshalb mit `if not exists` / `drop policy if
   exists` wiederholbar formuliert.
7. **Indizes** nur dort, wo eine Abfrage sie sicher braucht:
   `entries(user_id, date)` für die Tagesansicht, `foods(barcode)` ergibt
   sich aus dem Unique-Constraint, `meal_items(meal_id)` für das Laden einer
   Mahlzeit.

## Konsequenzen

- Positiv: Folgepakete finden ein vollständiges, RLS-gesichertes Schema vor
  und brauchen für Standardfälle keine eigene Migration. Der Schutz liegt in
  der Datenbank, nicht in Frontend-Filtern — ein vergessenes
  `.eq('user_id', …)` im Client führt nicht zu Datenabfluss.
- Negativ/Trade-off: `goals` ohne Historie bedeutet, dass eine spätere
  Verlaufsdarstellung „Ziel zum damaligen Zeitpunkt" nicht rekonstruierbar
  ist; `on delete restrict` macht das Löschen benutzter Foods für den Nutzer
  spürbar (Fehlermeldung statt stiller Löschung). Ohne CLI-Abhängigkeit gibt
  es keine automatische Prüfung, ob eine Umgebung alle Migrationen hat.
- Betrifft künftig: Jedes Paket mit Schemabedarf (005 Ziele, 015 Gewichtslog)
  liefert eine **eigene neue** Migration und editiert diese Basis-Migration
  nicht. Eine neue Tabelle ohne RLS-Policies in derselben Migration ist ein
  Verstoß gegen `code-conventions.md`. Eine Historisierung von `goals` oder
  eine Abkehr vom `restrict` braucht ein ablösendes ADR.

## Alternativen (kurz)

- `user_id` zusätzlich in `meal_items` denormalisieren (einfachere Policy) —
  verworfen, weil der Wert vom Parent abweichen könnte und dann zwei
  Wahrheiten über die Zugehörigkeit existieren.
- Postgres-`enum`-Typen für `source`/`meal_type` — verworfen: teurere
  Änderung per Migration, ohne Gewinn bei nur zwei Nutzern.
- Supabase-CLI als devDependency mit lokalem Docker-Stack — verworfen als
  Over-Engineering für ein Zwei-Nutzer-Projekt mit einem einzigen
  Remote-Projekt.
- Ein `nutrition_per_100g`-JSONB-Feld statt vier Spalten — verworfen: keine
  Typsicherheit, keine Constraints, schlechtere Aggregierbarkeit im Verlauf.
