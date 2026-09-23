# Design-Konzept

**Single-Writer: Nur der `design-concept`-Agent schreibt hierhin.** Der
`ux-ui-designer` liest die Datei und setzt darauf auf.

- **Herkunft**: `neu entworfen (bestätigt am 2026-09-20)`
- **Zuletzt überarbeitet**: 2026-09-20
- **Quellen**: keine — Greenfield, keine bestehende Codebasis auswertbar.
  Vorgaben stammen aus dem Feature-Request (Yazio-Orientierung, Mobile-first,
  Token-Pflicht aus Paket 013) sowie der Nutzer-Bestätigung vom 2026-09-20.

## Marke & Tonalität

- **Charakter**: ruhig, luftig, weich, schnell. Die App ist ein
  Alltagswerkzeug für zwei Personen, kein Coach — sie bewertet nicht,
  sie zeigt an.
- **Corporate Design**: **es gibt keines** — vom Nutzer am 2026-09-20
  bestätigt: kein Logo, keine Hausfarben, keine Wortmarke, keine externen
  Vorgaben. Nicht erneut danach suchen; die Gestaltung ist frei.
- **Sprache im UI**: Deutsch, Du-Form, aktiv, knapp. Zahlen ohne
  Dekoration, keine Ausrufezeichen, keine Motivationssprache
  („Geschafft!", „Weiter so"). Einheiten immer ausgeschrieben bzw. als
  `g`/`kcal` direkt am Wert.

## Farbsystem

Tokens sind die einzige Quelle; hier steht nur das System. Werte gehören in
die zentrale Token-Datei (Paket 013), nicht hierher.

| Rolle        | Token                        | Verwendung                                         |
|--------------|------------------------------|----------------------------------------------------|
| Akzent       | `--color-accent`             | genau **eine** Primäraktion je Ansicht (FAB, Submit), aktiver Tab, Kalorienring-Füllung |
| Akzent-Weich | `--color-accent-subtle`      | Flächen hinter Akzent-Inhalt, ausgewählte Chips    |
| Erfolg       | `--color-success`            | Ziel erreicht, gespeichert — nie flächig           |
| Warnung      | `--color-warning`            | Ziel deutlich überschritten                        |
| Fehler       | `--color-danger`             | Validierung, Löschen                               |
| Neutral      | `--color-neutral-0…900`      | Flächen, Text, Rahmen — trägt den Großteil des UI  |

- **Akzentfarbe (bestätigt)**: ein gedecktes Grün-Teal. Gesundheitsnah ohne
  Ampel-Assoziation und ohne Kollision mit Erfolg/Warnung/Fehler. Yazio-Orange wird bewusst **nicht** übernommen —
  es ist die auffälligste Abweichung vom Vorbild und gewollt.
- **Makro-Farben sind kein Akzent.** Kohlenhydrate/Protein/Fett bekommen
  eine eigene, dreiteilige Datenvisualisierungs-Palette
  (`--color-macro-carbs|protein|fat`) in gedeckter Sättigung. Sie ist von
  der UI-Akzentfarbe getrennt, damit „eine Akzentfarbe pro Ansicht" trotz
  dreifarbiger Makro-Balken gilt.
- **Kontrast-Ziel**: WCAG 2.2 AA — 4.5:1 Text, 3:1 UI-Elemente und
  Diagrammflächen gegen ihren Hintergrund.
- **Regel**: Farbe nie alleiniger Bedeutungsträger. Makro-Balken tragen
  immer Label und Wert, nicht nur Farbe.

## Theming

- **Modus**: **nur Light.** Dark Mode ist am 2026-09-20 ausdrücklich
  abgewählt — keine Umschalt-Mechanik, keine Theme-Einstellung im UI, kein
  `@media (prefers-color-scheme)`, kein zweiter Token-Satz. `theme-color`
  der PWA und der Splash-Hintergrund sind fest hell.
- **Mechanik**: alle Farben als CSS Custom Properties auf `:root` in **einer**
  Token-Datei. Komponenten referenzieren ausschließlich **Rollen-Tokens**
  (`--color-surface`, `--color-text`, `--color-border` …), nie die
  Skalenwerte (`--color-neutral-700`) und nie Literal-Farben.
- **Nachrüstbarkeit**: Durch diese Trennung Skala ↔ Rolle genügt für einen
  späteren Dark Mode ein zweiter Rollen-Block; die Komponenten bleiben
  unangetastet. Mehr ist jetzt nicht zu tun — kein Dark-Theme auf Vorrat.

## Typografie

- **Familien**: System-Stack (`-apple-system`/`Segoe UI`/`Roboto`/
  sans-serif). Keine Webfont — Ladezeit ist bei einer PWA mit
  Sekunden-Eingaben teurer als Markeneigenheit.
- **Skala**: 12/14/16/20/24/32/48, keine Zwischenwerte. 48 ist für die
  große Kalorienzahl im Tagesring reserviert.
- **Gewichte**: 400 und 600. Zahlen in Tabellenziffern
  (`font-variant-numeric: tabular-nums`), damit Werte nicht springen.
- **Zeilenhöhe**: 1.5 Fließtext, 1.2 Überschriften und Zahlwerte.

## Spacing & Layout

- **Basiseinheit**: 4px — **Skala**: 4/8/12/16/24/32/48/64. Großzügig
  wählen: Weißraum ist hier Gestaltungsmittel, nicht Rest.
- **Breakpoints**: sm 640 / md 768 / lg 1024. Mobile-first, alles darunter
  ist der Normalfall.
- **Container**: einspaltig, max. 640px, zentriert, 16px Außenabstand.
- **Einhandbedienung**: Primäraktionen und Navigation im unteren
  Bildschirmdrittel. Oben nur Anzeige und Sekundäres. Eingabe-Sheets
  öffnen von unten.
- **Touch-Ziele**: mindestens 48×48px, mindestens 8px Abstand zueinander.
- **Trennung bevorzugt über Abstand statt Linie**; Mahlzeiten-Sektionen
  sind durch Weißraum und Überschrift getrennt, nicht durch Rahmen.

## Form & Tiefe

- **Radien**: 8px klein (Chips, Inputs), 16px Karten und Sektionen,
  24px Bottom-Sheets (nur oben), 999px Pills und FAB.
- **Elevation**: drei Stufen — Karten flach (keine oder minimale),
  FAB mittel, Sheets/Dialoge hoch. Tiefe zeigt Interaktionsebene, nicht
  Wichtigkeit.
- **Rahmen**: 1px neutral, nur wo Abstand nicht reicht (Eingabefelder).

## Ikonografie

- **Set**: ein Outline-Set, einheitlich (Lucide als Vorschlag), 24px Basis.
- **Regel**: kein Icon ohne Label bei Primäraktionen; Ausnahme ist der FAB
  (Plus), der über `aria-label` benannt wird.

## Motion

- **Grundprinzip**: Bewegung erklärt Herkunft und Ziel, dekoriert nicht.
  Eingaben dürfen nie auf eine Animation warten.
- **Dauern**: 120ms Zustandswechsel, 180ms Ein-/Ausblenden, 240ms Sheets
  und Layout. Der Kalorienring animiert beim Wertwechsel max. 400ms.
- **Easing**: ease-out beim Erscheinen, ease-in beim Verschwinden.
- **Reduced Motion**: `prefers-reduced-motion` respektieren — Bewegung
  durch Ein-/Ausblenden ersetzen, nicht ersatzlos streichen.

## Barrierefreiheit

- **Zielniveau**: WCAG 2.2 AA.
- **Nicht verhandelbar**: sichtbarer Fokus, jedes
  Eingabefeld mit Label, Zahlenfelder mit passendem `inputmode`,
  Statusmeldungen für Screenreader angekündigt, Zoom bis 200% ohne
  Layoutbruch.

## Geklärte Markenfragen (2026-09-20)

Keine offenen Fragen mehr. Dokumentiert, damit niemand erneut sucht:

- **Bestehendes Corporate Design?** — Nein, nachweislich keines. Frei
  gestaltbar.
- **Akzentfarbe?** — Gedecktes Grün-Teal, bestätigt.
- **Dark Mode?** — Nein, aktuell nicht gewünscht. Light-Mode-only; die
  Token-Struktur bleibt aber nachrüstbar (siehe „Theming").

## Bewusst nicht festgelegt

- Illustrations- und Empty-State-Stil — wird entschieden, wenn der erste
  leere Zustand gebraucht wird.
- Konkrete Hex-Werte — gehören in die Token-Datei (Paket 013), nicht hier.
- Desktop-Layout über 1024px — einspaltig zentriert genügt, bis es nicht
  mehr genügt.
- Charting-Bibliothek und Diagrammstil jenseits von Ring und Balken.
