# ADR-0019: Gewicht als eigener Tab, Schnelleingabe + Mini-Verlauf im Tagebuch, `weight_logs`-Zugriff nach `core/`

- **Status**: accepted
- **Datum**: 2026-09-23
- **Bounded Context(s)**: `goals`, `diary`, `app-shell` (wirkt auf `data-platform` nur lesend, keine Migration)

## Kontext

Das Gewichtslog lebte bisher vollständig in der Ziele-Ansicht (ADR-0017
Punkt 1), erreichbar nur über das Zahnrad im Tagebuch-Header. Nutzerwunsch:
Gewicht **direkt von der Hauptseite** erfassen, dort eine vereinfachte
Darstellung der aktuellen Entwicklung sehen, und das große Diagramm mit
Zielwert in einen eigenen Reiter verschieben.

Damit liest und schreibt ein zweites Feature (`diary`) die Tabelle
`weight_logs`. Nach der Import-Regel („kein Feature importiert aus einem
anderen") und der Zwei-Nutzer-Regel gehört der Zugriff nach `core/` —
dasselbe Muster wie `core/entries.service.ts` (ADR-0009) und
`core/meals.service.ts` (ADR-0012).

## Entscheidung

1. **Neuer Tab `/gewicht`** in der Bottom-Navigation (Reihenfolge Tagebuch ·
   Gewicht · Verlauf), als Kind der Layout-Route. Die Komponente
   `goals/components/weight-page/` liegt im Feature `goals` und enthält den
   bisherigen Gewichtslog-Abschnitt **unverändert** (Zielgewicht-Feldblock,
   Erfassen-Sheet, 90-Tage-Liniendiagramm, Vorschlagskarte). Die
   Ziele-Ansicht zeigt nur noch die vier kcal-/Makro-Feldblöcke. Route in
   `goals/weight.routes.ts` (zweite Routendatei des Features).
2. **`core/weight-logs.service.ts`** ist der einzige Tabellenzugriff auf
   `weight_logs` (lesen, upserten, löschen) und definiert `WeightLogEntry`.
   Er führt ein `revision`-Signal, das nach jedem erfolgreichen
   Schreibvorgang steigt; Features reagieren per `effect`. `goals.service.ts`
   behält nur `goals` und die Ist-Zufuhr-Abfrage. Löst den Service-Teil von
   ADR-0017 Punkt 5 und die Zeile „keine zweite Servicedatei" in
   `code-conventions.md` ab.
3. **`core/weight.calculations.ts`** hält Wertebereich (`WEIGHT_MIN_KG`,
   `WEIGHT_MAX_KG`, `WEIGHT_MAX_DECIMAL_PLACES`), `validateWeightEntry` und
   `formatWeightKg` — beide Features validieren dieselbe Eingabe.
   Trend-/Vorschlags-/Diagrammlogik bleibt in `goals/weight.calculations.ts`.
4. **Gewichtskarte im Tagebuch** (`diary/components/weight-card/`), unter
   Kalorienring und Makro-Balken: jüngster Wert, Veränderung älteste →
   jüngste Messung der letzten 30 Tage (`WEIGHT_CARD_WINDOW_DAYS`) als Text,
   Sparkline, Link „Verlauf" auf `/gewicht`. Zustand im `DiaryStore`
   (kein zweiter Store), Rechenlogik in `diary.calculations.ts`.
5. **Schnelleingabe gilt für den angezeigten Tag** (heute und Vergangenheit,
   nicht für die Zukunft) — anders als das Erfassen-Sheet, das nur „heute"
   kennt. Das Tagebuch ist tagesbezogen, Nachtragen für gestern ist der
   häufigste Zusatzfall. Ist für den Tag schon ein Wert erfasst, zeigt die
   Karte ihn mit „Ändern"; erst dieser ausdrückliche Schritt öffnet das Feld.
   Der „Ändern"-Schritt ersetzt den Bestätigungsdialog des Sheets (bewusste
   Abweichung von „Ein Gewichtswert pro Kalendertag", da das Ersetzen hier
   nie unbeabsichtigt passieren kann). Lädt die Messliste nicht, ist die
   Eingabe ausgeblendet, damit kein unbekannter Wert still überschrieben wird.
6. **Sparkline ohne fokussierbare Einzelpunkte**: bewusste Abweichung von
   der Diagramm-Regel in `code-conventions.md`. Die Sparkline ist
   `aria-hidden`, ihre Aussage steht als Text daneben, die Einzelwerte als
   `sr-only`-Liste. Das vollwertige, bedienbare Diagramm ist das auf
   `/gewicht`.

## Konsequenzen

- Kein Schema-Change, keine Migration.
- `DiaryStore` lädt Messungen zusätzlich zum Tag; ein Fehler dort setzt
  nicht den Tages-Fehlerzustand, sondern nur den der Karte.
- Ein Gewicht, das im Tagebuch erfasst wird, erscheint beim nächsten Öffnen
  von `/gewicht` (die Ansicht lädt beim Mounten neu); umgekehrt aktualisiert
  sich die Karte über `revision`.
- Gewichts-Schreibvorgänge sind weiterhin **nicht** offline gepuffert
  (ADR-0016 betrifft nur `entries`); offline scheitert das Speichern mit
  sichtbarer Fehlermeldung.
