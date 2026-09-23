# ADR-0015: Update-Hinweis — `SwUpdate` gekapselt in `core/`, Banner in der Layout-Route, Sitzungs-Unterdrückung als Client-State

- **Status**: accepted
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `app-shell` (sichtbar in `diary`, `stats`, `goals`, `meals`)
- **task_id**: `PO-2026-09-20-013b`

## Kontext

ADR-0002 hat den Update-Flow entschieden (`SwUpdate.versionUpdates`,
`VERSION_READY`, nie automatisch anwenden), aber nicht verdrahtet: In `src/`
kommt `SwUpdate` bis heute an keiner Stelle vor, registriert ist allein
`provideServiceWorker(...)` in `app.config.ts`. Paket 013b löst das ein. Drei
Fragen sind dabei nicht aus ADR-0002 ableitbar: **wo** der Zugriff auf den
Worker liegt, **wo** das Banner im Komponentenbaum hängt (es steht laut
`design-conventions.md` über FAB **und** Bottom-Navigation, die in
verschiedenen Contexts liegen), und wie „Später unterdrückt nur die laufende
Sitzung" mit dem geforderten Wiedererscheinen bei `visibilitychange`
zusammengeht — wörtlich gelesen widersprechen sich beide Vorgaben.

## Entscheidung

1. **Genau eine Zugriffsstelle**: `src/app/core/app-update.service.ts` ist die
   einzige Datei des Projekts, die aus `@angular/service-worker` importiert
   (neben der Registrierung in `app.config.ts`). Sie exponiert lesbaren
   Zustand als Signal (`updateAvailable`) und die beiden Aktionen
   (`applyUpdate()`, `dismissForSession()`). Keine Komponente injiziert
   `SwUpdate`, kein Feature-Store kennt den Worker.
2. **Banner in der Layout-Route, nicht in der Root-Shell**: Die Komponente
   liegt in `src/app/shell/components/update-banner/` und wird von
   `MainLayoutComponent` gerendert — damit erscheint sie auf allen vier
   Ansichten hinter dem Login, bewusst **nicht** auf `/login`. Begründung:
   Die in `design-conventions.md` festgelegte Stapelung (Banner → FAB →
   Bottom-Navigation) ist nur dort definiert; vor dem Login gibt es weder
   Navigation noch laufende Eingabe, die ein Reload gefährden könnte.
   Die beiden `sheet`-Auxiliary-Routen liegen weiterhin darüber (ADR-0014
   Punkt 2) — das Banner ist nicht modal und darf vom Sheet verdeckt werden.
3. **Konstanter Bodenabstand aus Tokens, keine Laufzeit-Koordination**: Das
   Banner berechnet sein `bottom` aus Bottom-Navigationshöhe, FAB-Höhe,
   `env(safe-area-inset-bottom)` und Abständen. Dafür kommen zwei
   Layout-Tokens nach `src/styles/tokens.css`
   (`--size-bottom-nav-height`, `--size-fab`), die die bisher an drei
   Stellen wiederholte Literal-`56px` ablösen. Das Banner fragt **nicht** ab,
   ob gerade ein FAB sichtbar ist; auf FAB-losen Ansichten (Verlauf, Ziele,
   Mahlzeiten) bleibt eine FAB-hohe Lücke stehen. Das ist der bewusste Preis
   dafür, dass `app-shell` nichts über den FAB von `diary` wissen muss.
4. **Sitzungs-Unterdrückung ist reiner Client-State, Vordergrund definiert
   die Sitzung**: „Später" setzt ein Flag im `core/`-Dienst — nicht
   `localStorage`, nicht `sessionStorage`, nicht die Datenbank (gleiche Linie
   wie der Undo-State in ADR-0013). Das Flag wird zurückgesetzt, sobald das
   Dokument über `visibilitychange` wieder sichtbar wird; ein Kaltstart
   beginnt ohnehin ohne Flag. Damit ist „Sitzung" die **Vordergrundphase**,
   und beide Akzeptanzkriterien sind gleichzeitig erfüllbar.
5. **`ngsw-config.json` bleibt unverändert.** Der Update-Hinweis braucht
   keine Cache-Änderung; `dataGroups` bleiben ausgeschlossen (ADR-0002) und
   wären weiterhin ein eigenes ADR.
6. **Abgeschaltet ist ein gültiger Zustand**: Bei `swUpdate.isEnabled ===
   false` (Dev-Server, Unit-Tests) bleibt der Dienst stumm und
   `updateAvailable` dauerhaft `false`. Komponenten prüfen das nicht selbst.
   `unrecoverable` löst wie in ADR-0002 entschieden einen Reload aus,
   `VERSION_INSTALLATION_FAILED` blendet das Banner aus.

## Konsequenzen

- Positiv: Die Update-Mechanik ist an einer Stelle testbar (reiner Dienst,
  ohne `TestBed`-Komponentenbaum), und die Ansichten bleiben frei von
  PWA-Wissen. Die `56px`-Literale verschwinden aus `main-layout` und
  `diary-shell`; eine Höhenänderung der Navigation ist eine Token-Änderung.
- Negativ/Trade-off: Auf `/login` gibt es keinen Update-Hinweis — ein Nutzer,
  der die App tagelang auf dem Login-Screen offen lässt, erfährt erst nach
  dem Anmelden von der neuen Version. Die feste Bodenlücke auf FAB-losen
  Ansichten ist sichtbar suboptimal; die Alternative wäre eine
  Feature-übergreifende Sichtbarkeitsmeldung und damit genau die Kopplung,
  die `code-conventions.md` ausschließt.
- Betrifft künftig: Jede weitere fest am unteren Rand positionierte
  Komponente referenziert `--size-bottom-nav-height`/`--size-fab` statt
  eigener Literale und ordnet sich in die Stapelung Banner → FAB →
  Navigation ein. Wer den Service Worker künftig anders nutzen will
  (Push, Offline-Puffer, `dataGroups`), erweitert `core/app-update.service.ts`
  bzw. schreibt ein eigenes ADR — er registriert keinen zweiten Zugang.

## Alternativen (kurz)

- **Banner in `app.html` neben den beiden Outlets** — verworfen: Es müsste
  dann auch auf `/login` korrekt sitzen, wo Navigation und FAB fehlen, und
  bräuchte dafür genau die Zustandsabfrage, die Punkt 3 vermeidet.
- **„Später" in `localStorage` persistieren** — verworfen: widerspricht
  „nicht dauerhaft unterdrücken" aus `design-conventions.md` und würde einen
  Nutzer dauerhaft auf einer alten Version festhalten.
- **Update ohne Nachfrage anwenden** — bereits in ADR-0002 verworfen
  (Datenverlust mitten in einer Eingabe); hier nur der Vollständigkeit
  halber genannt.
- **Dynamischer Bodenabstand über einen `core/`-Layout-Store, den `diary`
  beim Anzeigen des FAB setzt** — verworfen: Laufzeitkopplung zwischen
  Shell und Feature für einen rein kosmetischen Gewinn.
