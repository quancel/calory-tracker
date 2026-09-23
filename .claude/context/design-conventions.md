# Design-Konventionen

**Single-Writer: Nur der `ux-ui-designer` schreibt hierhin.** Alle anderen
Rollen lesen. Was hier steht, ist bereits entschieden und wird bei
Folge-Paketen nicht neu verhandelt — Abweichungen sind bewusste Ausnahmen,
keine stillschweigenden Neuerfindungen.

- **Herkunft**: `neu angelegt` im Rahmen von Paket PO-2026-09-20-013
  (Token-Fundament), finalisiert in Runde 2 am 2026-09-20. Ergänzt in
  Runde 2 der Pakete PO-2026-09-20-001/002 am 2026-09-20 (Buttons,
  Bottom-Navigation-Zeitpunkt). Ergänzt in Runde 2 der Pakete
  PO-2026-09-20-004/005 am 2026-09-20 (Datumsnavigation, Feldblock mit
  unabhängigem Speichern, Teil-Ziele bei Ring/Balken). Ergänzt in Runde 2
  der Pakete PO-2026-09-20-006/007 am 2026-09-20 (Bestätigungsdialog für
  destruktive Aktionen, Ausnahme ungespeicherte Sheet-Eingabe). Ergänzt in
  Runde 2 des Pakets PO-2026-09-20-009 am 2026-09-20 (Plausibilitäts-/
  Vollständigkeits-Marker, zweiter Verwendungsfall für `--color-warning`).
  Ergänzt in Runde 2 des Pakets PO-2026-09-20-010 am 2026-09-20 (Gespeicherte
  Mahlzeiten: Mahlzeit-Sheet-Pattern M1/M2/M3, Segment-Tabs im
  Eintrags-Sheet, Verwaltungsansicht, weitere markierungsfreie
  Summen-Kontexte). Ergänzt in Runde 2 des Pakets PO-2026-09-20-011 am
  2026-09-20 (Inline-Rückmeldung mit Rückgängig-Bestätigung statt
  Undo-Snackbar). Ergänzt in Runde 2 des Pakets PO-2026-09-20-012 am
  2026-09-20 (Bottom-Navigation final eingeführt, Zeitraum-Navigation
  Woche/Monat, Balken-Chart mit Detail-Tooltip für den Verlauf). Ergänzt in
  Runde 2 des Pakets PO-2026-09-20-014 am 2026-09-20 (Sync-Status-Marker für
  Offline-Puffer, dritter Verwendungsfall für 16px-Icon-Ausnahme, bewusst
  ohne dritten `--color-warning`-Fall — siehe dort). Ergänzt in Runde 2
  des Pakets PO-2026-09-20-015 am 2026-09-20 (Gewichtslog &
  Kalorienziel-Vorschlag: Liniendiagramm als bewusste Abweichung vom
  Balken-Pattern, Vorschlagskarte als neutrales-Angebot-Pattern, ein
  Gewichtswert pro Kalendertag mit Bestätigungsdialog beim Ersetzen).
  Nachgepflegt am 2026-09-20 nach Meldung des `architekt` aus Paket
  PO-2026-09-20-013a (Token-Fundament, Umsetzung): Makrofarben-Hexwerte an
  die im Code bereits kontrastkonform angepassten Werte angeglichen,
  Elevation-Tokens (`--elevation-flat|medium|high`) ergänzt und alle
  Prosa-Stellen darauf umgestellt, `--color-border-strong` von der
  Neutral-Skala entkoppelt (WCAG-1.4.11-Verfehlung behoben, siehe
  „Token-Architektur"). Ergänzt am 2026-09-22 in einer begrenzten
  Design-Nachpflege-Runde zu Paket PO-2026-09-20-015 (Gewichtslog &
  Kalorienziel-Vorschlag): Zielgewicht-Feldblock in der Ziele-Ansicht
  (bislang nicht vorgesehen), „Kein Zielgewicht gesetzt"-Zustand und
  „Halten"-Zustand der Vorschlagskarte, Zustands-Priorität zwischen den
  drei möglichen Ersatzzuständen der Vorschlagskarte. Nachgepflegt am
  2026-09-22 nach Meldung des `architekt` aus den Paketen
  PO-2026-09-20-013b/014: Layout-Tokens `--size-bottom-nav-height`/
  `--size-fab` als Rollen-Tokens in „Token-Architektur" ergänzt (bisher nur
  Prosa), inkl. der verbindlichen Bottom-Offset-Formel des Update-Banners;
  Exklusivität der Sync-Marker-Inline-Erläuterung („Sync-Status-Marker")
  von „seitenweit" auf „pro Mahlzeiten-Sektion" präzisiert — entspricht dem
  tatsächlich umgesetzten und für den Anwendungsfall passenden Verhalten.
- **Zuletzt überarbeitet**: 2026-09-22.
- **Grundlage**: `.claude/context/design-concept.md` (verbindlich, siehe dort
  für Marke, Farbsystem, Theming, Typografie, Spacing, Form & Tiefe,
  Ikonografie, Motion, Barrierefreiheit — wird hier nicht wiederholt).

## Token-Architektur

Zwei Ebenen. Komponenten referenzieren **ausschließlich Rollen-Tokens**,
nie Skala-Tokens, nie Literal-Farben. Alle Tokens liegen in **einer**
zentralen Datei als CSS Custom Properties auf `:root`. Kein
`@media (prefers-color-scheme)`, kein zweiter Token-Satz (Light-Mode-only,
siehe Konzept).

### Skala-Tokens (primitiv, nicht direkt in Komponenten verwenden)

- **Neutral**: `--color-neutral-0:#FFFFFF, -50:#F7F8F8, -100:#EFF1F0, -200:#E2E5E4, -300:#CBD0CE, -400:#A9B0AD, -500:#828B87, -600:#5F6764, -700:#454B49, -800:#2C302F, -900:#1A1C1B`
- **Spacing**: `--space-1:4px, -2:8px, -3:12px, -4:16px, -6:24px, -8:32px, -12:48px, -16:64px`
- **Radius**: `--radius-sm:8px, -md:16px, -lg:24px (nur top-left/top-right bei Sheets), -full:999px`
- **Typo**: `--font-size-xs:12px, -sm:14px, -md:16px, -lg:20px, -xl:24px, -2xl:32px, -4xl:48px`; `--font-weight-regular:400, --font-weight-semibold:600`; `--line-height-body:1.5, --line-height-heading:1.2`; `font-variant-numeric: tabular-nums` global über Utility-Klasse `.tnum` für alle Zahlwerte
- **Motion**: `--duration-fast:120ms, --duration-base:180ms, --duration-slow:240ms, --duration-ring:400ms`; `--ease-out:cubic-bezier(0,0,0.2,1), --ease-in:cubic-bezier(0.4,0,1,1)`

### Rollen-Tokens (einzige Referenz für Komponenten)

- `--color-surface: var(--color-neutral-0)`, `--color-surface-subtle: var(--color-neutral-50)`, `--color-surface-sunken: var(--color-neutral-100)` (z. B. Skeleton-Hintergrund)
- `--color-text: var(--color-neutral-900)`, `--color-text-muted: var(--color-neutral-600)`, `--color-text-disabled: var(--color-neutral-400)`
- `--color-border: var(--color-neutral-200)`, `--color-border-strong: #878F8C` (**bewusst entkoppelt von `--color-neutral-300`**, siehe Begründung unten)
- `--color-accent: #2E7D6B`, `--color-accent-subtle: #E3F0EC`, `--color-accent-on: #FFFFFF` (Textfarbe auf Accent-Flächen)
- `--color-success: #4F9153`, `--color-warning: #C1631B`, `--color-danger: #B23B3B` — je einmalig, keine eigene Skala. `--color-success` und `--color-danger` haben je genau einen Verwendungsfall. `--color-warning` hat **zwei bestätigte** Verwendungsfälle: „Ziel deutlich überschritten" (Kalorienring/Makro-Balken, Tagesansicht) und „Nährwerte unplausibel" (Marker-Icon in Suchtrefferliste/Step B, Banner in der Bearbeitungsansicht — siehe „Plausibilitäts-/Vollständigkeits-Marker"). Beide Fälle sind nie im selben Screen gleichzeitig sichtbar, da die Tagesansicht bewusst markierungsfrei bleibt (siehe dort) — keine Kollisionsgefahr, daher keine dritte Verwendung ohne erneute Prüfung ergänzen.
- Makro-Datenviz-Palette (getrennt von Accent/Semantik, nie als Akzent verwenden): `--color-macro-carbs: #A58520`, `--color-macro-protein: #4C60AB`, `--color-macro-fat: #B95844`. Werte am 2026-09-20 nach Paket PO-2026-09-20-013a auf die vom `frontend-lead` wegen WCAG-Kontrastverfehlung gegen `--color-surface`/`#FFFFFF` korrigierten Werte angeglichen (Nachdokumentation, keine neue Entscheidung): Carbs 2.42:1→3.51:1, Protein 3.85:1→5.88:1, Fett 3.22:1→4.62:1 — jeweils per HSL-Lightness × 0.82, Farbton/Sättigung unverändert, Farbfamilie erhalten.
- Fokus: `--color-focus-ring: var(--color-accent)`, `--focus-ring-width: 2px`, `--focus-ring-offset: 2px`
- Elevation (Schattenwerte, siehe Konzept „Form & Tiefe" für die Grundhaltung „Schatten sparsam, nur bei über der Fläche schwebenden Elementen"): `--elevation-flat: 0 1px 2px rgba(26,28,27,0.06)` (Karten), `--elevation-medium: 0 4px 12px rgba(26,28,27,0.12)` (FAB), `--elevation-high: 0 12px 32px rgba(26,28,27,0.16)` (Sheets/Dialoge, Chart-/Diagramm-Tooltips). Komponenten referenzieren ausschließlich diese drei Tokens für `box-shadow`, keine Literalwerte.
- Layout-Höhen fest am unteren Bildschirmrand positionierter Elemente (Nachpflege 2026-09-22, Paket PO-2026-09-20-013b, ADR-0015 Punkt 3 — lösen die zuvor an drei Stellen wiederholten 56px-Literale in main-layout, bottom-nav und diary-shell-FAB ab): `--size-bottom-nav-height: 56px`, `--size-fab: 56px`. Komponenten referenzieren ausschließlich diese beiden Tokens für die jeweilige Höhe/Breite, kein 56px-Literal. Verbindliche Bottom-Offset-Formel des Update-Banners (siehe „Update-Hinweis-Komponente"): `calc(var(--size-bottom-nav-height) + env(safe-area-inset-bottom) + var(--space-4) * 2 + var(--size-fab))` — ein `--space-4`-Abstand zwischen Navigation und FAB, ein weiterer zwischen FAB und Banner. Stapelreihenfolge von oben nach unten bei gleichzeitiger Sichtbarkeit: Update-Banner → FAB → Bottom-Navigation (siehe auch „Bottom-Navigation").

**`--color-border-strong` — Entkopplung von der Neutral-Skala (Nachpflege
2026-09-20, Paket PO-2026-09-20-013a):** `var(--color-neutral-300)`
(`#CBD0CE`) erreichte gegen `--color-surface`/`#FFFFFF` nur 1.56:1 und
verfehlte die 3:1-UI-Schwelle (WCAG 1.4.11) an allen drei Verwendungsstellen
(gestrichelte Zukunfts-Kontur im Verlauf-Balken-Chart, Datepicker-/
Navigationsgrenzen im Deaktiviert-Zustand, Drag-Handle der Bottom-Sheets).
Gewählter Weg: **eigener, von der Skala entkoppelter Literalwert** (Option
b) statt Abdunkeln von `--color-neutral-300` selbst (Option a) oder
Umstellen einzelner Verwendungsstellen auf einen anderen Token (Option c).
Begründung: `--color-neutral-300` ist Teil der fortlaufenden Helligkeits-
Progression der Skala (`-200` → `-300` → `-400`); ein Abdunkeln bis zur
3:1-Schwelle hätte `-300` optisch praktisch auf Höhe von `-500` gebracht und
damit die Skala für jede künftige, heute noch nicht existierende
Verwendung von `-300` verzerrt. Eine geprüfte Kontrollsuche im Code ergab
aktuell **nur** `--color-border-strong` als Referenz auf `--color-neutral-300`
— Option c (einzelne Stellen umstellen) war daher nicht nötig, da alle drei
betroffenen Stellen ohnehin über denselben Rollen-Token laufen. Neuer Wert
`#878F8C`, gleiche kühl-graugrüne Farbfamilie wie die Neutral-Skala, gegen
`--color-surface`/`#FFFFFF` gemessen **3.31:1** (vorher 1.56:1) — erfüllt
die 3:1-UI-Schwelle mit Sicherheitsmarge. An allen drei Verwendungsstellen
bleibt Farbe weiterhin nicht alleiniger Bedeutungsträger (Kontur-Stil/Text/
Form ergänzen), das war schon vor dieser Korrektur so und ändert sich nicht.
Umsetzung in `tokens.css` folgt als eigenes, vom `architekt` einzuordnendes
Paket, sobald dieser Zielwert (`#878F8C`) übernommen wird.

Die Hex-Werte sind Vorschlag, keine geprüfte Endabnahme: der `frontend-lead`
prüft vor Merge die tatsächlichen Kontraste (4.5:1 Text, 3:1 UI/Diagramm)
mit einem Tool. Feinjustierung einzelner Hex-Werte innerhalb der genannten
Farbfamilie ist erlaubt, die Rollen-/Skala-Struktur nicht.

## Touch-Ziele

Jedes interaktive Element (Button, Icon-Button, Listenzeile mit
Tap-Aktion, Chip, Checkbox-Label) hat eine Trefferfläche ≥48×48px, auch
wenn das sichtbare Element kleiner ist (Padding statt visueller
Vergrößerung); mindestens `--space-2` (8px) Abstand zum nächsten Ziel.

## Update-Hinweis-Komponente

- Persistentes Banner am unteren Bildschirmrand (kein Toast, kein Modal),
  über FAB und Bottom-Navigation, mit `safe-area-inset-bottom`, verdeckt
  FAB und Navigation nicht. Fläche `--color-surface`, 1px `--color-border`,
  Radius `--radius-md` oben, `role="status"`, kein Fokusraub, keine
  Modalität.
- Text „Neue Version verfügbar" in `--font-size-sm`. Zwei Aktionen:
  **„Neu laden"** als Primäraktion (`--color-accent`, wendet das Update an
  und lädt neu), **„Später"** als neutraler Textbutton (blendet das Banner
  aus, wendet das Update nicht an). Kein X-Icon ohne Label.
- „Später" ist kein dauerhaftes Unterdrücken: das Banner erscheint erneut
  beim nächsten Kaltstart bzw. wenn die App wieder in den Vordergrund
  kommt, solange das Update nicht angewendet ist — aber nicht wiederholt
  in derselben Sitzung.
- Ausgelöst über `SwUpdate.versionUpdates` bei `VERSION_READY`,
  verschwindet automatisch nach Reload oder bei
  `VERSION_INSTALLATION_FAILED`.
- Einblenden `--duration-base` (180ms) `--ease-out` von unten, kein
  Layout-Shift des restlichen Contents (position: fixed/sticky).
  `prefers-reduced-motion`: Ein-/Ausblenden ohne Bewegung, nicht
  ersatzlos streichen.

## Datumsnavigation (wiederverwendbares Pattern)

Für Ansichten mit tagesbezogener Vor-/Zurück-Navigation (z. B. Tagebuch-
Tagesansicht):

- Layout: „‹" Zurück-Chevron — Datumslabel (Tap öffnet Datepicker-Sheet) —
  „›" Vor-Chevron, horizontal, Touch-Ziele je ≥48×48px.
- Ist ein Navigationsende erreicht (z. B. maximales Vorwärtsdatum), wird
  der jeweilige Chevron **deaktiviert dargestellt** (reduzierte Deckkraft,
  `aria-disabled="true"`, nicht aus dem Layout entfernt — Position bleibt
  stabil), nicht ausgeblendet. Der Datepicker im Sheet deaktiviert
  dieselben Datumsgrenzen (nicht tappbar, visuell abgesetzt via
  `--color-text-disabled`).
- **Heute/Zukunft/Vergangenheit sind textuell erkennbar, nie nur farblich**:
  Label zeigt „Heute", „Morgen" bzw. „in {n} Tagen" (solange innerhalb des
  erlaubten Vorwärtsfensters) statt nur des Datums; „Gestern" für den
  Vortag; alle übrigen Vergangenheitstage zeigen Wochentag + Datum (z. B.
  „Mo, 14. Sep."), ohne Relativangabe. Diese Konvention gilt für jede
  tagesbezogene Navigation, nicht nur für konkrete Datumsgrenzen — die
  Grenzwerte selbst (wie weit vor/zurück) sind je Paket über `constraints`
  festzulegen, nicht hier.

## Kalorienring

- SVG-Ring, Strichstärke `--space-2` (8px), Restfläche `--color-border`;
  zentrale Zahl `--font-size-4xl`/`--font-weight-semibold`/`.tnum`, darunter
  bei gesetztem Ziel „von &lt;Ziel&gt; kcal" in
  `--font-size-sm`/`--color-text-muted` (Nachpflege 2026-09-23 — vorher nur
  die bloße Einheit „kcal" ohne Zielwert, auf Nutzerwunsch ergänzt).
- Wertwechsel animiert über `stroke-dashoffset`, max. `--duration-ring`
  (400ms), `--ease-out`.
- **Kein Ziel gesetzt:** ist für kcal kein Ziel hinterlegt, bleibt der Ring
  ungefüllt (Track-Farbe `--color-border`), die zentrale Zahl zeigt den
  Ist-Wert normal (`--color-text`, kein Warnton), darunter statt der
  Einheit „kcal" der Text „Kein Ziel gesetzt" in
  `--color-text-muted`/`--font-size-sm`. Kein Prozent-/Überschreitungs-
  vergleich möglich, daher auch keine Warnfarbe.
- **Überschreitungs-Darstellung (Toleranzschwelle 105 %, einheitlich für
  kcal und alle drei Makros):**
  - Bis einschließlich 105 % des Ziels: Darstellung bleibt neutral/Akzent
    — der Ring füllt in `--color-accent`, kein Warnsignal. Diese Zone ist
    bewusste Toleranz, keine Überschreitung im UI-Sinn.
  - Über 105 %: der bis zum Ziel (100 %) erreichte Teil des Rings bleibt
    `--color-accent`; der Überschuss ab 100 % wird als zusätzliches
    Segment über den Ringanfang hinaus in `--color-warning` gezeichnet.
    Der Ring wird **nicht** vollflächig umgefärbt.
  - Die zentrale Kalorienzahl wechselt bei Überschreitung über 105 % auf
    `--color-warning`.
  - Farbe ist nie alleiniger Bedeutungsträger: zusätzlich Text
    „+123 kcal über Ziel" (analog für Makros in g) neben Ring/Balken.

## Makro-Balken

- Horizontale Balken pro Makro, Höhe `--space-2`, Radius `--radius-full`,
  Grundfüllung aus der Makro-Palette (`--color-macro-carbs|protein|fat`);
  Label (Name) links, Wert (`Xg / Yg`) rechts in `.tnum`.
- Gleiche 105 %-Schwelle wie beim Kalorienring: bis einschließlich 105 %
  bleibt der Balken vollständig in seiner Makro-Farbe. Über 105 % erscheint
  nur der über das Ziel (100 %) hinausgehende Anteil in `--color-warning`,
  die Makro-Farbe bleibt für den Rest erhalten. Das Wert-Label wechselt bei
  Überschreitung über 105 % ebenfalls auf `--color-warning` und zeigt den
  Überschuss als Text (z. B. „+12 g über Ziel").
- **Kein Ziel gesetzt (pro Makro einzeln möglich, da Ziele teilweise
  gesetzt sein können):** Balken zeigt keine Farbfüllung (leerer Track,
  `--color-border`), Wert-Label rechts zeigt nur den Ist-Wert ohne
  Zielbezug (z. B. „18 g" statt „18 g / 60 g") und ergänzt „— kein Ziel"
  in `--color-text-muted`. Gilt unabhängig je Makro; andere Makros mit
  gesetztem Ziel zeigen ihre normale Darstellung unverändert.

## Plausibilitäts-/Vollständigkeits-Marker (wiederverwendbares Pattern)

Für Foods mit fehlenden oder widersprüchlichen Nährwerten — genutzt von
Suchtrefferliste, Mengen-Erfassung (Step B) und Bearbeitungsansicht eines
Foods; gilt für jede künftige Ansicht, die denselben Food-Datensatz zeigt.

- **Zwei Zustände, je Food unabhängig ermittelt, können gleichzeitig
  zutreffen**: „unvollständig" (mindestens einer der vier Pflichtwerte kcal,
  Protein, Kohlenhydrate, Fett je 100g fehlt) und „unplausibel"
  (widersprüchliche oder technisch unmögliche Werte).
- **Icons**: 16px Outline (bewusste Ausnahme von der 24px-Basis des
  Konzepts wegen Zeilendichte). „Unvollständig" = `circle-help`,
  `--color-text-muted` (neutral, keine Warnfarbe — es fehlt nur eine
  Angabe, es liegt kein Widerspruch vor). „Unplausibel" = `triangle-alert`,
  `--color-warning`.
- **Prüflogik**:
  - Die Makrosummen-Prüfung (Summe Protein+Kohlenhydrate+Fett > 100g/100g)
    läuft immer mit den **vorhandenen** Makrowerten, auch wenn einer fehlt.
    Übersteigt schon die Teilsumme 100g/100g, gilt „unplausibel" — auch bei
    gleichzeitig fehlendem Wert.
  - Die kcal-Abweichungsprüfung (>10 % zwischen angegebenen kcal und aus
    Makros errechneter Energie) läuft **nur**, wenn alle vier Pflichtwerte
    vorhanden sind. Fehlt einer, wird diese Prüfung nicht ausgeführt und
    nicht angezeigt.
  - „Unvollständig" gilt unabhängig davon, sobald mindestens einer der vier
    Pflichtwerte fehlt.
- **Anzeige in Einzel-Icon-Kontexten** (ein Marker-Slot pro Food: 20px-Slot
  in der Suchtrefferliste, Marker neben dem Food-Namen in Step B): pro Food
  ist nur **ein** Icon gleichzeitig sichtbar. Treffen beide Zustände zu
  (z. B. Fett fehlt, aber Protein+Kohlenhydrate allein schon >100g/100g),
  hat **„unplausibel" Vorrang** — Icon/Farbe wie oben, „unvollständig" wird
  in diesem Slot nicht zusätzlich angezeigt. Der Screenreader-Text vor dem
  Food-Namen benennt nur den angezeigten (priorisierten) Status.
- **Anzeige in der Detailansicht** (Banner in der Bearbeitungsansicht eines
  Foods, mehr Platz verfügbar): listet **alle zutreffenden Befunde**
  einzeln mit konkreten Zahlen auf, nicht nur den priorisierten — kein
  Banner-Limit auf einen Befund, mehrere Sätze untereinander in einem
  gemeinsamen Banner.
- **Nutzbarkeit für Tagebuch-Einträge**: ein markiertes Food ist
  uneingeschränkt nutzbar — keine Bestätigung, kein Dialog beim Speichern
  eines Eintrags mit markiertem Food. Fehlende Werte fließen als **0** in
  Berechnung und Tagessumme ein, keine Schätzung. Der Marker bleibt in
  Step B sichtbar (gleiches Icon/gleiche Farbe wie in der Trefferliste).
- **Tagesansicht bleibt markierungsfrei**: die Tagebuch-Übersicht (Zeile je
  Eintrag, Tagessumme) zeigt **nie** einen Plausibilitäts-/Vollständigkeits-
  Marker, unabhängig vom Status des zugrunde liegenden Foods. Damit sind
  „Ziel überschritten" (`--color-warning` an Ring/Balken) und „Nährwerte
  unplausibel" (`--color-warning` an Marker/Banner) nie im selben Screen
  gleichzeitig sichtbar — Grundlage für die Doppelbelegung von
  `--color-warning`, siehe „Token-Architektur".
- **Weitere markierungsfreie Summen-Kontexte (Gespeicherte Mahlzeiten,
  Paket 010)**: aus demselben Grund — es sind Summen-/Übersichtskontexte,
  kein Ort für eine Einzel-Food-Bewertung — bleiben auch die
  Positionsliste in Step M1 des Mahlzeit-Sheets, der Log-Tab
  „Gespeicherte Mahlzeiten" im Eintrags-Sheet und die Verwaltungsliste
  gespeicherter Mahlzeiten **ohne** Marker. Innerhalb desselben
  Mahlzeit-Sheets zeigen jedoch **M2 (Food-Suche)** und **M3 (Menge)** den
  Marker unverändert wie Step A/Step B des Eintrags-Sheets — dort wird ein
  einzelnes Food ausgewählt bzw. bemessen, dieselbe Situation wie bei einem
  Einzel-Eintrag.

## Mahlzeiten-Sektionen (Frühstück/Mittag/Abend/Snacks)

- Getrennt durch `--space-8` Abstand + Überschrift (`--font-size-lg`,
  `--font-weight-semibold`), kein Trennstrich.
- Sektionskopf zeigt Name + kcal-Zwischensumme rechtsbündig, `.tnum`.
- Eintragszeilen: Food-Name links, Menge + kcal rechts (`.tnum`),
  Trefferfläche der ganzen Zeile ≥48px hoch (Tap öffnet Bearbeitung).

## Sync-Status-Marker (Offline-Puffer, wiederverwendbares Pattern, Paket 014)

Für Tagebuch-Einträge, die lokal gepuffert wurden, weil sie nicht sofort
zum Server übertragen werden konnten (offline oder Übertragungsfehler).
Betrifft die Eintragszeile aus „Mahlzeiten-Sektionen" (Food-Name links,
Menge + kcal rechts). **Bewusste Ausnahme** von „Tagesansicht bleibt
markierungsfrei" (siehe „Plausibilitäts-/Vollständigkeits-Marker"): jene
Regel gilt ausdrücklich nur für den Plausibilitäts-/Vollständigkeits-Marker
(Datenqualität eines Foods), nicht für den Sync-Status (Systemzustand eines
Eintrags) — beide Marker sind unabhängige Konzepte mit getrennter
Ikonografie/Farbe und können in derselben Zeile grundsätzlich beide
vorkommen, ohne sich zu widersprechen.

- **Icon**: 16px Outline (gleiche Ausnahme von der 24px-Basis wie beim
  Plausibilitäts-Marker, aus Zeilendichte-Gründen), links vor dem
  Food-Namen, vor einem eventuell vorhandenen Plausibilitäts-Marker.
  Kein Farbwechsel der Zeile selbst, kein Layout-Shift des Betrags rechts.
- **Zwei sichtbare Zustände, ausschließlich in `--color-text-muted`** —
  bewusst **nicht** `--color-warning` und **nicht** `--color-danger`:
  Sync-Status ist ein transienter Systemzustand, kein Bewertungssignal
  (keine Ziel-Überschreitung, keine Datenqualitätswarnung, keine
  Validierung). Damit bleibt `--color-warning` bei seinen zwei bestätigten
  Verwendungsfällen (siehe „Token-Architektur") — kein dritter Fall, keine
  Kollisionsprüfung nötig.
  - **„Wartet auf Sync"**: Icon `cloud` (Outline). Erscheint mit
    `--duration-base`/`--ease-out` Fade-in, sobald ein Eintrag gepuffert
    statt übertragen wurde. Automatischer Hintergrund-Retry bei
    offline→online-Wechsel und bei App-Start, bis zu 3 Versuche je
    Online-Phase für temporäre Fehler (kein Netz, 408, 429, 5xx) — kein
    manueller Auslöser in diesem Zustand, daher **keine** Tap-Aktion außer
    der Inline-Erläuterung unten.
  - **„Dauerhaft gescheitert"**: Icon wechselt zu `cloud-off` (Outline,
    weiterhin `--color-text-muted`, Unterscheidung zum wartenden Zustand
    über Icon-Form + Text, nicht über Farbe). Tritt ein bei permanenten
    Fehlern (4xx außer 408/429, sofort) oder nach 3 erfolglosen
    automatischen Versuchen einer Online-Phase bei temporären Fehlern. Der
    Eintrag wird **nie** automatisch verworfen.
  - **Erfolgreich synchronisiert**: Icon blendet mit
    `--duration-base`/`--ease-in` aus (kein Erfolgs-Häkchen, keine
    zusätzliche Farbe) — die Zeile sieht danach aus wie jede normale,
    bereits synchronisierte Zeile.
- **Tap auf das Icon** (beide Zustände) öffnet eine Inline-Erläuterung
  unterhalb der Zeile, volle Breite, `--color-surface-subtle`-Fläche,
  `--space-3` Innenabstand, schiebt nachfolgende Zeilen nach unten statt sie
  zu verdecken (kein Tooltip/Popover) — Ein-/Ausblenden
  `--duration-base`/`--ease-out`. Erneuter Tap auf dasselbe Icon schließt
  die Erläuterung.
  - **Exklusivität ist pro Mahlzeiten-Sektion, nicht seitenweit** (präzisiert
    2026-09-22, nach Meldung des `architekt` aus der Umsetzung von Paket
    014): Tap auf ein anderes Sync-Icon **innerhalb derselben Sektion**
    schließt eine dort offene Erläuterung und öffnet sofort die neue —
    State liegt lokal in der jeweiligen Mahlzeiten-Sektions-Komponente
    (kein zentraler State im Store nötig). Erläuterungen in
    **unterschiedlichen** Sektionen können gleichzeitig offen sein; das ist
    bewusst so gewollt, nicht nur eine Umsetzungslücke — die Tagesansicht
    ist typischerweise kurz genug, dass mehrere gleichzeitig offene
    Erläuterungen in verschiedenen Sektionen nicht unübersichtlich werden,
    und die Sektion ist ohnehin schon die etablierte Gliederungseinheit
    (siehe „Mahlzeiten-Sektionen"). **Nicht** mehr analog zum
    Chart-Tooltip-Pattern des Verlaufs (dort seitenweit exklusiv, da dort
    nur ein einziger Chart-Container existiert) — die frühere Formulierung
    „nur ein Tooltip gleichzeitig" war für dieses Pattern missverständlich
    und ist hiermit ersetzt.
  - **Wartend**: Text „Wird synchronisiert, sobald du wieder online bist."
    (`--font-size-sm`/`--color-text-muted`). Keine Aktion.
  - **Gescheitert**: Text „Synchronisierung fehlgeschlagen nach mehreren
    Versuchen." (`--font-size-sm`/`--color-text-muted`), darunter **die
    einzige manuelle Retry-Aktion des gesamten Patterns**: Textbutton
    „Erneut versuchen" (`--color-text`, kein Rahmen, kein Akzent — es ist
    eine korrigierende, keine primäre Aktion; 48px Trefferfläche), stößt
    einen sofortigen Einzel-Retry für genau diesen Eintrag an. Kein
    Sammel-Retry, keine globale Aktion.
- **Kein Sammel-Banner, keine Sammel-Aktion für mehrere ausstehende
  Einträge.** Bewusst nicht umgesetzt, Nutzerentscheidung 2026-09-20 (Paket
  PO-2026-09-20-014) — nur der dezente Zeilen-Marker, kein zusätzliches
  Banner oberhalb/unterhalb der Liste.
- **Bearbeiten eines ungesyncten Eintrags**: normales Bearbeiten-Sheet wie
  bei jedem synchronisierten Eintrag. Ändert den gepufferten Eintrag selbst
  (kein zweiter Queue-Eintrag); der Sync-Status-Marker bleibt nach dem
  Speichern in seinem aktuellen Zustand sichtbar (weiterhin „wartend" bzw.
  „gescheitert", bis der nächste Sync-Versuch greift).
- **Löschen eines ungesyncten Eintrags**: bestehender projektweiter
  Bestätigungsdialog wie bei jedem anderen Tagebuch-Eintrag (kein
  Sonderfall, siehe „Bestätigungsdialog für destruktive Aktionen"), entfernt
  den Eintrag aus der Queue ohne Übertragungsversuch.

## Eingabe-Einstieg: FAB + Sektions-Buttons

- **FAB** ist der globale, primäre Eingabe-Einstieg: fixiert unten rechts,
  `--space-4` Rand zu Bildschirmkante und zur Bottom-Navigation, 56×56px
  sichtbar (Trefferfläche deckt die 48px-Regel bereits ab), `--radius-full`,
  `--color-accent`-Fläche, Plus-Icon `--color-accent-on`,
  `aria-label="Eintrag hinzufügen"`, Elevation `--elevation-medium`. Öffnet das
  Eingabe-Sheet mit einer nach Tageszeit **vorgewählten** Mahlzeit
  (z. B. vormittags Frühstück, mittags Mittag, abends Abendessen —
  Snacks ohne festen Zeitbezug als Fallback außerhalb der drei Fenster).
- **Zusätzlich** trägt jede Mahlzeiten-Sektion einen eigenen, kleineren
  „+"-Button. Dieser öffnet **dasselbe** Eingabe-Sheet, aber mit genau
  seiner Sektion vorausgewählt (keine Vorbelegung nach Tageszeit).
- **Nur der FAB trägt `--color-accent`.** Sektions-Buttons sind neutral
  (`--color-neutral-*`-Fläche/-Rahmen, kein Akzent), 48×48px Trefferfläche.
  Damit gilt „genau eine Akzentfarbe/Primäraktion je Ansicht" trotz
  mehrerer Eingabe-Einstiege.

## Buttons

- Standard-Buttons (Primär, Sekundär, Textbutton in Formularen/Dialogen)
  erhalten Radius `--radius-sm` (8px). Abweichungen: FAB und Pills
  (`--radius-full`), siehe „Eingabe-Einstieg" und Konzept „Form & Tiefe".
- Primärbutton je Ansicht/Formular genau einer, Fläche `--color-accent`,
  Text `--color-accent-on`. Sekundär/neutral: `--color-neutral-*`-Rahmen
  oder -Fläche, kein Akzent.

## Bottom-Navigation (final, Paket 012)

Projektweit gültig für alle Ansichten hinter dem Login ab jetzt.

- **Drei Tabs** (seit ADR-0019): **Tagebuch**, **Gewicht**, **Verlauf**.
  „Ziele" ist **kein** eigener Tab, sondern eine Einstellungsseite über das
  Zahnrad-/Profil-Icon (Paket 005) — bleibt unverändert.
- **Layout**: fixiert am unteren Bildschirmrand, `--color-surface`-Fläche,
  1px `--color-border` als Top-Trennlinie (bewusste Ausnahme von „Abstand
  statt Linie" — Navigationsleisten grenzen sich üblicherweise über eine
  Linie ab, keine Elevation/Schatten, bleibt flach), Höhe 56px zzgl.
  `safe-area-inset-bottom` als Padding. Je Tab: Icon (24px Outline aus dem
  bestehenden Set) über Label (`--font-size-xs`), vertikal zentriert,
  gleich breite Tabs, Trefferfläche volle Tab-Breite × 56px (deckt 48px
  bereits ab).
- **Zustände**: aktiver Tab Icon+Label in `--color-accent`,
  `aria-current="page"`; inaktiver Tab in `--color-text-muted`. Kein Badge/
  Dot-Pattern definiert (nicht gebraucht, nicht vorab bauen).
- **Landmark**: `<nav aria-label="Hauptnavigation">`, Tabs als
  fokussierbare Links/Buttons in der Tab-Reihenfolge des Layouts.
- **Verhältnis zu FAB und Update-Banner**: Stapelreihenfolge von oben nach
  unten bei gleichzeitiger Sichtbarkeit bleibt Update-Banner → FAB →
  Bottom-Navigation (Update-Banner verdeckt weder FAB noch Navigation,
  siehe „Update-Hinweis-Komponente"). **Der FAB ist nur auf dem
  Tagebuch-Tab sichtbar** — Verlauf ist eine reine Auswertungsansicht ohne
  Tages-Eingabekontext, daher kein Eingabe-Einstieg dort. Sektions-Buttons
  existieren ohnehin nur innerhalb des Tagebuchs.
- Icons (Vorschlag aus dem bestehenden Outline-Set): Tagebuch =
  `notebook-text`, Gewicht = Waage (abgerundetes Quadrat mit Skalenbogen),
  Verlauf = `bar-chart-2`.

## Verlauf: Zeitraum-Navigation, Balken-Chart mit Detail-Tooltip (Paket 012)

Wiederverwendbares Pattern für jede künftige periodenbezogene Auswertung
(nicht nur die aktuelle Verlaufsansicht).

### Zeitraum-Umschalter (Woche/Monat)

- Zwei Segment-Tabs „Woche" / „Monat" (Pill-Form, `--radius-full`, aktiver
  Tab `--color-accent`-Fläche) oben in der Ansicht — gleiches Grundmuster
  wie die Segment-Tabs im Eintrags-Sheet.
- Darunter Perioden-Navigation nach dem Muster der „Datumsnavigation":
  „‹" — Periodenlabel (Tap öffnet **kein** Sheet, rein informativ) — „›",
  Touch-Ziele ≥48×48px. Periodenlabel: Woche „15.–21. Sep.", Monat
  „September 2026". Vorwärts-Chevron deaktiviert (reduzierte Deckkraft,
  `aria-disabled="true"`, Position bleibt stabil), sobald die nächste
  Periode ausschließlich in der Zukunft läge (keine Einträge dort möglich
  außer im erlaubten Vorwärtsfenster bis heute+7, siehe unten).
- **Kontext-Erhalt beim Wechsel Woche ↔ Monat**: die neue Periode enthält
  immer den bisherigen Anker-Tag — den ersten Tag der zuvor sichtbaren
  Periode, oder „heute", falls die zuvor sichtbare Periode „heute" enthält.
  Kein Rücksprung auf die aktuelle Periode bei jedem Wechsel.

### Balken-Chart (kcal pro Tag)

- Ein vertikaler Balken je Tag. Wochenansicht: 7 Balken, alle beschriftet
  (Wochentagskürzel unter jedem Balken). Monatsansicht: bis zu 31 Balken in
  einem eigenen horizontal scrollbaren Chart-Container (nicht die ganze
  Seite scrollt mit), Beschriftung nur an jedem 5. Tag, um Überfüllung zu
  vermeiden; der aktuelle Anker-Tag ist beim Öffnen der Monatsansicht
  in den sichtbaren Ausschnitt gescrollt.
- **Drei Balkenzustände, visuell klar unterschieden:**
  - **Vergangener/heutiger Tag mit Einträgen** (inkl. „heute" mit
    Teilsumme): normaler Balken, gefüllt in `--color-accent` bis
    einschließlich 105 % des Tagesziels; darüber (>105 %) zusätzliches
    Segment in `--color-warning` — exakt die 105 %-Toleranzlogik von
    Kalorienring/Makro-Balken, hier auf den Tageswert angewendet.
  - **Lücke** (vergangener/heutiger Tag **ohne** Einträge): schmaler
    Balken auf Nulllinie/Minimalhöhe (4px), Fläche `--color-border`
    (flächig, keine Kontur) — liest sich als „hier gab es faktisch
    nichts, abgeschlossen". Zählt **nicht** in Durchschnitt/Nenner der
    Makro-Zusammenfassung.
  - **Zukunft ohne Einträge**: **kein** gefüllter Körper, sondern eine
    gestrichelte Kontur (1px dashed, `--color-border-strong`) in der vollen
    mit Lücken-Balken geteilten Bar-Spur, keine Füllfläche — liest sich als
    „hier ist noch offen, nicht abgeschlossen" im Gegensatz zur flächigen
    Lücke. Gilt für **jeden** zukünftigen Tag ohne Einträge, unabhängig vom
    Abstand zu heute — auch jenseits des erlaubten Vorwärtsfensters bis
    heute+7 (z. B. spätere Tage in der Monatsansicht); es gibt keine dritte
    visuelle Variante dafür. Zählt ebenfalls **nicht** in
    Durchschnitt/Nenner. Ein zukünftiger Tag **mit** Einträgen (nur
    innerhalb des erlaubten Vorwärtsfensters bis heute+7 möglich) erhält
    keine Sonderkennzeichnung und wird wie ein normaler Balken dargestellt
    — zählt aber, wie jeder Zukunftstag, **nicht** in Durchschnitt/Nenner
    der Makro-Zusammenfassung. Nur vergangene Tage (inkl. „heute" mit
    Teilsumme) fließen in den Durchschnitt ein.
- **Zielinie**: horizontale gestrichelte Referenzlinie in
  `--color-text-muted` über den Balken, Label „Ziel: {X} kcal" rechtsbündig
  über der Linie am Chart-Rand. **Kein kcal-Ziel gesetzt**: Zielinie
  entfällt vollständig (keine Linie, kein Label, keine 105 %-Logik, keine
  Warnfarbe auf den Balken — Balken über 105 % gibt es dann nicht, da kein
  Ziel zum Vergleich existiert), an derselben Stelle, an der sonst das
  Zielinien-Label stünde, erscheint stattdessen der Text
  „Kein Ziel gesetzt" (`--color-text-muted`/`--font-size-xs`) — konsistente
  Position unabhängig davon, ob ein Ziel existiert.
- **Detail-Tooltip (Tap auf einen Balken)**:
  - Jeder Balken (inkl. Lücke/Zukunft) ist ein eigenes interaktives
    Element (kein reines SVG-Rect), Tap öffnet ein Tooltip-Overlay
    (Karte `--color-surface`, Radius `--radius-sm`, Elevation `--elevation-high`),
    das **oberhalb** des Balkens erscheint mit einer kleinen Zeigerspitze
    nach unten auf den Balken. Steht der Balken am linken/rechten Rand
    des (scrollbaren) Charts, verschiebt sich das Tooltip horizontal, so
    dass es innerhalb des sichtbaren Bereichs bleibt — die Zeigerspitze
    bleibt dabei am Balken ausgerichtet, nicht am Tooltip-Zentrum. Das
    Tooltip darf dabei benachbarte Balken kurzzeitig überdecken
    (akzeptiert, da transient und mit einem weiteren Tap wieder
    schließbar).
  - **Nur ein Tooltip gleichzeitig sichtbar.** Erneuter Tap auf denselben
    Balken schließt das Tooltip. Tap auf einen anderen Balken schließt das
    aktuelle und öffnet sofort das neue (kein Doppel-Tap nötig). Tap
    außerhalb des Chart-Containers schließt das offene Tooltip. Keine
    Navigation zur Tagesansicht bei Tap.
  - **Inhalt normaler Tag**: Datum (Formatierung wie „Datumsnavigation":
    „Heute"/„Gestern"/Wochentag+Datum), darunter kcal-Ist mit Zielbezug
    wie im Kalorienring-Pattern (bzw. ohne Zielbezug bei fehlendem Ziel),
    darunter die drei Makrowerte kompakt (`Xg` je Makro in der jeweiligen
    Makrofarbe als kleiner Punkt/Label, kein eigener Balken im Tooltip).
  - **Inhalt Lücke**: Datum + Text „Keine Einträge" (`--color-text-muted`),
    keine Makrozeile, keine Aktion.
  - **Inhalt Zukunft ohne Einträge**: Datum (relatives Label „Morgen"/
    „in {n} Tagen") + Text „Noch nicht vergangen" (`--color-text-muted`),
    keine Makrozeile, keine Aktion.
  - **Barrierefreiheit**: jeder Balken zusätzlich mit vollständigem
    `aria-label`, der den Tooltip-Inhalt als Text vorwegnimmt (z. B. „Mo,
    14. Sep., 1850 von 2200 kcal, Kohlenhydrate 180g, Protein 90g, Fett
    60g" bzw. „Mo, 14. Sep., keine Einträge" bzw. „Do, 24. Sep., noch
    nicht vergangen") — Screenreader-Nutzer sind nicht auf den visuellen
    Tooltip-Trigger angewiesen. Zusätzlich existiert eine visuell
    versteckte (`sr-only`), aber im DOM vorhandene Tabellen-/Listenalter-
    native mit denselben Tageswerten für lineares Durchgehen ohne
    Diagramm-Interaktion — Grundsatz, der für jedes künftige Chart in der
    App gilt, nicht nur dieses.

### Makro-Zusammenfassung (Verlauf)

- Nutzt die bestehende Makro-Balken-Komponente unverändert (inkl.
  „Kein Ziel gesetzt"-Darstellung je Makro einzeln, siehe „Makro-Balken").
  Werte sind der **Durchschnitt pro Tag** über die in der Periode
  gezählten Tage — Lücken- und Zukunftstage fließen nicht in den Nenner
  ein, „heute" zählt mit seiner Teilsumme. Darunter ein knapper Hinweistext
  „Ø über {n} Tage" (`--color-text-muted`/`--font-size-xs`), damit
  nachvollziehbar bleibt, worauf sich der Durchschnitt bezieht.

### Leerzustand (Verlauf)

- Enthält die sichtbare Periode **keinen einzigen** vergangenen/heutigen
  Tag mit Einträgen (alle Tage Lücke oder Zukunft): Chart-Bereich wird
  durch einen Text ersetzt „Noch keine Einträge in diesem Zeitraum" +
  Link „Zum Tagebuch" (führt zum Tagebuch-Tab), gleiches Wortmuster wie
  beim Leerzustand „Gespeicherte Mahlzeiten". Zeitraum-Umschalter und
  Perioden-Navigation bleiben sichtbar/bedienbar, nur der Chart-Bereich
  wird ersetzt.

### Ladezustand (Verlauf)

- Skeleton statt Spinner: Balken-Platzhalter in einheitlicher halber
  Zielhöhe, Fläche `--color-surface-sunken`, kein Shimmer/Pulse (Motion-
  Grundsatz „Bewegung erklärt, dekoriert nicht" — ein reines Platzhalter-
  Muster genügt hier ohne zusätzliche Animation). Zeitraum-Umschalter und
  Perioden-Navigation bleiben sofort interaktiv, nur Chart und
  Makro-Zusammenfassung zeigen das Skeleton.

## Bottom-Sheets

- Öffnen von unten, `--duration-slow` (240ms) `--ease-out`, Radius
  `--radius-lg` nur oben, Drag-Handle (4×32px, `--color-border-strong`,
  zentriert, `--space-2` Abstand zum Rand) als visueller Close-Hinweis,
  zusätzlich expliziter Schließen-Button/„X" oben rechts für
  Screenreader/ohne Touch.
- Backdrop `--color-neutral-900` bei 40 % Opacity, Tap auf Backdrop
  schließt immer, auch bei ungespeicherter Eingabe (siehe „Abgrenzung:
  ungespeicherte Sheet-Eingabe bleibt ohne Bestätigung" unten) — nichts
  Gespeichertes geht dabei verloren. Löst das Sheet selbst eine destruktive
  Aktion auf bereits gespeicherten Daten aus, läuft diese über den
  separaten Bestätigungsdialog, nicht über das Schließverhalten des Sheets.

## Bestätigungsdialog für destruktive Aktionen (wiederverwendbares Pattern)

Gilt **projektweit** für jede Aktion, die bereits gespeicherte Daten
unwiderruflich entfernt oder überschreibt (z. B. Tagebuch-Eintrag löschen,
„gestern kopieren" rückgängig machen, gespeicherte Mahlzeit löschen). **Es
gibt im Projekt kein Rückgängig-/Undo-Snackbar-Pattern** — an der Stelle,
wo man sonst „sofort ausführen + Undo anbieten" erwägen würde, wird
stattdessen **immer** dieser Bestätigungsdialog vorgeschaltet. Das gilt
unabhängig davon, ob die Aktion aus einer Liste, einem Sheet oder einer
Detailansicht ausgelöst wird.

- **Modalität**: echtes Modal, `role="alertdialog"`, `aria-modal="true"`,
  `aria-labelledby` auf den Titel, `aria-describedby` auf den Beschreibungs-
  text (falls vorhanden). Backdrop wie bei Bottom-Sheets: `--color-neutral-900`
  bei 40 % Opacity. Tap auf Backdrop und `Escape` wirken wie „Abbrechen"
  (Dialog schließt, Aktion wird **nicht** ausgeführt).
- **Fokusfalle**: Fokus wird beim Öffnen in den Dialog verschoben und bleibt
  darin gefangen (Tab/Shift+Tab zyklisch nur innerhalb des Dialogs).
  **Initialer Fokus liegt auf „Abbrechen"**, nicht auf der destruktiven
  Aktion — verhindert versehentliches Bestätigen per Enter/Leertaste direkt
  nach dem Öffnen.
- **Fokus-Rückgabe**: beim Schließen (gleich auf welchem Weg — Bestätigen,
  Abbrechen, Escape, Backdrop) kehrt der Fokus exakt auf das auslösende
  Element zurück (z. B. den „Löschen"-Icon-Button der Listenzeile). Wurde
  die auslösende Zeile durch die bestätigte Aktion selbst entfernt, geht der
  Fokus auf das nächstliegende sinnvolle Element in derselben Liste
  (nächste Zeile bzw. die Sektion/Überschrift, falls keine Zeile mehr
  existiert) — nie verloren auf `<body>`.
- **Layout Mobile (Normalfall)**: zentriert auf dem Bildschirm (kein
  Bottom-Sheet, keine Verwechslung mit Eingabe-Sheets), Karte
  `--color-surface`, Radius `--radius-md`, Elevation `--elevation-high` (siehe Konzept
  „Form & Tiefe"), Innenabstand `--space-6`, max. Breite 320px bzw.
  `calc(100vw - 2 * var(--space-4))`, darunter horizontal zentriert mit
  `--space-4` Rand zur Bildschirmkante. Kein Drag-Handle (kein Sheet).
- **Inhalt/Wortlaut**:
  - Titel (`--font-size-lg`/`--font-weight-semibold`): „{Objekt} löschen?"
    — konkret benannt, kein generisches „Bist du sicher?" (z. B. „Eintrag
    löschen?", „Gespeicherte Mahlzeit löschen?", „Kopie von gestern
    rückgängig machen?").
  - Optionaler Beschreibungstext (`--font-size-sm`/`--color-text-muted`)
    nur wenn die Konsequenz über das Offensichtliche hinausgeht (z. B. bei
    „gestern kopieren rückgängig": „Alle heute daraus übernommenen
    Einträge werden entfernt."). Bei einem einzelnen Tagebuch-Eintrag
    entfällt der Beschreibungstext — der Titel genügt.
  - Zwei Aktionen nebeneinander, gleich breit, `--space-3` Abstand:
    **„Abbrechen"** (neutral/sekundär, `--color-neutral-*`-Rahmen, keine
    Akzentfarbe) links, **destruktive Aktion** (z. B. „Löschen",
    „Rückgängig machen") rechts, Fläche `--color-danger`, Text
    `--color-accent-on` (weiß) — analog zur Primärbutton-Textfarbe, nur mit
    Danger- statt Accent-Fläche. Radius `--radius-sm` wie andere
    Standard-Buttons. Beide Buttons ≥48px Trefferfläche.
- **Kein Rückgängig danach**: nach Bestätigen wird sofort gelöscht/rückgängig
  gemacht, kein Snackbar mit „Rückgängig"-Option im Anschluss — der Dialog
  vorher ist die einzige Absicherung.
- **Timing**: Ein-/Ausblenden `--duration-base` (180ms) `--ease-out`/`--ease-in`
  mit leichtem Scale/Fade (kein Slide wie bei Sheets — das würde die
  Verwechslung mit einem Bottom-Sheet begünstigen). `prefers-reduced-motion`:
  reines Fade ohne Scale.

### Abgrenzung: ungespeicherte Sheet-Eingabe bleibt ohne Bestätigung

**Bewusste Ausnahme**, nicht mit obigem Pattern zu verwechseln: Schließt ein
Nutzer ein Eingabe-Sheet (z. B. das Eintrag-Erfassungs-Sheet) mit
unvollständiger oder noch nicht gespeicherter Eingabe — über Backdrop-Tap,
Drag-Handle oder „X" —, erscheint **kein** Bestätigungsdialog. Es geht
nichts bereits Gespeichertes verloren, daher keine zusätzliche Hürde; das
Sheet schließt sofort. Diese Ausnahme gilt **nur** für das Verwerfen einer
noch nicht gespeicherten Eingabe in einem Sheet — sobald eine Aktion
bestehende, bereits gespeicherte Daten entfernt oder überschreibt, gilt
stattdessen immer der Bestätigungsdialog oben.

## Inline-Rückmeldung mit Rückgängig-Bestätigung statt Undo-Snackbar (wiederverwendbares Pattern)

Für **additive** Aktionen, die neue, bereits gespeicherte Datensätze
anlegen (kein Überschreiben bestehender Daten), bei denen aber ein
unmittelbares Rückgängigmachen sinnvoll ist — Erstverwendung: „Gestern
kopieren" (Paket 011). Löst den scheinbaren Widerspruch zwischen „additive
Aktion braucht kein Gate" und „es gibt kein Undo-Snackbar-Pattern" auf,
indem die Rücknahme selbst als destruktive Aktion behandelt wird:

- **Die auslösende Aktion selbst bleibt ohne Bestätigungsdialog** — additiv,
  nichts geht dabei verloren, analog anderen additiven Aktionen (FAB,
  Sektions-„+", Mahlzeit loggen).
- **Die Rückmeldung danach ist inline Teil des Seitenflusses am Ort der
  auslösenden Aktion**, kein Toast/Snackbar/Overlay — sie schiebt
  nachfolgenden Content, statt ihn zu verdecken. Text
  `--color-success`/`--font-size-sm` nennt das Ergebnis (z. B. Anzahl
  übernommener Datensätze), daneben/darunter ein destruktiver Textbutton
  „Rückgängig machen" (`--color-danger`, kein Rahmen, 48px Trefferfläche).
  Einblenden `--duration-base`/`--ease-out`.
- **„Rückgängig machen" führt nicht sofort aus**, sondern öffnet den
  bestehenden projektweiten Bestätigungsdialog (siehe
  „Bestätigungsdialog für destruktive Aktionen") — das Entfernen bereits
  gespeicherter Daten ist der destruktive Teil, nicht das ursprüngliche
  Anlegen. Wortlaut des Dialogs konkret auf die Aktion/den betroffenen
  Kontext bezogen, nicht generisch.
- **Kein Timer-Autodismiss.** Die Rückmeldung bleibt stehen, bis: (a) im
  Dialog bestätigt wird (Rückmeldung verschwindet, Datensätze entfernt),
  (b) über eine eigene Schließen-Affordanz verworfen wird (Rückmeldung
  verschwindet, Datensätze bleiben — danach nur noch Einzelkorrektur, keine
  Schnell-Rückgängig-Option mehr), oder (c) eine erneute gleichartige
  Aktion sie ersetzt.
- **Schließen-Affordanz**: eigenständiger „x"-Icon-Button (nicht der
  „Rückgängig machen"-Text selbst), `--color-text-muted`, 48×48
  Trefferfläche, `aria-label` beschreibt die Rückmeldung (z. B.
  „Rückmeldung schließen"), oben rechts an der Rückmeldung.
- **Nie mehr als eine Rückmeldung/Rückgängig-Option gleichzeitig pro
  auslösendem Kontext.** Eine neue gleichartige Aktion ersetzt die
  bestehende Rückmeldung, statt sie zu stapeln; die ersetzte ältere Aktion
  bleibt nur noch über Einzelkorrektur (z. B. Einzel-Löschen) rückgängig
  machbar.
- **State ist reiner Client-State ohne Schema-Erweiterung**, gebunden an
  den aktuellen Seitenaufruf/Kontext (kein Batch-/Aktions-Feld auf den
  Datensätzen, keine Persistenz über Reload/Sitzung hinaus) — sofern nicht
  im jeweiligen Paket ausdrücklich anders vom Nutzer entschieden.
- **Bei mehreren gleichartigen Auslösern in derselben Ansicht** (z. B.
  ein globaler Auslöser plus mehrere sektionsbezogene Auslöser): die
  Rückmeldung erscheint direkt am jeweils auslösenden Element, nicht an
  einer zentralen Sammelstelle — global unterhalb des globalen Auslösers,
  sektionsbezogen direkt unterhalb des jeweiligen Sektionskopfs, oberhalb
  des zugehörigen Sektionsinhalts. Jeder Auslöser trägt seine eigene
  Rückmeldung; „nie mehr als eine gleichzeitig" gilt pro Kontext (global
  bzw. je Sektion unabhängig), nicht global für die ganze Ansicht.
- **Abgrenzung**: kein Ausnahmefall vom Bestätigungsdialog-Pattern, sondern
  dessen zeitversetzte Anwendung — verboten bleibt weiterhin „destruktiv
  sofort ausführen + Undo anbieten" (siehe „Bestätigungsdialog für
  destruktive Aktionen"); hier wird additiv sofort ausgeführt, und nur die
  Rücknahme läuft über den bestehenden Dialog.

## Formulare

- Label immer oberhalb des Feldes, nie nur Placeholder.
- Validierung on-blur; nach dem ersten Fehler live bei jeder Änderung, bis
  das Feld gültig ist (Nutzer wird nicht während des ersten Tippens
  unterbrochen, aber sofort entlastet sobald korrigiert).
- Fehlermeldung inline unter dem Feld, `--color-danger`-Text
  `--font-size-xs`, kein Shake, kein Modal.
- Zahlenfelder (g, kcal) mit `inputmode="decimal"`, rechtsbündig, `.tnum`.

### Feldblock mit unabhängigem Speichern (wiederverwendbares Pattern)

Für Formulare, bei denen mehrere Werte fachlich unabhängig voneinander
sind (z. B. mehrere Einzelziele) — **kein** gemeinsamer Formular-Submit,
sondern je Feld ein eigener Speichern-Vorgang:

- Ein Feldblock = Label (oberhalb) + Input + eigener „Speichern"-Button in
  **einer Zeile** (Input flexibel breit, Button feste Breite rechts daneben).
  Die räumliche Nähe von Input und zugehörigem Button ist die primäre
  Zuordnungshilfe — nicht die Button-Beschriftung (die bleibt bei
  „Speichern", kein individuelles Label pro Feld nötig, kein Icon-only:
  ein Icon-only-Primärbutton widerspräche der Icon-Label-Regel des
  Konzepts).
  Darunter, in gleichbleibendem Platz: entweder Fehlermeldung (Standard-
  Formularstil) **oder** Erfolgsrückmeldung — nie beides gleichzeitig.
- **Speichern-Button-Zustand**: deaktiviert, wenn der Feldwert ungültig ist
  oder unverändert zum zuletzt gespeicherten Wert — Button wird erst mit
  einer gültigen Änderung aktiv. Kein Button ist „automatisch" primär für
  die ganze Ansicht.
- **Erfolgsrückmeldung ist pro Feldblock**, nicht global: Text „Gespeichert"
  in `--color-success`/`--font-size-xs` an derselben Stelle wie die
  Fehlermeldung, `role="status"`/`aria-live="polite"` (nicht global
  angekündigt), blendet mit `--duration-base` `--ease-out` ein und nach
  ca. 2400ms wieder aus (Input bleibt unverändert auf dem gespeicherten
  Wert stehen).
- **Abstand zwischen Feldblöcken**: `--space-6`, keine Rahmen/Card-Trennung
  nötig — Abstand + der pro Block wiederholte Aufbau (Label/Input/Button)
  macht die Blöcke bereits eindeutig unterscheidbar, ohne dass die Ansicht
  wie vier separate Formulare wirkt.
- **Bewusste Ausnahme von der Buttons-Regel „ein Primärbutton je
  Formular"**: hier ist jeder Feldblock sein eigener Interaktions-Scope,
  daher dürfen mehrere `--color-accent`-Speichern-Buttons gleichzeitig
  sichtbar sein (aber nur die gerade aktiven sind farbig; deaktivierte
  Buttons nutzen `--color-neutral-200`-Fläche/`--color-text-disabled`-Text,
  keine Akzentfarbe). Gilt nur für dieses Pattern, nicht generell.

## Erfolgsrückmeldung mit primärer + sekundärer Folgeaktion (wiederverwendbares Pattern)

Für Speicher-Erfolge, nach denen der Nutzer plausibel **sofort denselben
Vorgang wiederholen** will (z. B. Barcode-Serienscan, mehrfaches Loggen
einer gespeicherten Mahlzeit) — Gegenstück zum einfachen „Gespeichert"-Fade
im Feldblock-Pattern (siehe „Formulare"), das nur eine einzelne Aktion ohne
Folgeentscheidung kennt:

- **Kein Timer-Autodismiss.** Die Erfolgsrückmeldung bleibt stehen, bis der
  Nutzer eine der beiden angebotenen Aktionen antippt — kein `--duration`-
  basiertes automatisches Ausblenden wie beim einfachen „Gespeichert"-Text,
  weil hier eine echte Entscheidung mit zwei Zielen ansteht statt einer
  reinen Bestätigung.
- **Layout**: ersetzt den vorherigen Formularinhalt innerhalb desselben
  Sheets per Cross-Fade (`--duration-base`/180ms, `--ease-out`), kein
  eigenes Sheet, kein Toast. Kurzer Bestätigungstext („Gespeichert") in
  `--color-success`/`--font-size-sm`, darunter knappe Zusammenfassung des
  gespeicherten Objekts (z. B. Name + kcal, `.tnum`).
- **Hierarchie**: die Aktion, die den **Vorgang fortsetzt** (z. B. „Nächsten
  Barcode scannen"), ist die Primäraktion — voller Breite,
  `--color-accent`-Fläche, `--radius-sm`, direkt unter der Zusammenfassung.
  Die Aktion, die den **Vorgang abschließt** (z. B. „Fertig"), ist ein
  neutraler Textbutton darunter (kein Rahmen, `--color-text`, kein Akzent) —
  kleiner in der visuellen Gewichtung, aber gleiche Mindest-Trefferfläche
  (48px Höhe). Begründung: das Pattern existiert gerade, weil Wiederholung
  der erwartete nächste Schritt ist; der risikofreie Abschluss bleibt
  jederzeit erreichbar, ohne um die Aufmerksamkeit zu konkurrieren.
- **Kontext-Erhalt bei Fortsetzung**: alle Vorauswahlen aus dem vorherigen
  Durchlauf (z. B. gewählte Mahlzeit) bleiben für den nächsten Durchlauf
  erhalten. Diese Vorauswahl muss dem Nutzer **sichtbar** bleiben — entweder
  als beschriftetes Element im nächsten Formularschritt oder als
  zusätzlicher, nicht-interaktiver Kontext-Hinweis in einem vorgelagerten
  Aufnahme-/Eingabezustand (z. B. Kamera-Viewfinder) —, nie nur stillschweigend
  übernommen, damit ein falscher Kontext (z. B. falsche Mahlzeit) aus dem
  Vorlauf sofort auffällt statt erst nach dem nächsten Speichern.

## Karten/Listen

- Karten: `--color-surface`, Radius `--radius-md`, Elevation
  `--elevation-flat` (deutlich zurückhaltender als `--elevation-medium`/
  `--elevation-high`, die Sheets/Dialogen/FAB vorbehalten bleiben —
  Formulierung 2026-09-20 präzisiert: bislang „nicht bei Karten" stand im
  Widerspruch zum jetzt dokumentierten `--elevation-flat`-Token, das genau
  für Karten vorgesehen ist), Innenabstand `--space-4`.
- Listen: Zeilentrennung über `--space-3`-Innenabstand statt 1px-Linie,
  außer wenn Dichte es erfordert (z. B. Suchergebnisliste) — dort
  `--color-border` 1px zwischen Zeilen erlaubt als bewusste Ausnahme von
  der „Abstand statt Linie"-Regel des Konzepts, wegen Scan-Geschwindigkeit
  bei langen Listen.

## Gespeicherte Mahlzeiten (Verwaltung & Logging)

Betrifft eine eigene Verwaltungsansicht, ein eigenes Anlege-/Bearbeiten-Sheet
und einen zusätzlichen Log-Weg innerhalb des bestehenden Eintrags-Sheets.
Namen gespeicherter Mahlzeiten sind **nicht eindeutig** (keine
Uniqueness-Prüfung) — die Zeilendarstellung unten ist bewusst so gewählt,
dass Duplikate trotzdem unterscheidbar bleiben, ohne dass die UI Duplikate
erkennen oder besonders behandeln muss.

### Zeilendarstellung (gemeinsames Pattern für Verwaltungsliste und Log-Tab)

- Erste Zeile: Name links, kcal-Gesamtsumme rechts, `.tnum`.
- Zweite Zeile darunter, `--color-text-muted`/`--font-size-xs`: Anzahl
  Positionen + bis zu zwei Food-Namen als Vorschau, z. B.
  „3 Positionen: Haferflocken, Banane…" (Kurztext, kein vollständiger
  Aufzählungsanspruch). **Immer sichtbar**, nicht nur bei erkannten
  Namensduplikaten — erspart der UI jede Duplikat-Erkennung und macht jede
  Zeile unabhängig vom Namen sofort eindeutig identifizierbar.
- Sortierung beider Listen **identisch**: alphabetisch nach Namen,
  case-insensitive, deutsche Sortierreihenfolge (`Intl.Collator('de')`
  bzw. äquivalent). Kein Sekundärkriterium nach Erstellungs- oder
  Nutzungszeitpunkt — dafür existiert kein Schema-Feld.
- Trefferfläche der ganzen Zeile ≥48px hoch (Tap-Ziel wie andere Listen).

### Verwaltungsansicht

- Eigene Ansicht „Gespeicherte Mahlzeiten", Einstieg über ein Icon im
  Tagesansicht-Header neben dem Ziele-Zahnrad (48×48 Trefferfläche,
  `aria-label="Gespeicherte Mahlzeiten"`, Outline-Icon aus dem bestehenden
  Set, 24px Basis).
  Liste im Karten/Listen-Stil (`--space-3`-Trennung statt Linie), Zeile
  wie oben beschrieben, Tap öffnet die Mahlzeit im Mahlzeit-Sheet zum
  Bearbeiten. „+"-Button oben öffnet das Sheet leer (neutral, kein Akzent,
  analog Sektions-Buttons).

### Mahlzeit-Sheet (Anlegen & Bearbeiten, eigenes Sheet, getrennt vom Eintrags-Sheet)

- **Step M1 „Mahlzeit"**: Namensfeld oben (Label oberhalb, Standard-
  Formularvalidierung on-blur). Darunter Liste bereits hinzugefügter
  Positionen (Food-Name links, Menge + kcal rechts `.tnum`, kleiner
  `x`-Icon-Button `--color-text-muted` zum Entfernen, 48px Zeilenhöhe) —
  **markierungsfrei**, siehe „Plausibilitäts-/Vollständigkeits-Marker".
  Darunter Button „Food hinzufügen" (neutral, volle Breite). Unten fixiert
  „Speichern" (`--color-accent`, einziger Primärbutton dieses Steps,
  deaktiviert wenn Name leer oder keine Positionen vorhanden — deckt
  „Mahlzeit ohne Positionen nicht loggbar" bereits auf Anlage-Ebene ab).
- **Positionszeile in M1 hat zwei getrennte Tap-Ziele** (Nutzerentscheidung
  2026-09-21): Tap auf den `x`-Icon-Button (eigenes 48×48-Trefferfeld,
  rechtsbündig, `stopPropagation`/äquivalente Event-Trennung, damit er die
  Zeilen-Tap-Aktion nicht mitauslöst) entfernt die Position wie bisher. Tap
  auf den **restlichen Zeilenbereich** (Food-Name/Menge/kcal, 48px
  Zeilenhöhe) öffnet Step **M3** (Menge) im **Ändern-Modus**, vorbelegt mit
  der hinterlegten Menge dieser Position — Step **M2** (Food-Suche) wird
  dabei übersprungen, da das Food einer bestehenden Position nicht
  wechselbar ist, nur die Menge. Affordance: kleines
  Chevron-rechts-Icon (`--color-text-muted`, 16px) links neben dem
  `x`-Button, damit die zwei unterschiedlich großen Tap-Ziele in derselben
  Zeile für Nutzer unterscheidbar bleiben (Zeile selbst trägt sonst keinen
  optischen Hinweis auf Interaktivität, siehe Zeilendarstellung oben).
- **„Food hinzufügen"** öffnet Step **M2** (Food-Suche) und **M3** (Menge)
  — gleiche Darstellung wie Step A/Step B des Eintrags-Sheets, inklusive
  Marker-Slot (siehe „Plausibilitäts-/Vollständigkeits-Marker"), aber ohne
  Mahlzeit-Sektions-Chip im Header (hier nicht relevant) und mit
  CTA-Beschriftung „Hinzufügen" statt „Speichern" — die Position wird nur
  dem Entwurf im Sheet hinzugefügt, nicht sofort persistiert.
  Slide-Transition zurück zu M1 wie beim bestehenden Step-Wechsel
  (`--duration-slow`/`--ease-out`).
- **M3 im Ändern-Modus** (Tap auf eine bestehende Positionszeile, siehe
  oben) zeigt dieselbe Darstellung wie M3 im Hinzufügen-Pfad, aber mit
  CTA-Beschriftung **„Übernehmen"** statt „Hinzufügen" — konsistent zum
  bestehenden „Übernehmen"-Pattern (siehe Gewichtslog/Kalorienziel-
  Vorschlag: „Übernehmen" schreibt einen Wert in einen noch nicht final
  gespeicherten Zustand, ohne selbst zu persistieren). Übernehmen
  aktualisiert nur die Menge dieser Position im Entwurf; wie beim
  Hinzufügen-Pfad persistiert erst „Speichern" in M1. Slide-Transition
  zurück zu M1 wie beim bestehenden Step-Wechsel.
- Entfernen oder Ändern einer Position in M1 ist reine Entwurfs-Bearbeitung,
  **kein** bestätigungspflichtiges Löschen/Ändern — erst „Speichern"
  persistiert. Schließen des Sheets ohne „Speichern" verwirft alle
  Änderungen (Entwurf inkl. entfernter/hinzugefügter/geänderter
  Positionen), analog „Abgrenzung: ungespeicherte Sheet-Eingabe bleibt ohne
  Bestätigung".
- **Bearbeiten** einer bestehenden Mahlzeit: gleiches Sheet, M1 mit Name +
  Positionen vorbelegt. Zusätzlich „Mahlzeit löschen" als
  `--color-danger`-Textbutton. Löst den projektweiten Bestätigungsdialog
  aus: Titel „Gespeicherte Mahlzeit löschen?", Beschreibungstext „Bereits
  geloggte Einträge bleiben erhalten." (Konsequenz geht über das
  Offensichtliche hinaus, daher zulässig laut Konvention).
- **Mahlzeit ohne Positionen** (sollte durch die Speichern-Sperre in M1
  nicht vorkommen, defensiv trotzdem behandelt): Zeile in Verwaltungsliste
  und Log-Tab wird nicht-interaktiv dargestellt (`--color-text-disabled`,
  kein Tap-Ziel), zweite Info-Zeile durch „Keine Positionen" ersetzt statt
  Positionsvorschau, kcal-Summe entfällt. Keine Fehlermeldung, da kein
  Nutzerfehler im Moment des Tappens.

### Segment-Tabs im Eintrags-Sheet (Loggen einer gespeicherten Mahlzeit)

- Kein zusätzlicher Einstiegspunkt neben FAB/Sektions-Buttons. Stattdessen
  zwei Segment-Tabs „Suchen" / „Gespeicherte Mahlzeiten" (Pill-Form,
  `--radius-full`) oben in Step A des bestehenden Eintrags-Sheets,
  oberhalb des Suchfelds. Aktiver Tab `--color-accent`-Fläche (kein
  Konflikt mit „eine Akzentfarbe pro Ansicht": Farbsystem weist „aktiver
  Tab" explizit dem Akzent zu).
- Tab „Gespeicherte Mahlzeiten": Liste wie oben beschrieben
  (Zeilendarstellung, Sortierung), **markierungsfrei**. Tap auf eine Zeile
  loggt sofort alle Positionen mit hinterlegter Menge in die im
  Sheet-Header gewählte Sektion/den gewählten Tag — kein Step B, da Mengen
  bereits feststehen.
- **Leerer Zustand** (noch keine gespeicherten Mahlzeiten): Text „Noch
  keine gespeicherten Mahlzeiten" + Link „Verwalten" zur
  Verwaltungsansicht, kein Anlegen-Flow direkt im Log-Sheet — Anlegen
  bleibt bewusst ein separater, ruhigerer Flow ohne Zeitdruck.
- **Nach dem Loggen**: Erfolgsrückmeldung mit primärer + sekundärer
  Folgeaktion (bestehendes Pattern). Primär „Weitere Mahlzeit loggen"
  (zurück zum Tab „Gespeicherte Mahlzeiten", Sektionswahl bleibt über den
  persistenten Header-Chip erhalten), sekundär „Fertig" (schließt Sheet).
- Geloggte Positionen entstehen als normale `entries`-Zeilen (kein
  Sondertyp) und bleiben danach einzeln änderbar/löschbar wie jeder andere
  Eintrag — keine Rückverknüpfung zur Mahlzeit in der UI nötig.

## Gewichtslog & Kalorienziel-Vorschlag (Paket 015)

> **Seit ADR-0019** lebt dieser Abschnitt unverändert im eigenen Tab
> **Gewicht** (`/gewicht`) statt in der Ziele-Ansicht; die Aussagen unten zu
> „Ziele-Ansicht"/„kein eigener Tab" sind insoweit überholt. Zusätzlich gibt
> es die **Gewichtskarte im Tagebuch** (siehe unten).

Ursprünglich: in der **Ziele-Ansicht** als eigener Abschnitt unterhalb der
bestehenden Kalorien-/Makro-Feldblöcke (siehe „Feldblock mit unabhängigem
Speichern").

### Zielgewicht-Feldblock (ergänzt in Runde der Design-Nachpflege 2026-09-22)

- Eigener Feldblock nach dem bestehenden Muster „Feldblock mit unabhängigem
  Speichern" (siehe dort): Label oberhalb, `inputmode="decimal"`,
  rechtsbündig, `.tnum`, eigener „Speichern"-Button, eigene
  „Gespeichert"-Rückmeldung, Validierung on-blur. Wertebereich 20,0–400,0 kg,
  eine Nachkommastelle.
- **Optional, kein Pflichtfeld**: ein leeres Feld ist gültig, keine
  Fehlermarkierung. War zuvor ein Wert gesetzt, ist das Leeren des Feldes
  eine gültige Änderung (aktiviert „Speichern" wie jede andere Änderung) und
  entfernt den gespeicherten Zielwert — sonst gilt das Basis-Pattern
  unverändert (Button deaktiviert, solange der Wert ungültig oder
  unverändert zum zuletzt gespeicherten Stand ist).
- **Platzierung**: **nicht** bei den kcal-/Makro-Feldblöcken oben in der
  Ansicht — andere fachliche Domäne (Gewicht statt Energie/Makros).
  Stattdessen als **erstes Element** dieses Gewichtslog-Abschnitts,
  oberhalb des „+"-Erfassen-Einstiegs und des Liniendiagramms: der
  Zielwert ist die Voraussetzung für die Vorschlagsberechnung weiter unten
  im selben Abschnitt, daher steht er dort, wo er zuerst gebraucht wird.
  Abstand `--space-6` zum darunterliegenden Diagramm, identisch zum
  Abstand zwischen Feldblöcken im Basis-Pattern.

### Erfassen-Sheet

- Eigenes kleines Eingabe-Sheet nach der Standard-Sheet-Mechanik (öffnen von
  unten, `--duration-slow`/`--ease-out`, `--radius-lg` nur oben, Drag-Handle
  + expliziter Schließen-Button). Ein Feld: Gewicht in kg, Label oberhalb,
  `inputmode="decimal"`, rechtsbündig, `.tnum`, Standard-Formularvalidierung
  (on-blur, danach live). Datum ist immer der aktuelle Tag, kein
  Datumsfeld — das Sheet dient ausschließlich der Erfassung für heute.
- Einstieg über einen eigenen, neutralen „+"-Button (kein Akzent, analog
  Sektions-Buttons im Tagebuch) direkt im neuen Abschnitt der Ziele-Ansicht.
  Kein FAB-Bezug, da die Ziele-Ansicht kein Tagebuch-Eingabekontext ist.

### Ein Gewichtswert pro Kalendertag (Festlegung)

- Unique Constraint `(user_id, date)` auf Datenebene. Erfasst der Nutzer am
  selben Tag ein zweites Gewicht, wird der bestehende Wert **ersetzt**, aber
  nicht stillschweigend: es öffnet der projektweite Bestätigungsdialog
  (siehe „Bestätigungsdialog für destruktive Aktionen" — Ersetzen eines
  bereits gespeicherten Werts zählt als überschreibende, damit destruktive
  Aktion). Titel „Gewicht für heute ersetzen?", Beschreibungstext nennt
  alten und neuen Wert (z. B. „72,4 kg wird durch 72,1 kg ersetzt."). Bei
  Bestätigung schließt das Sheet und der neue Wert erscheint sofort im
  Diagramm; bei Abbrechen bleibt das Sheet mit der Eingabe offen.
- Keine nachträgliche Datums-Erfassung in diesem Paket (kein Datumsfeld im
  Sheet) — nur der aktuelle Tag ist erfassbar.

### Liniendiagramm (bewusste Abweichung vom Balken-Pattern des Verlaufs)

- Gewicht ist ein kontinuierlicher Trend über Messpunkte, kein
  Tages-Diskretwert wie kcal — deshalb **Linie statt Balken**, bewusste
  Abweichung vom „Balken-Chart"-Pattern des Verlaufs (siehe dort). Punkte je
  Messtag als kleine gefüllte Kreise (`--color-accent`), verbunden durch eine
  `--color-accent`-Linie (2px), keine Fläche unter der Linie (keine
  zusätzliche Bedeutungsebene, reine Trendlinie). Lücken (Tage ohne Eintrag)
  werden **nicht interpoliert** — die Linie überspringt sie sichtbar
  (gestrichelt zwischen den beiden umgebenden Punkten, `--color-border-strong`,
  1px dashed), damit kein erfundener Zwischenwert suggeriert wird.
- Y-Achse ohne feste Skala/Gitter (kein Bedarf, wenige Punkte), X-Achse mit
  Datumslabels analog „Datumsnavigation"-Formatierung. Gleiche
  Tap-Interaktion wie beim Verlauf-Balken-Chart: Tap auf einen Punkt öffnet
  ein Tooltip (gleiche Optik/Timing wie „Detail-Tooltip" im Verlauf: Karte
  `--color-surface`, `--radius-sm`, Elevation `--elevation-high`, nur ein Tooltip
  gleichzeitig, Tap außerhalb schließt) mit Datum + Gewicht (`.tnum`).
  Screenreader: `aria-label` je Punkt nimmt den Tooltip-Inhalt vorweg,
  zusätzlich eine `sr-only` Tabellen-/Listenalternative mit allen
  Messwerten (gleicher Grundsatz wie beim Verlauf-Chart).
- Zeitfenster: letzte 90 Tage, kein Zeitraum-Umschalter in diesem Paket (kein
  Woche/Monat-Pattern übernommen — Gewichtstrend ist bewusst auf ein festes,
  längeres Fenster ausgelegt statt auf wechselnde kurze Perioden).

### Vorschlagskarte (neutrales-Angebot-Pattern)

- Eigenständige Karte unterhalb des Diagramms (`--color-surface`,
  `--radius-md`, Elevation `--elevation-flat` wie andere Karten, Innenabstand
  `--space-4`) — **kein** Modal, kein Sheet, da es sich um ein optionales
  Angebot handelt, keine notwendige oder blockierende Aktion.
- **Neutral, nicht auffordernd**: die Karte selbst trägt keine Akzentfläche
  und keine Warnfarbe — sie präsentiert eine Beobachtung, bewertet nicht
  („Basierend auf deinem Gewichtsverlauf: {X} kcal" statt „Du solltest dein
  Ziel anpassen"). Passt zur Tonalität aus dem Konzept („zeigt an, bewertet
  nicht").
- **Zwei Aktionen nebeneinander**, gleich breit, `--space-3` Abstand:
  **„Übernehmen"** als Primäraktion der Karte (`--color-accent`-Fläche,
  `--radius-sm`, einziger Akzent-Button in diesem Kartenscope — kein
  Konflikt mit den Feldblock-Speichern-Buttons darüber, da eigener,
  klar abgegrenzter Kartenkontext), **„Verwerfen"** als neutraler
  Textbutton (`--color-text-muted`, kein Rahmen) daneben. Beide ≥48px
  Trefferfläche.
- **„Übernehmen" schreibt nur den bestehenden Kalorienziel-Wert** im
  Kalorien-Feldblock (siehe „Feldblock mit unabhängigem Speichern") —
  gleicher Speichervorgang, gleiche Erfolgsrückmeldung („Gespeichert" im
  Feldblock) wie eine manuelle Eingabe dort. Das Kalorienfeld übernimmt den
  Wert sichtbar (kein stiller Hintergrund-Save), der Nutzer sieht den neuen
  Wert im Feld stehen, bevor die „Gespeichert"-Rückmeldung erscheint.
- **Kein Übernahme-Verlauf, keine Schema-Erweiterung an `goals`**
  (Festlegung): weder „Übernehmen" noch „Verwerfen" erzeugen einen
  Log-/Historien-Eintrag. Beide sind reiner Client-State für die aktuelle
  Kartenanzeige. „Verwerfen" blendet die Karte für die laufende Sitzung aus
  (`--duration-base`/`--ease-out` Fade); ein neuer Vorschlag kann bei der
  nächsten Neuberechnung (z. B. neuer Gewichtseintrag) wieder erscheinen —
  ohne dass irgendwo gespeichert wird, dass zuvor schon einmal verworfen
  wurde.

### Zustands-Priorität der Vorschlagskarte (ergänzt 2026-09-22)

Drei Bedingungen können unabhängig voneinander fehlen (kein Zielgewicht,
zu wenig Messpunkte, keine Einträge). Prüfreihenfolge, **erste
zutreffende Bedingung gewinnt**:

1. **Keine Gewichtseinträge vorhanden** → Leerzustand (siehe unten),
   ersetzt Diagramm **und** Vorschlagskarte.
2. **Kein Zielgewicht gesetzt** (Zielgewicht-Feldblock leer) → „Kein
   Zielgewicht gesetzt"-Zustand (siehe unten), unabhängig von der Anzahl
   vorhandener Messpunkte — ohne Zielwert lässt sich ohnehin keine
   Vorschlagsrichtung berechnen, eine separate Meldung zur
   Messpunktanzahl wäre hier irreführend.
3. **Zu wenig Messpunkte** (Zielgewicht ist gesetzt, aber der Trend im
   Beobachtungsfenster reicht nicht) → „Zu wenig Messpunkte"-Zustand
   (siehe unten).
4. **Beides ausreichend** → normale Vorschlagskarte: Zu-/Abnahme-Vorschlag
   oder „Halten"-Zustand (siehe unten), je nach Abstand des aktuellen
   Gewichts zum Zielgewicht.

### „Kein Zielgewicht gesetzt"-Zustand

- Gleiche Optik wie „Zu wenig Messpunkte" (siehe unten): neutraler
  Hinweistext ersetzt die Vorschlagskarte, `--color-text-muted`/
  `--font-size-sm`, keine Akzent-/Warnfarbe, kein Fehlerzustand. Kein
  „Übernehmen"/„Verwerfen" in diesem Zustand.
- Wortlaut: „Setze ein Zielgewicht, um einen Vorschlag zu erhalten."
- Das Liniendiagramm bleibt unverändert sichtbar und zeigt die vorhandenen
  Punkte — nur die Vorschlagskarte wird ersetzt, nicht das Diagramm. Der
  Zielgewicht-Feldblock selbst bleibt oberhalb wie gehabt bedienbar; dieser
  Zustand verlinkt/scrollt nicht dorthin (Feld ist bereits sichtbar im
  selben Abschnitt, kein zusätzlicher Sprung nötig).

### „Zu wenig Messpunkte"-Zustand

- Reicht die Anzahl vorhandener Gewichtseinträge im Beobachtungsfenster
  nicht für einen belastbaren Trend, ersetzt ein neutraler Hinweistext die
  Vorschlagskarte: „Noch zu wenig Gewichtseinträge für einen Vorschlag."
  (`--color-text-muted`/`--font-size-sm`) — keine Akzent-/Warnfarbe, kein
  Fehlerzustand, reine Information. Kein „Übernehmen"/„Verwerfen" in diesem
  Zustand.
- Das Liniendiagramm bleibt in diesem Zustand unverändert sichtbar und zeigt
  die vorhandenen Punkte (auch ein einzelner Punkt ohne Linie ist gültig) —
  nur die Vorschlagskarte wird ersetzt, nicht das Diagramm.

### „Halten"-Zustand (Zielgewicht erreicht, Toleranz ±0,5 kg)

- Liegt das aktuelle (letzte gemessene) Gewicht innerhalb ±0,5 kg des
  gesetzten Zielgewichts, erscheint **dieselbe neutrale Kartenoptik** wie
  beim normalen Zu-/Abnahme-Vorschlag (`--color-surface`, `--radius-md`,
  Elevation `--elevation-flat`, `--space-4` Innenabstand, keine
  Akzent-/Erfolgsfarbe auf der Fläche) — kein Sonder-Look, nur anderer
  Text: „Dein Gewicht ist stabil. So bleibt es: {X} kcal."
- **„Übernehmen"/„Verwerfen" bleiben unverändert vorhanden** (gleiche
  Anordnung, gleiche Buttons wie beim normalen Vorschlag) — die Karte
  bietet weiterhin einen konkreten kcal-Wert (Erhaltungskalorien) zum
  Übernehmen an, das Verhalten von „Übernehmen" ist identisch (schreibt in
  den Kalorien-Feldblock, siehe oben).
- Kein `--color-success`, obwohl „Ziel erreicht" naheliegen würde: die
  Karte bewertet weiterhin nicht (siehe „Neutral, nicht auffordernd"
  oben) — „stabil" ist eine Beobachtung, kein Erfolgsmoment mit eigener
  Farbsprache. Konsistent mit der Tonalität aus dem Konzept.

### Leerzustand (keine Gewichtseinträge)

- Sind **gar keine** Gewichtseinträge vorhanden, ersetzt ein Leerzustand
  sowohl Diagrammbereich als auch Vorschlagskarte: Text „Noch keine
  Gewichtseinträge" + der „+"-Button aus dem Erfassen-Einstieg bleibt
  sichtbar/bedienbar als einziger Call-to-Action (gleiches Wortmuster wie
  andere Leerzustände, z. B. „Gespeicherte Mahlzeiten"/Verlauf).

## Gewichtskarte im Tagebuch (ADR-0019)

- Karte nach dem Muster „Karten/Listen" (`--color-surface`, `--radius-md`,
  `--elevation-flat`, Innenabstand `--space-4`), direkt unter Kalorienring
  und Makro-Balken, vor den Mahlzeiten-Sektionen.
- **Kopfzeile**: Titel „Gewicht" (`--font-size-md`, semibold), rechts
  Textlink „Verlauf ›" (`--color-accent`) auf `/gewicht`.
- **Trendzeile**: jüngster Wert der letzten 30 Tage groß
  (`--font-size-xl`, `.tnum`), darunter die Veränderung ältester → jüngster
  Wert als Text („−0,8 kg in 14 Tagen", `--font-size-xs`,
  `--color-text-muted`, neutral — keine Wertung per Farbe, weil Zu- und
  Abnahme je nach Ziel gut oder schlecht sind). Rechts eine Sparkline
  96×32px, `--color-accent`-Linie 2px, gefüllter Endpunkt, keine Achsen.
  Bei einer einzigen Messung: „Erster Eintrag der letzten 30 Tage", keine
  Sparkline. Ohne Messung: „Noch keine Gewichtseinträge in den letzten 30
  Tagen."
- **Schnelleingabe** für den angezeigten Tag: Feldblock-Muster (Label
  oberhalb „Gewicht heute (kg)" / „gestern" / Wochentag + Datum, Input +
  „Speichern" in einer Zeile, Validierung on-blur, danach live). Ist schon
  ein Wert erfasst: Zeile „Gewicht heute: 72,4 kg" + neutraler Button
  „Ändern", der das vorbelegte Feld plus „Abbrechen" zeigt — ersetzt den
  Bestätigungsdialog. Für zukünftige Tage keine Eingabe.
- Ladefehler der Messungen: Hinweistext + „Erneut versuchen" in der Karte,
  Eingabe ausgeblendet; der Tagesinhalt bleibt unberührt.
