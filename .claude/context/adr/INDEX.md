# ADR-Index

**Single-Writer: Nur der `architekt`-Agent schreibt hierhin.** Der Index wird
bei **jedem** neuen oder abgelösten ADR mitgepflegt.

Zweck: `adr/` hat bewusst keinen Größendeckel und wird deshalb nie komplett
gelesen. Der Architekt liest diesen Index und öffnet nur die ADRs, deren
Bounded Context zum aktuellen Paket passt, plus deren `superseded by`-Ketten.

| ADR | Titel | Bounded Context | Status | Datum |
|-----|-------|-----------------|--------|-------|
| `0001` | Frontend-Projektstruktur mit Signal-Stores statt NgRx | `app-shell`, `auth`, `diary`, `food-catalog`, `meals`, `goals`, `stats` | `accepted` | 2026-09-20 |
| `0002` | PWA-Fundament über @angular/service-worker | `app-shell` | `accepted` | 2026-09-20 |
| `0003` | Supabase-Client in `core/`, Session als Signal, Konfiguration über `src/environments/` | `auth`, `app-shell`, `data-platform` | `accepted` | 2026-09-20 |
| `0004` | Postgres-Schema, RLS-Pattern und Migrations-Workflow | `data-platform` | `accepted` | 2026-09-20 |
| `0005` | Token-Fundament — Rollen/Skala-Trennung, Light-Mode-only, zentrale Schwellenkonstante | `app-shell` | `accepted` | 2026-09-20 |
| `0006` | Tagesansicht — Lesepfad (Einträge mit eingebetteten Foods), Tagesdatum-Schlüssel, Aggregation im Client | `diary`, `food-catalog`, `goals`, `stats`, `data-platform` | `accepted` | 2026-09-20 |
| `0007` | Ziele — feldweises Speichern, teilbefüllte Zielzeile (Default 0 statt nullable), Einstieg über die Tagesansicht | `goals`, `data-platform`, `diary`, `stats`, `app-shell` | `accepted` | 2026-09-20 |
| `0008` | Food-Katalog — Eingabe-Sheet als Auxiliary-Route, `food-search.service.ts` als einziger Katalogzugang, Sitzungs-Cache mit In-Memory-Filter | `food-catalog`, `app-shell`, `diary`, `meals`, `data-platform` | `superseded by ADR-0012` | 2026-09-21 |
| `0009` | Eintrag schreiben — `core/entries.service.ts` als einziger Schreibweg auf `entries`, Step B im `food-catalog`-Sheet, `MealType` nach `core/` | `diary`, `food-catalog`, `app-shell`, `meals`, `data-platform` | `accepted` | 2026-09-21 |
| `0010` | Barcode-Scan und Open Food Facts als zweite Katalogquelle — Scanner-Adapter im Feature, `fetch` statt HttpClient, Barcode-Lookup an der Datenbank, `foods` bleibt vollständig | `food-catalog`, `app-shell`, `data-platform` | `accepted` | 2026-09-21 |
| `0011` | Manuelle Korrektur und Plausibilitätsprüfung — Nährwertspalten bleiben `not null`, Prüflogik als reine Funktion, `is_corrected` als Vorrangflagge | `food-catalog`, `data-platform`, `diary`, `meals` | `accepted` | 2026-09-21 |
| `0012` | Gespeicherte Mahlzeiten — Katalog-Lesepfad und Sitzungs-Cache nach `core/`, geteilte Sheet-/Dialog-/Marker-Bausteine nach `shared/ui/`, Mahlzeiten-Lesepfad in `core/` (löst ADR-0008 ab) | `meals`, `food-catalog`, `app-shell`, `diary`, `data-platform` | `accepted` | 2026-09-21 |
| `0013` | „Gestern kopieren" — ID-Tracking der Kopieraktion statt Merkmalssuche, Undo als Client-State im `DiaryStore`, `createEntries` liefert IDs + neues `deleteEntries` | `diary`, `food-catalog`, `meals`, `data-platform` | `accepted` | 2026-09-21 |
| `0014` | Verlauf & Bottom-Navigation — pfadlose Layout-Route als App-Shell, Balken-Chart ohne Chart-Bibliothek, Perioden-Aggregation im Client, geteilte Bausteine nach `core/`/`shared/` | `stats`, `app-shell`, `diary`, `goals`, `meals`, `data-platform` | `accepted` | 2026-09-21 |
| `0015` | Update-Hinweis — `SwUpdate` gekapselt in `core/app-update.service.ts`, Banner in der Layout-Route, Sitzungs-Unterdrückung als Client-State, Layout-Tokens statt `56px`-Literal | `app-shell`, `diary`, `stats`, `goals`, `meals` | `accepted` | 2026-09-21 |
| `0016` | Offline-Puffer — client-vergebene Eintrags-UUID als Idempotenzschlüssel, IndexedDB-Queue hinter `core/entries.service.ts`, neuer Bounded Context `offline-sync` | `offline-sync`, `diary`, `food-catalog`, `meals`, `app-shell`, `data-platform` | `accepted` | 2026-09-22 |
| `0017` | Gewichtslog & Kalorienziel-Vorschlag — Gewichtslog als Teil von `goals`, `weight_logs` mit `unique (user_id, date)`, festgelegte Rechenregel (28-Tage-Fenster, lineare Regression, 7700 kcal/kg), zweiter Store im Feature `goals` | `goals`, `data-platform`, `stats`, `app-shell`, `offline-sync` | `superseded by ADR-0018` (nur Punkt 3; Punkte 1, 2, 4–9 gelten fort) | 2026-09-22 |
| `0018` | Zielbasierter Kalorienziel-Vorschlag & Zielgewicht in `goals` — trendkorrigierte Zielrate mit Wochen-Obergrenzen (0,5 kg ab / 0,25 kg zu), Halten-Toleranz ±0,5 kg, `goals.target_weight_kg` nullable (löst ADR-0017 Punkt 3 ab) | `goals`, `data-platform` | `accepted` | 2026-09-22 |
| `0019` | Gewicht als eigener Tab `/gewicht`, Schnelleingabe + Mini-Verlauf im Tagebuch, `weight_logs`-Zugriff in `core/weight-logs.service.ts` mit `revision`-Signal (löst den Service-Teil von ADR-0017 Punkt 5 ab) | `goals`, `diary`, `app-shell` | `accepted` | 2026-09-23 |

**Status-Werte** wörtlich wie im ADR selbst: `proposed` · `accepted` ·
`superseded by ADR-NNNN`.
