# Context Map

**Single-Writer: Nur der `architekt`-Agent schreibt hierhin.** Alle anderen
Rollen lesen.

- **Angelegt**: 2026-09-20 (Paket PO-2026-09-20-001, Greenfield)
- **Zuletzt geprüft**: 2026-09-22 (Paket PO-2026-09-20-015, „Gewichtslog &
  Kalorienziel-Vorschlag", ADR-0017 und dessen Teil-Ablösung ADR-0018
  (Zielgewicht) — **kein** neuer Context, das Gewichtslog gehört zu `goals`)

Register, kein Design-Dokument. Details gehören in ADRs.

## Bounded Contexts

| Context | Repo/Ordner | Zuständigkeit (1 Satz) | Owner-Rolle |
|---------|-------------|------------------------|-------------|
| `app-shell` | `src/` (Root-Konfig), `src/app/` (Shell), `src/app/shell/`, `src/styles/` | Projekt-/Build-Setup, PWA (Service Worker, Manifest, Update-Hinweis), Routen-Topologie, Layout-Route + Bottom-Navigation, Design-Tokens, globale Layout-Bausteine | frontend-lead |
| `auth` | `src/app/auth/` | Login/Logout, Session-Zustand, Route-Guard, Supabase-Auth-Anbindung | frontend-lead |
| `diary` | `src/app/diary/` | Tagesansicht, Einträge je Mahlzeit, Tagessummen gegen Ziele, „gestern kopieren" | frontend-lead |
| `food-catalog` | `src/app/food-search/` | Foods: lokale Suche, Open-Food-Facts-Lookup, Barcode-Scan, lokaler Cache, manuelle Korrektur und Plausibilitätsprüfung | frontend-lead |
| `meals` | `src/app/meals/` | Gespeicherte Mahlzeiten (Zusammenstellung, Verwaltung, Loggen) | frontend-lead |
| `goals` | `src/app/goals/` | Tagesziele (kcal, Makros) je Nutzer; ab Paket 015 zusätzlich Gewichtslog (Erfassen, Liniendiagramm) und der daraus abgeleitete Kalorienziel-Vorschlag (ADR-0017) | frontend-lead |
| `stats` | `src/app/stats/` | Verlauf (Woche/Monat), Balken-Chart — **kein** Gewichtslog (ADR-0017 Punkt 1; der frühere Platzhalter „optional Gewichtslog" ist hiermit aufgelöst) | frontend-lead |
| `offline-sync` | `src/app/core/connectivity.service.ts`, `src/app/core/local-db.service.ts`, `src/app/core/entry-queue.service.ts`, `src/app/core/entry-sync.service.ts` (Dateien, kein Ordner) | Verbindungszustand, lokale Persistenz (IndexedDB), Puffer-Queue für noch nicht übertragene Einträge und deren Hintergrund-Übertragung — hinter `core/entries.service.ts`, ohne eigenen UI-Einstieg | frontend-lead |
| `data-platform` | `supabase/` | Postgres-Schema, Row Level Security, Migrationen als SQL im Repo | backend-lead |

## Schnittstellen zwischen Contexts

Nur was für Routing-Entscheidungen zählt.

- `auth` → `data-platform`: Supabase Auth (E-Mail/Passwort), Session liefert
  `user_id` für alle RLS-Policies. Client und Session-Signal leben in
  `src/app/core/supabase.service.ts` (ADR-0003); Accounts werden im
  Supabase-Dashboard angelegt, die App hat kein Signup.
- `diary`, `meals`, `goals`, `stats` → `data-platform`: direkter
  Supabase-Client-Zugriff (PostgREST) unter RLS. Kein eigener API-Server.
- **Foods lesen** (Liste + Sitzungs-Cache): `src/app/core/foods.service.ts` —
  genau ein Cache im Projekt, genutzt von `food-catalog` (Step A) und
  `meals` (Step M2), ADR-0012 Punkt 1. **Foods schreiben** (Anlegen,
  Korrigieren) sowie Barcode-Lookup und Open Food Facts bleiben
  ausschließlich in `food-catalog` (`food-search.service.ts`); kein Feature
  baut eigene `foods`-Queries. **Ausgenommen ist der Lesepfad der eigenen
  Einträge**: `diary` lädt die Nährwerte eingebettet an den
  `entries`-Datensätzen eines Tages (eine PostgREST-Abfrage, nur lesend, nie
  als Food-Liste) — ADR-0006.
- `meals` ↔ `food-catalog`: Die Abhängigkeit läuft in **beide** Richtungen
  (`meals` braucht die Food-Suche, das Eintrags-Sheet zeigt den Log-Tab
  „Gespeicherte Mahlzeiten"). Aufgelöst über `core/`, **nie** über
  Feature-Importe: Der **Lesepfad** der Mahlzeiten (Liste mit Positionen und
  eingebetteten Foods) liegt in `src/app/core/meals.service.ts`, Sortierung
  und Summen in `src/app/core/meals.calculations.ts` (eine Quelle — beide
  Listen sind laut Akzeptanz identisch sortiert). **Geschrieben** werden
  `meals`/`meal_items` ausschließlich von `src/app/meals/meals.service.ts`
  (ADR-0012 Punkt 3).
- `diary` ↔ `stats` (kein Import, nur geteilte Bausteine): Ziel-/Überschuss-
  Berechnung (`computeProgress`, `ProgressResult`) liegt ab Paket 012 in
  `src/app/core/progress.calculations.ts`, Kalendertag-Arithmetik und
  -Beschriftung (`todayKey`, `addDaysToKey`, `diffInDays`, `maxForwardKey`,
  `formatDateLabel`, `MAX_FORWARD_DAYS`) in
  `src/app/core/date.calculations.ts`, der Makro-Balken in
  `src/app/shared/ui/macro-bar/` (ADR-0014 Punkt 7, Einlösung der in
  ADR-0006 angekündigten Auslagerung). Keine Zweitdefinition, kein
  Re-Export aus `diary`.
- `diary` → `goals` (Tabelle): liest die eigene Zielzeile direkt per
  PostgREST, schreibend ist nur das Feature `goals`. Ein Zielwert `<= 0` oder
  eine fehlende Zeile bedeutet „kein Ziel gesetzt"; es gibt keine
  Ersatz-Zielwerte (ADR-0006). `goals` schreibt **feldweise** (ein Upsert je
  Zielwert); die vier Wertspalten haben `default 0`, eine teilbefüllte
  Zielzeile ist ein regulärer Zustand (ADR-0007).
- `diary` → `goals` (Navigation): die Tagesansicht verlinkt die Zielansicht
  per Route `ziele`; **kein** Feature-zu-Feature-Import in beide Richtungen
  (ADR-0007).
  Der **Katalogzugang** selbst ist genau eine Datei:
  `src/app/food-search/food-search.service.ts` (das „FoodRepository");
  weitere Quellen liegen ab Paket 008 als eigene Dateien daneben, werden
  aber nur von dort aufgerufen (ADR-0008).
- `diary` → `food-catalog` (Navigation): FAB und Sektions-„+"-Buttons öffnen
  das Eingabe-Sheet über eine **Auxiliary-Route im Outlet `sheet`**, die in
  `app.routes.ts`/`app.html` (App-Shell) liegt. Kein Feature-zu-Feature-
  Import in beide Richtungen; die Tagesansicht bleibt dabei gemountet
  (ADR-0008 Punkt 1, gilt fort). Das **Mahlzeit-Sheet** von `meals` ist eine
  zweite Route im selben Outlet (`mahlzeit-bearbeiten`); die
  Verwaltungsansicht ist dagegen eine gewöhnliche Top-Level-Route
  `mahlzeiten`, erreichbar über ein Icon im Tagesansicht-Header
  (ADR-0012 Punkt 9).
- `food-catalog` → Open Food Facts (extern): nur hier, nirgends sonst —
  konkret ausschließlich in `src/app/food-search/food-search.off.service.ts`,
  aufgerufen allein von `food-search.service.ts` (ADR-0008 Punkt 2,
  ADR-0010 Punkt 3). Zugriff über natives `fetch` mit
  `AbortSignal.timeout(…)`, **kein** `HttpClient`; OFF-Antworten werden
  nicht vom Service Worker gecacht — der Cache ist die `foods`-Tabelle.
- `food-catalog` → Kamera/Barcode (Browser-APIs): `BarcodeDetector` mit
  `@zxing/browser` als nachgeladenem Fallback, gekapselt in
  `src/app/food-search/food-search.scanner.service.ts`. Es gibt **kein**
  eigenes Feature `src/app/scanner/`; der Scanner ist ein Zustand des
  Eingabe-Sheets (ADR-0010 Punkt 1).
- `food-catalog`, `meals`, `diary` → `entries` (schreibend): **jeder**
  Schreibvorgang auf `entries` (anlegen — einzeln oder als Array beim Loggen
  einer Mahlzeit, ADR-0012 Punkt 6 —, ändern, löschen) sowie das Lesen
  eines **einzelnen** Eintrags läuft über `src/app/core/entries.service.ts`;
  kein Feature schreibt die Tabelle selbst (ADR-0009). Ab Paket 011 gibt
  `createEntries()` die angelegten **IDs** zurück, und `deleteEntries(ids)`
  löscht mehrere Einträge in einem Vorgang (ADR-0013 Punkt 1/2) — die
  Rücknahme von „gestern kopieren" arbeitet ausschließlich über diese IDs,
  nie über eine Merkmalssuche. Der Lesepfad der
  Tagesliste bleibt davon unberührt in `diary.service.ts` (ADR-0006); dort
  liegt ab Paket 011 auch die schlanke Vortags-Abfrage der Kopiervorlage
  (`id, meal_type, amount_g, food_id`, ohne eingebettete Foods, ADR-0013
  Punkt 6). Die
  Tagesansicht aktualisiert sich, indem `diary` das `revision`-Signal des
  Dienstes beobachtet — `core/` ruft nie in ein Feature hinein.
- `stats` → `data-platform`: **eigene** Bereichsabfrage auf `entries`
  (`gte`/`lte` auf `date`) mit schlanker Projektion `date, amount_g,
  foods(kcal_100g, protein_100g, carbs_100g, fat_100g)` in
  `src/app/stats/stats.service.ts` — genau eine Abfrage je sichtbarer
  Periode, keine Einzeleintrags-Felder, keine View/RPC, keine Migration
  (ADR-0014 Punkt 5). Die Zielzeile liest `stats` mit derselben einzeiligen
  Abfrage wie `diary` (zweite bewusste Lesestelle, ADR-0014 Punkt 6); Ziele
  sind **nicht** historisiert — das aktuell gesetzte Ziel gilt für den ganzen
  dargestellten Zeitraum. `stats` schreibt nichts.
- `app-shell` → alle (Navigation): alle Routen hinter dem Login liegen ab
  Paket 012 als `children` unter einer **pfadlosen Layout-Route** mit dem
  einzigen `authGuard`; `MainLayoutComponent` und `BottomNavComponent` liegen
  in `src/app/shell/`. Zwei Tabs (`tagebuch`, `verlauf`); `ziele` und
  `mahlzeiten` sind tab-lose Kinder derselben Layout-Route und behalten
  ihren Icon-Einstieg aus dem Tagesansicht-Header. Die beiden
  `sheet`-Auxiliary-Routen bleiben top-level und liegen über der Navigation
  (ADR-0014 Punkt 1–3).
- `app-shell` → Service Worker (Plattform): `SwUpdate` wird ab Paket 013b
  ausschließlich in `src/app/core/app-update.service.ts` injiziert; die
  Banner-Komponente liegt in `src/app/shell/components/update-banner/` und
  hängt an `MainLayoutComponent` (also hinter dem Login, nicht auf
  `/login`). Kein Feature kennt den Worker, `ngsw-config.json` bleibt ohne
  `dataGroups` (ADR-0015, ADR-0002).
- `offline-sync` → `entries` (schreibend, ab Paket 014, ADR-0016): Die Queue
  liegt **hinter** `core/entries.service.ts` — dieser bleibt der einzige
  Schreibweg (ADR-0009) und der einzige Aufrufer der Queue. `diary`,
  `food-catalog` und `meals` rufen unverändert und erfahren vom Puffer
  nichts. Gepuffert wird **nur das Anlegen**; Ändern/Löschen eines bereits
  übertragenen Eintrags bleibt netzabhängig, auf einem gepufferten Eintrag
  wirken sie rein lokal. Die Eintrags-`id` wird im **Client** vergeben
  (`crypto.randomUUID()`) und ist zugleich Idempotenzschlüssel — ein
  Unique-Violation-Fehler beim Wiederholungsversuch zählt als Erfolg. Keine
  Migration, kein zweites ID-Feld.
- `offline-sync` → `diary` (nur lesend, über Signal): `DiaryStore` mischt die
  gepufferten Einträge des angezeigten Tages per `computed` über die vom
  Server geladenen — ein Rechenweg für Liste, Sektionen und Tagessummen.
  `diary.service.ts` bleibt netzabhängig und unverändert; `core/` ruft nie in
  ein Feature hinein. `DiaryEntry` trägt dafür `syncState`
  (`'synced' | 'pending' | 'failed'`).
- `offline-sync` → `app-shell`/Service Worker: **keine** Berührung.
  `ngsw-config.json` bleibt ohne `dataGroups` (ADR-0002 gilt fort);
  Offline-Verhalten für Fachdaten entsteht ausschließlich in der
  Anwendungsschicht. Der Kaltstart ohne Netz zeigt Schnappschüsse aus
  IndexedDB (zuletzt geladener Tag + Zielzeile, zuletzt geladener
  Food-Bestand) — Anzeige-Ersatz, nie Schreibquelle (ADR-0016 Punkt 8).
- `goals` → `data-platform` (ab Paket 015, ADR-0017): eigene Tabelle
  `weight_logs` mit `unique (user_id, date)` und RLS auf `auth.uid()`;
  geschrieben wird per Upsert auf `(user_id, date)`, gelöscht über die `id`.
  Einziger Zugang ist `src/app/goals/goals.service.ts`. Zusätzlich liest
  `goals` dort eine **zweite** Bereichsabfrage auf `entries` (`date,
  amount_g, foods(kcal_100g)`, 28-Tage-Fenster) für die Ist-Zufuhr des
  Kalorienziel-Vorschlags — bewusste Doppelung zu `stats.service.ts`, Umzug
  nach `core/` erst beim dritten Leser (ADR-0017 Punkt 4). `weight_logs`
  ist **nicht** Teil des Offline-Puffers (ADR-0017 Punkt 9).
  Die Zielzeile `goals` bekommt im selben Paket eine fünfte Spalte
  `target_weight_kg` (**nullable**, `null` = nicht gesetzt — abweichend von
  der `0`-Semantik der vier Wertspalten, ADR-0018 Punkt 1/2). Sie wird wie
  die anderen Zielwerte **feldweise** über `goals/goals.service.ts`
  geschrieben; `weight.store.ts` liest sie nur (ADR-0018 Punkt 6). Der
  Kalorienziel-Vorschlag ist ab ADR-0018 **zielbasiert** (trendkorrigierter
  Erhaltungsbedarf + gedeckelte Zielrate) und setzt ein gesetztes
  Zielgewicht voraus — ADR-0017 Punkt 3 gilt nicht mehr.
- `app-shell` → alle: stellt Routen, Tokens und den Supabase-Client aus
  `core/` bereit; enthält selbst keine Fachlogik. `MealType` und die
  Mahlzeit-Labels/-Reihenfolge liegen als gemeinsame Konstanten in
  `src/app/core/meal-type.constants.ts` (ADR-0009), nicht in `diary`.

## Bekannte Grenzen / bewusst nicht geteilt

- Kein eigener Backend-Service. Das „Backend" ist Supabase (Postgres + RLS);
  Geschäftsregeln, die Daten schützen, gehören in RLS-Policies, nicht nur ins
  Frontend.
- Kein Feature importiert aus einem anderen Feature. Geteiltes geht über
  `core/` (einmalige Dienste) oder `shared/` (ab zwei Nutzern).
- Nährwerte werden ausschließlich pro 100 g gespeichert; Umrechnung auf
  Mengen passiert nur bei Berechnung/Anzeige, nie in der Persistenz.
- Die vier Nährwertspalten von `foods` sind `not null` und **bleiben es**:
  Ein Food ohne vollständige 100-g-Werte wird nie gespeichert —
  unvollständige Open-Food-Facts-Treffer laufen über das vorbelegte
  Anlege-Formular (ADR-0010 Punkt 5). Die in ADR-0010 offen gelassene
  Nullable-Frage ist mit ADR-0011 **verneint**; „unvollständig" ist ein
  Befund über Formular-/Entwurfswerte, nicht über persistierte Foods.
- Korrektur bestehender Foods: einziger Schreibweg ist
  `food-search.service.ts` (`update` inkl. `is_corrected = true` im selben
  Statement). Kein automatischer Schreibweg überschreibt ein Food mit
  `is_corrected = true` (ADR-0011). Plausibilitäts-/Vollständigkeitsbefunde
  werden nicht persistiert, sondern berechnet — mit Paket 010 (`meals` als
  zweiter Nutzer) liegen Funktion in `core/foods.calculations.ts`, Schwellen
  in `core/nutrition.constants.ts` und Marker in
  `shared/ui/plausibility-marker/` (ADR-0012 Punkt 2/5).
- `foods` ist gemeinsamer Bestand beider Nutzer (lesen **und** schreiben);
  `entries`, `meals`, `meal_items`, `goals` sind strikt nutzergebunden.
  Die Grenze liegt in den RLS-Policies, nicht in Client-Filtern (ADR-0004).
