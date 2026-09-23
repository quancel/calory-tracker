# ADR-0008: Food-Katalog — Eingabe-Sheet als Auxiliary-Route der App-Shell, `food-search.service.ts` als einziger Katalogzugang, Sitzungs-Cache mit In-Memory-Filter

- **Status**: superseded by ADR-0012 (betrifft Punkt 2 und den Cache-Ort aus
  Punkt 3; Punkte 1, 4, 5 und die Lade-Strategie aus Punkt 3 gelten
  unverändert fort — siehe ADR-0012, Abschnitt „Verhältnis zu ADR-0008")
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `food-catalog` (wirkt auf `app-shell`, `diary`, `meals`, `data-platform`)
- **task_id**: `PO-2026-09-20-006`

## Kontext

Paket 006 legt `food-catalog` mit Code an und stößt dabei auf vier
Festlegungen, die es bisher nicht gibt:

1. **Einstieg.** FAB und Sektions-„+"-Buttons der Tagesansicht sind seit
   Paket 004 gebaut, ihre Handler aber Stubs (`diary-shell.component.ts`).
   Sie sollen ein Bottom-Sheet öffnen, dessen Komponente in `food-search`
   liegt — `diary` darf laut `code-conventions.md` aber nichts aus einem
   anderen Feature importieren (ADR-0007 Punkt 5 löste denselben Fall für
   `goals` über eine Route, dort aber als *Seitenwechsel*, nicht als
   Overlay über der lebenden Tagesansicht).
2. **Katalogzugang.** Die Context-Map verlangt, dass jeder Katalogzugriff
   über `food-catalog` läuft; die Paket-Constraints nennen dafür ein
   „FoodRepository", das die Reihenfolge der Quellen kapselt und in Paket
   008 eine externe Quelle (Open Food Facts) aufnehmen muss. Einen
   `*.repository.ts`-Dateityp kennen die Konventionen nicht.
3. **Ladeverhalten der Suche.** Die Design-Vorgaben fordern Filterung
   „gegen die bereits geladene lokale Quelle", kein Netz-Nachladen beim
   Tippen, Skeleton nur beim ersten Sheet-Öffnen einer Sitzung. Das ist
   keine Darstellungsfrage, sondern eine Lade- und Cache-Strategie.
4. **Scope-Grenze zu Paket 007.** Dieses Paket baut Step A (Suche) und
   Step A2 (Neu anlegen), **nicht** Step B (Menge, Eintrag speichern). Der
   Tap auf einen Treffer hat noch kein Ziel.

Punkte 1–3 sind nach 007/008/010 teuer umkehrbar: Dann hängen das
Mengen-Sheet, der Open-Food-Facts-Pfad und das Mahlzeit-Sheet an denselben
Strukturen.

## Entscheidung

1. **Das Eingabe-Sheet ist eine Auxiliary-Route der App-Shell.**
   `app.routes.ts` bekommt eine lazy Top-Level-Route im **benannten Outlet
   `sheet`** (hinter `authGuard`), die auf `food-search.routes.ts` zeigt;
   `app.html` bekommt neben dem primären ein zweites
   `<router-outlet name="sheet">`. Die Tagesansicht öffnet das Sheet per
   `routerLink` auf dieses Outlet und übergibt Tag und vorgewählte
   Mahlzeit als Parameter — `diary` importiert **nichts** aus
   `food-search`, und `food-search` nichts aus `diary`. Die Topologie
   gehört der App-Shell (Context-Map), nicht einem der beiden Features.
   Gründe gegen eine gewöhnliche Top-Level-Route: Die Tagesansicht bliebe
   nicht gemountet, ihr Zustand (geladener Tag, Scrollposition) ginge
   verloren, und der geforderte Backdrop über der lebenden Ansicht wäre
   nicht darstellbar. Zusätzlich gewinnt das Sheet damit
   Zurück-Gesten/Android-Back als Schließen-Weg, ohne eigene
   History-Behandlung.
2. **`src/app/food-search/food-search.service.ts` ist das „FoodRepository"** —
   der einzige Zugang zu Foods für Suche, Anlegen und (ab 008) Lookup. Es
   bleibt beim Konventionsnamen `<feature>.service.ts`; ein eigener
   `*.repository.ts`-Typ wird **nicht** eingeführt. Nach außen ist die
   Methodenoberfläche **quellenunabhängig** (`search(query)` liefert
   Domänen-`Food`s inkl. `source`), die Supabase-spezifische Abfrage ist
   privat. Paket 008 legt die externe Quelle als **eigene Datei**
   `food-search.off.service.ts` daneben und lässt die Reihenfolge der
   Quellen in `food-search.service.ts`; Komponenten und Store sprechen
   weiterhin ausschließlich mit `food-search.service.ts`. Keine
   Quellen-Abstraktion (Interface, Strategie-Registry) auf Vorrat für die
   eine Quelle, die es heute gibt.
3. **Lokale Suche = einmal je Sitzung laden, danach rein im Speicher
   filtern.** Der `food-search.store.ts` (`providedIn: 'root'`) lädt die
   `foods` **einmal** beim ersten Sheet-Öffnen einer Sitzung und hält sie;
   jede Tastatureingabe filtert nur noch über eine reine Funktion in
   `food-search.calculations.ts` (Teilstring, case-insensitive). Kein
   `ilike` je Tastendruck, kein Debounce, kein zweiter Ladepfad. Ein neu
   angelegtes Food wird nach dem `insert` in den Cache **eingefügt**, statt
   die Liste neu zu laden. Tragfähig, weil `foods` für zwei Nutzer wächst.
   **Ablösepunkt, bewusst benannt**: Sobald `foods` durch den
   Open-Food-Facts-Cache (Paket 008) in eine Größenordnung wächst, in der
   der Erstladevorgang spürbar wird, wechselt die Suche auf serverseitiges
   `ilike` mit Debounce — das ist dann eine Änderung dieses Punktes und
   braucht ein ablösendes ADR, kein stilles Nachbessern.
4. **Scope-Grenze zu Paket 007 ist ein dokumentierter Übergabepunkt, kein
   halbes Step B.** Der Tap auf eine Trefferzeile ruft in diesem Paket
   genau eine Methode auf, die als Stub mit
   `TODO(PO-2026-09-20-007)`-Kommentar markiert ist — nach dem Muster der
   FAB-Stubs aus Paket 004. Es entsteht **kein** Zwischenzustand
   „Menge" und kein vorläufiges Speichern von `entries`. Der
   Sheet-Einstieg (FAB, Sektions-Buttons) wird dagegen in **diesem** Paket
   verdrahtet: Ein Sheet, das über kein Bedienelement erreichbar ist, wäre
   weder manuell abnehmbar noch als Übergabepunkt belegbar.
5. **`default_portion_g = null` heißt „nicht gesetzt" — auf beiden
   Ebenen.** Die Client-Validierung lehnt eine ausgefüllte Standardportion
   `<= 0` ab und speichert ein leeres Feld als `null` (nicht als `100`);
   eine additive Migration sichert dieselbe Regel als
   `check (default_portion_g is null or default_portion_g > 0)` in der
   Datenbank. Die Doppelung ist beabsichtigt (Client-Rückmeldung +
   Datenbank-Garantie) und folgt ADR-0007 Punkt 2: Ändert sich die Regel,
   sind **beide** Stellen zu ändern. Grund für die Migration gerade jetzt:
   Dieses Paket ist der erste Schreibpfad auf `foods`, danach ist die
   Tabelle gefüllt und ein nachgezogener Check braucht eine Bereinigung.

## Konsequenzen

- Positiv: `diary` und `food-catalog` bleiben importfrei voneinander,
  obwohl das Sheet über der Tagesansicht liegt und deren Zustand
  erhalten bleibt. Die Suche ist ohne Netz-Roundtrip pro Tastendruck
  flüssig und ohne Angular-Kontext testbar (reine Filterfunktion). Paket
  008 kann die externe Quelle hinzufügen, ohne eine Komponente oder den
  Store anzufassen.
- Negativ/Trade-off: Die Auxiliary-Route macht die URL-Form sperriger
  (`/tagebuch(sheet:…)`) und ist die erste Stelle im Projekt, die zwei
  Outlets koordiniert; Deep-Links auf das Sheet sind dadurch weniger
  offensichtlich. Der Sitzungs-Cache zeigt Foods, die ein **zweiter**
  Nutzer parallel anlegt, erst nach einem Neuladen der App — bei zwei
  Nutzern akzeptiert, statt dafür jede Suche über das Netz zu schicken.
  Die `foods`-Spaltenliste steht weiterhin an zwei Stellen (ADR-0006).
- Betrifft künftig: Paket 007 (Step B) hängt sich an den Übergabepunkt aus
  Punkt 4 und bleibt im selben Sheet/derselben Route. Paket 008 folgt
  Punkt 2 und prüft Punkt 3 (Ablösepunkt). Paket 010 (Mahlzeit-Sheet)
  bekommt ein **eigenes** Sheet über dasselbe `sheet`-Outlet; erst dort
  greift die Zwei-Nutzer-Regel für einen gemeinsamen Sheet-Rahmen in
  `shared/ui/` — in diesem Paket bleibt der Sheet-Rahmen in
  `food-search/components/`.

## Alternativen (kurz)

- **Gewöhnliche Top-Level-Route `eintrag/neu`** — verworfen: Die
  Tagesansicht wird zerstört und neu geladen, Backdrop über der lebenden
  Ansicht ist nicht darstellbar (siehe Punkt 1).
- **Overlay-Zustand in einem `core/sheet.service.ts` statt Router** —
  verworfen: `core/` bekäme Feature-Wissen, der Android-/Browser-Zurück-Weg
  müsste selbst nachgebaut werden, und das Öffnen bliebe ohne
  URL-Repräsentation.
- **Sheet-Komponente direkt in `diary-shell` einbinden** — verworfen:
  Feature-zu-Feature-Import, ausdrücklich ausgeschlossen (ADR-0001,
  ADR-0007 Punkt 5).
- **Serverseitige Suche mit `ilike` und Debounce je Tastendruck** —
  verworfen für dieses Paket: widerspricht der Vorgabe „kein Netz-Nachladen
  beim Tippen" und erzeugt Sprünge in der Trefferliste. Bleibt der
  benannte Ablösepfad (Punkt 3).
- **Eigener `*.repository.ts`-Dateityp bzw. Quellen-Interface mit zwei
  Implementierungen schon jetzt** — verworfen: neue Konvention und
  Abstraktionsebene für genau eine existierende Quelle; Punkt 2 hält den
  Erweiterungspunkt ohne sie offen.
- **`default_portion_g` mit Default `100` füllen** — verworfen: „nicht
  gesetzt" und „100 g" wären nicht mehr unterscheidbar, ausdrücklich
  gegen die Paket-Constraints.
