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
