# Kalorientracker

Kalorien- und Makro-Tracker als PWA für zwei Nutzer (privat, nicht
kommerziell). Angular mit Standalone Components und Signals, kein NgRx.
Details zu Architektur und Design: `.claude/context/` (Context-Map, ADRs,
Design-Konzept, Design-Konventionen, Code-Konventionen).

## Voraussetzungen

- **Node.js**: `^20.19.0 || ^22.12.0 || >=24.0.0` (Anforderung von
  Angular CLI 22). Getestet mit Node 22.23.1.
- **npm**: ab Version 11 empfohlen. Ältere npm-10-Versionen können beim
  Installieren an einem bekannten Arborist-Bug scheitern
  (`Cannot read properties of null (reading 'edgesOut')`) — in dem Fall
  `npm install -g npm@latest` und erneut versuchen.

## Installation

```bash
npm install
```

## Entwicklung

```bash
npm start
```

Startet den Dev-Server unter `http://localhost:4200/`. Der Service Worker
ist im Dev-Server bewusst deaktiviert (siehe ADR-0002) — Änderungen greifen
sofort, ohne Cache-Altlasten.

## Tests

```bash
npm test
```

Führt die Unit-Tests einmalig mit Vitest aus (`ng test --watch=false`).

## Build

```bash
npm run build
```

Erstellt den Produktions-Build nach `dist/calory-tracker/`. Nur im
Produktions-Build wird der Service Worker (`@angular/service-worker`)
registriert und liefert App-Shell + Manifest + Icons für die
Installierbarkeit als PWA (siehe ADR-0002).

## Umgebungsvariablen

Die App braucht die Supabase-URL und den Anon-Key des Projekts, um sich
gegen Supabase Auth/PostgREST anzumelden (siehe ADR-0003). Konfiguration
über `src/environments/`, keine Secrets im Repo:

1. `src/environments/environment.example.ts` ist committet (Platzhalter).
   `src/environments/environment.ts` ist gitignored und wird lokal daraus
   kopiert:

   ```bash
   cp src/environments/environment.example.ts src/environments/environment.ts
   ```

2. In `src/environments/environment.ts` die beiden Platzhalter durch die
   echten Werte aus dem Supabase-Projekt ersetzen (Dashboard → **Project
   Settings** → **API**):

   | Feld              | Zweck                                    | Hinweis                                                                   |
   | ----------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
   | `supabaseUrl`     | URL des Supabase-Projekts                | z. B. `https://xxxxx.supabase.co`                                         |
   | `supabaseAnonKey` | Öffentlicher Anon-Key für Client-Zugriff | kein Geheimnis, aber projektspezifisch — deshalb kein echter Wert im Repo |

   Ohne diesen Schritt lässt sich das Projekt nach einem frischen Clone
   nicht sinnvoll starten (Login schlägt gegen die Platzhalter-URL fehl).

### Accounts anlegen (Supabase-Dashboard)

Die App hat **kein Signup** — beide Accounts (`duc`, `tony`) werden einmalig
im Supabase-Dashboard angelegt, nicht über die App:

1. Im Supabase-Dashboard des Projekts zu **Authentication** → **Users**
   wechseln.
2. Über **Add user** → **Create new user** je einen Account für `duc` und
   `tony` anlegen: E-Mail-Adresse und ein Startpasswort setzen, **Auto
   Confirm User** aktivieren (kein Bestätigungs-Mail-Flow in dieser App).
3. Mit diesen Zugangsdaten kann sich die jeweilige Person über die
   Login-Seite der App anmelden. Passwort-Änderungen laufen ebenfalls über
   das Dashboard — es gibt aktuell keinen „Passwort vergessen"-Link in der
   App.

## Deployment (GitHub Pages)

Bei jedem Push auf `main` baut `.github/workflows/deploy-pages.yml` die App
und veröffentlicht sie auf GitHub Pages. Einmalig vorher einzurichten:

1. **Repository Secrets** anlegen (GitHub → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**):
   - `SUPABASE_URL` — URL des Supabase-Projekts.
   - `SUPABASE_ANON_KEY` — Anon-Key des Supabase-Projekts.

   Beide Werte entsprechen genau dem, was lokal in
   `src/environments/environment.ts` steht (siehe oben) — der Workflow
   erzeugt diese Datei bei jedem Lauf frisch aus den Secrets, da sie
   gitignored ist.

2. **GitHub Pages aktivieren**: Repository → **Settings** → **Pages** →
   unter **Build and deployment** → **Source** auf **GitHub Actions**
   stellen (nicht „Deploy from a branch").

3. Danach reicht ein normaler Push auf `main` — die Action baut mit
   `--base-href /calory-tracker/` (passend zum Pfad
   `https://<user>.github.io/calory-tracker/`) und legt zusätzlich ein
   `404.html` (Kopie von `index.html`, für clientseitiges Routing ohne
   Server-Rewrites) sowie `.nojekyll` in den Build ab.

Falls das Repository umbenannt oder unter einem anderen Pfad/eigener Domain
veröffentlicht wird, muss der `--base-href`-Wert im Workflow entsprechend
angepasst werden.

## Datenbank/Migrationen

Schema und Row Level Security liegen als SQL-Migrationen im Repo unter
`supabase/migrations/<YYYYMMDDHHMMSS>_<beschreibung>.sql` (siehe ADR-0004).
Es gibt keine Supabase-CLI-Abhängigkeit im Projekt — Migrationen werden von
Hand eingespielt:

1. Im Supabase-Dashboard des Projekts zu **SQL Editor** wechseln.
2. Die Dateien unter `supabase/migrations/` in **Dateinamen-Reihenfolge**
   (aufsteigender Zeitstempel) öffnen und deren Inhalt jeweils komplett
   ausführen.
3. Jede Migration ist wiederholbar einspielbar (`if not exists`,
   `drop policy if exists` vor jedem `create policy`) — ein versehentliches
   zweites Ausführen schlägt nicht fehl.

Die Migrationen setzen voraus, dass die beiden Accounts (`duc`, `tony`)
bereits im Supabase-Dashboard angelegt sind (siehe Abschnitt „Accounts
anlegen" oben) — RLS-Policies und Fremdschlüssel referenzieren `auth.users`.

Alternativ, mit lokal installierter Supabase-CLI: `supabase db push`. Das ist
optional und kein Projekt-Standard.

### Prüfabfragen (`supabase/checks/`)

Zu einer Migration kann es eine Prüfdatei mit gleichem Zeitstempel unter
`supabase/checks/` geben. Sie ist **keine Migration** und wird nicht unter
`migrations/` abgelegt; sie läuft rein lesend bzw. in `begin … rollback` und
wird bei Bedarf im SQL Editor ausgeführt.

- `supabase/checks/20260930090000_foods_search_explain.sql` — gehört zur
  Suche (`search_foods`/`top_foods`, `foods.off_popularity`, ADR-0020):
  `explain (analyze, buffers)` des Kandidaten-Prädikats für `'joghurt'` und
  `'ei'`, jeweils regulär und mit `enable_seqscan = off`, dazu Kontroll-
  `select`s und die Größen von Tabelle und Indizes. Erwartung: Nach dem
  Import (~300k Zeilen) zeigt der reguläre Lauf einen `Bitmap Index Scan on
  foods_name_trgm_idx`; vor dem Import wählt der Planer wegen der kleinen
  Tabelle zu Recht einen `Seq Scan`, der zweite Lauf zeigt dann, dass der
  Index benutzbar ist. Im SQL Editor läuft die Datei als `postgres` ohne
  RLS — `own_use_count` ist dort immer 0.

## Lebensmittel-Import (Open Food Facts, DACH)

Der Bestand `foods` lässt sich einmalig mit Produkten aus Open Food Facts (OFF)
für Deutschland, Österreich und die Schweiz befüllen (ADR-0022). Das Werkzeug
`scripts/off-import/` läuft **lokal und offline** (kein Netzzugriff, keine
Zugangsdaten), liest den OFF-Bulk-Export und erzeugt SQL-Dateien („Chargen"),
die du anschließend selbst in die Datenbank einspielst.

**Bezugsquelle und Lizenz.** Open Food Facts, Export
`openfoodfacts-products.jsonl.gz` (mehrere GB, Stand: der Tag des Downloads):
<https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz>.
Die Daten stehen unter der Open Database License (ODbL 1.0), die einzelnen
Inhalte unter der Database Contents License (DbCL 1.0); Quelle und Lizenz
stehen im Kopf jeder Chargen-Datei. Die erzeugten Chargen werden **nicht
committet** (`/supabase/data/` ist gitignored): Sie wachsen je OFF-Stand um
~30–60 MB, und eine öffentlich veröffentlichte abgeleitete OFF-Datenbank
unterläge den Share-Alike-Pflichten der ODbL.

**Voraussetzung:** Node aus `.nvmrc` (22.23.1; das Skript nutzt Type Stripping
ohne Transpiler und braucht ≥ 22.18), `npm install` (einzige Neuerung ist
`@types/node` als devDependency für die Typprüfung).

**Reihenfolge — bitte einhalten:**

1. **Migration** `supabase/migrations/20260930090000_foods_search_trgm_popularity.sql`
   einspielen (Abschnitt „Datenbank/Migrationen"). Ohne sie bricht jede Charge
   mit einem Fehler ab und schreibt nichts.
2. **App ausliefern** mit der Hybrid-Suche (Paket 003) **und** dem
   Scan-Lookup über kanonische Barcodes (Paket 002-fe). Erst dann findet der
   Scan die importierten Produkte (der Import schreibt Barcodes in der
   kanonischen Form aus `normalizeBarcode`).
3. **Chargen erzeugen und einspielen** (unten).

**Chargen erzeugen:**

```bash
npm run off-import:generate -- --input <pfad>/openfoodfacts-products.jsonl.gz
```

Der Export wird gestreamt (kein Entpacken auf die Platte); der Lauf dauert je
nach Rechner einige Minuten. Ausgabe: `supabase/data/off-dach/off-dach-0001.sql`
usw., 5000 Zeilen je Datei, beliebteste Produkte (`unique_scans_n`) zuerst.
Gleiche Eingabe ergibt byte-gleiche Dateien; frühere `off-dach-NNNN.sql` im
Ausgabeordner werden vor dem Schreiben entfernt. Am Ende steht eine Statistik
auf stdout (gelesen, nicht DACH, verworfen nach Grund, übernommen, Dubletten,
Anzahl Chargen). Optionen: `--out <verzeichnis>`; `--tolerate-truncated` für
eine abgeschnittene `.gz`-Datei (nur für Stichproben, nicht für den echten
Import).

Übernommen wird ein Produkt nur, wenn es ein DACH-Land (`countries_tags`),
einen gültigen Barcode, einen Namen, alle vier Nährwerte je 100 g (kcal, Protein,
Kohlenhydrate, Fett) hat **und** die Plausibilitätsprüfung der App besteht
(Energie weicht ≤ 10 % von der Atwater-Rechnung ab, Makrosumme ≤ 100 g;
dieselben Regeln wie beim Scan, per Import aus dem App-Code). Produkte mit
Alkohol oder Zuckeralkoholen fallen dadurch häufig heraus. Quelle der Nährwerte: zuerst die
alten `*_100g`-Felder, sonst `nutrition.aggregated_set` (je 100 g, danach je
100 ml). **Werte je 100 ml werden wie Werte je 100 g behandelt** (Getränke,
Dichte ~1); die Statistik weist ihre Anzahl gesondert aus. Der Name lautet
„Produktname (Marke)", deutscher Name bevorzugt.

**Einspielen** — in einer Schleife, die beim ersten Fehler anhält. Als
Verbindung den Postgres-Connection-String des Supabase-Projekts verwenden
(Dashboard → **Project Settings** → **Database**, Direct connection oder
Session pooler; Passwort nicht ins Repo):

```bash
export DATABASE_URL='postgresql://postgres:<passwort>@<host>:5432/postgres'
for f in supabase/data/off-dach/off-dach-*.sql; do
  echo "== $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

Jede Charge ist eine eigene Transaktion mit einem einzigen Statement, reine
DML auf `public.foods`, und beliebig oft einspielbar: Ein bereits vorhandenes
Food (auch mit Barcode in älterer Schreibweise, auch manuell korrigiert) bleibt
bis auf `off_popularity` unverändert; Dubletten entstehen nicht. Nach einem
Abbruch genügt es, die Schleife erneut zu starten. Alternativ lässt sich eine
Datei im Supabase-SQL-Editor ausführen (jede Datei ist wenige MB groß).

**Speicherbedarf (Schätzung, nicht gemessen).** Bei ~300.000 Zeilen etwa
55 MB Tabelle, 40 MB Trigram-Index und 25 MB übrige Indizes, zusammen rund
120 MB von 500 MB im Free Plan. Das tatsächliche Ergebnis prüfst du nach dem
Import mit den Größenabfragen aus `supabase/checks/20260930090000_foods_search_explain.sql`
oder direkt:

```sql
select count(*) as zeilen, count(*) filter (where off_popularity > 0) as mit_scans
from public.foods;

select pg_size_pretty(pg_table_size('public.foods'))           as tabelle,
       pg_size_pretty(pg_indexes_size('public.foods'))         as indizes,
       pg_size_pretty(pg_relation_size('public.foods_name_trgm_idx')) as trigram_index,
       pg_size_pretty(pg_database_size(current_database()))    as datenbank_gesamt;
```

Ein neuer OFF-Stand wird mit demselben Ablauf eingespielt: neue Produkte
kommen hinzu, bestehende bleiben, nur `off_popularity` wird aktualisiert.

**Tests des Werkzeugs:** `npm run off-import:test` (Vitest, getrennt von
`npm test`) und `npm run off-import:typecheck`.

## Projektstruktur

Feature-Ordner direkt unter `src/app/<feature>/` (auth, diary,
food-search, meals, goals, stats), Design-Tokens ausschließlich
in `src/styles/tokens.css`. Der Barcode-Scanner ist kein eigenes Feature,
sondern ein Zustand des Eingabe-Sheets in `food-search` (siehe ADR-0010).
Details und Begründung: siehe ADR-0001 und `code-conventions.md`.

## Kalorienziel-Vorschlag

Im Gewichtslog-Abschnitt der Ziele-Ansicht kann die App aus deinem
Gewichtsverlauf, deiner bisherigen Kalorienzufuhr und einem gesetzten
Zielgewicht einen Vorschlag für dein Kalorienziel errechnen.

**So rechnet der Vorschlag:** Er ermittelt zunächst deinen bisherigen
Erhaltungsbedarf — die Kalorienmenge, bei der dein Gewicht laut den letzten
28 Tagen konstant geblieben wäre (aus deinem Gewichtstrend und deiner
durchschnittlichen Ist-Zufuhr). Davon ausgehend rechnet er die Differenz zu
einer Zielrate um: Liegt dein Zielgewicht unter deinem aktuellen Gewicht,
schlägt er ein Kaloriendefizit vor (höchstens für 0,5 kg Abnahme pro Woche);
liegt es darüber, einen Überschuss (höchstens für 0,25 kg Zunahme pro
Woche). Liegt dein aktuelles Gewicht bereits innerhalb von ±0,5 kg deines
Ziels, zeigt die Karte stattdessen deinen Erhaltungsbedarf als „Halten"-Wert.

Ein Vorschlag erscheint nur, wenn ein Zielgewicht gesetzt ist und
ausreichend Messwerte vorliegen (mindestens 3 Gewichtseinträge über
mindestens 14 Tage, die jüngste Messung höchstens 28 Tage alt, sowie
mindestens 14 erfasste Tage mit Mahlzeiten im 28-Tage-Fenster) — sonst zeigt
die Karte einen entsprechenden Hinweis. Liegt der errechnete Wert außerhalb
von 1200–6000 kcal, wird ebenfalls kein Vorschlag angezeigt.

**Das ist eine grobe Faustregel (7700 kcal je kg Körpergewicht,
Wishnofsky-Näherung) und kein medizinischer Rat.** Sie berücksichtigt weder
Körperzusammensetzung noch individuelle Stoffwechselunterschiede. Die
vollständige Herleitung inklusive aller Grenzwerte steht als
Modulkommentar in `src/app/goals/weight.calculations.ts`.
