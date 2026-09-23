# ADR-0013: „Gestern kopieren" — ID-Tracking der Kopieraktion statt Merkmalssuche, Undo als Client-State im `DiaryStore`, `createEntries`/`deleteEntries` in `core/`

- **Status**: accepted
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `diary` (wirkt auf `food-catalog`, `meals` über `core/entries.service.ts`)
- **task_id**: `PO-2026-09-20-011`

## Kontext

Paket 011 kopiert die Einträge des Vortags additiv in den angezeigten Tag
(ganzer Tag oder eine Sektion) und bietet danach eine Inline-Rückmeldung mit
„Rückgängig machen" an. Die Rücknahme muss **exakt** die durch diese eine
Kopieroperation angelegten Einträge entfernen — auch dann, wenn der Nutzer
eine Kopie danach bearbeitet hat oder am selben Tag ein gleichartiger
Eintrag von Hand existiert. Eine Suche über Merkmale
(`food_id`/`amount_g`/`meal_type`/`date`) kann eine Kopie von einem manuell
angelegten Eintrag nicht unterscheiden und würde Fremdes mitlöschen.

Belegter Ist-Stand (geprüft am 2026-09-21):

- `core/entries.service.ts` ist der einzige Schreibweg auf `entries`
  (ADR-0009). `createEntries()` existiert seit Paket 010 (ADR-0012 Punkt 6),
  gibt aber **keine** IDs zurück (`insert` ohne `.select()`); `deleteEntry()`
  löscht genau eine Zeile.
- Der Lesepfad der Tagesliste liegt in `diary.service.ts` (ADR-0006); es
  gibt bisher keine Abfrage auf einen **anderen** Tag als den angezeigten.
- `shared/ui/confirm-dialog/` existiert (ADR-0012 Punkt 5) und ist
  zustandslos — der Aufrufer entscheidet, was bei `confirm` passiert.
- `entries` hat `id uuid default gen_random_uuid()` und
  `created_at timestamptz default now()`; RLS erlaubt Insert/Delete auf
  eigene Zeilen (`entries_insert`, `entries_delete`). Für Kopie und
  Rücknahme fehlt **nichts** am Schema.
- `DiaryStore` ist `providedIn: 'root'` und lädt den Tag über einen `effect`
  auf `EntriesService.revision()` neu — eine Kopieraktion löst also
  zwangsläufig einen vollständigen Reload des Tages aus.

## Entscheidung

1. **Die Zuordnung „welche Einträge stammen aus dieser Kopieraktion" läuft
   ausschließlich über die beim Insert zurückgegebenen IDs**, nie über eine
   Merkmalssuche. Dafür liefert `EntriesService.createEntries()` die
   angelegten IDs mit: `insert(...).select('id')`, Erfolgsergebnis wird zu
   `{ success: true; ids: string[] }`. Das ist eine **Verbreiterung** des
   bestehenden Ergebnisses — `food-search.store.ts` (Mahlzeit loggen) wertet
   weiterhin nur `success` aus und bleibt unverändert; die Tests von
   `createEntries` ziehen nach.
2. **Neue Methode `EntriesService.deleteEntries(ids: readonly string[])`** —
   ein `delete().in('id', ids)`, `revision` wird **einmal** erhöht (gleiches
   Muster wie `createEntries`). Bereits einzeln gelöschte IDs führen dabei
   nicht zu einem Fehler: PostgREST löscht die vorhandene Schnittmenge, die
   fehlenden Zeilen werden stillschweigend übersprungen — genau das von der
   Akzeptanz geforderte Verhalten, ohne Vorab-Prüfung. Leeres Array ist ein
   defensiver Guard ohne Request. Damit bleibt `core/entries.service.ts` der
   einzige Schreibweg (ADR-0009 fortgeschrieben, nicht geändert).
3. **Keine Schema-Erweiterung, keine Rückverknüpfung.** Kopierte Einträge
   sind nach dem Anlegen gewöhnliche Einträge — kein `batch_id`, kein
   `copied_from`, kein Aktionsfeld, keine Migration in diesem Paket.
   Dieselbe Linie wie ADR-0012 Punkt 6 („geloggte Positionen sind danach
   gewöhnliche Einträge").
4. **Der Undo-Zustand lebt im bestehenden `DiaryStore`**, nicht in einem
   zweiten Store und nicht in einer Komponente: eine Map
   `context → { sourceDateKey, entryIds, count }` mit
   `context: 'global' | MealType`. Pro Kontext höchstens ein Eintrag; eine
   erneute Kopieraktion desselben Kontexts **ersetzt** ihn. Globale und
   sektionsbezogene Rückmeldung existieren unabhängig nebeneinander
   (design-conventions.md „Inline-Rückmeldung mit Rückgängig-Bestätigung",
   Punkt „Bei mehreren gleichartigen Auslösern").
   Der Zustand wird geleert bei: bestätigtem Rückgängigmachen, Schließen
   über die „x"-Affordanz, Ersetzen durch eine neue Kopieraktion desselben
   Kontexts, **Wechsel des angezeigten Datums** und Verlassen der
   Tagebuch-Seite (`DiaryShellComponent.ngOnDestroy`). Er wird **nirgends**
   persistiert — kein `localStorage`, kein Query-Parameter, kein Überleben
   eines Reloads.
5. **Der Reload-Pfad und der Undo-Zustand sind entkoppelt.** Der
   `revision`-Effekt lädt den Tag neu und darf die Rückmeldung dabei
   **nicht** zurücksetzen — sonst zerstörte die Kopieraktion die eigene
   Rückmeldung. Auch das Bearbeiten/Löschen eines einzelnen Eintrags lässt
   die Rückmeldung stehen; die IDs bleiben gültig, gelöschte werden bei der
   Rücknahme übersprungen (Punkt 2).
6. **Die Kopiervorlage wird über eine eigene schlanke Abfrage im
   `diary.service.ts` geladen** (`loadCopySource(dateKey)`): nur
   `id, meal_type, amount_g, food_id` des Vortags, **ohne** eingebettete
   Foods — kopiert werden ausschließlich `food_id` und `amount_g`, Nährwerte
   ergeben sich beim Lesen. Die Abfrage läuft zusammen mit dem Laden des
   angezeigten Tages (ein zusätzlicher PostgREST-Request je Tageswechsel)
   und speist zugleich die Zähler des globalen Auslösers und der
   Sektions-Badges. Der Lesepfad bleibt damit in `diary.service.ts`
   (ADR-0006); `core/` bekommt keinen Tageslese-Pfad.
7. **Bezugstag ist immer `angezeigter Tag − 1`**, berechnet mit
   `addDaysToKey()` aus `diary.calculations.ts` (lokale `YYYY-MM-DD`-Keys,
   nie `Date`/`toISOString()`, ADR-0006 Punkt 2). Die Beschriftung
   „{Bezugstag}" kommt aus dem bestehenden `formatDateLabel()`.
8. **Die Inline-Rückmeldung bleibt eine Komponente in `diary`**
   (`diary/components/copy-feedback/`), **nicht** in `shared/ui/`: Sie hat
   genau einen Nutzer. Dass design-conventions.md das Pattern als
   „wiederverwendbar" beschreibt, verschiebt den Ort nicht — die
   Zwei-Nutzer-Regel gilt (ADR-0001/ADR-0012 Punkt 5). Der
   **Bestätigungsdialog** dagegen ist der bestehende
   `shared/ui/confirm-dialog/`, kein eigener Dialog im Feature.

## Konsequenzen

- Positiv: Die Rücknahme ist exakt und unabhängig davon, was nach dem
  Kopieren mit den Einträgen passiert ist. `entries` bleibt frei von
  Aktions-/Batch-Metadaten, die eine Sitzungs-Semantik dauerhaft in die
  Datenbank schreiben würden. Es bleibt bei genau einem Schreibweg auf
  `entries` und genau einem Store je Feature.
- Negativ/Trade-off: `core/entries.service.ts` wächst um eine zweite
  Massenoperation, und die IDs einer Kopieraktion leben nur im Speicher —
  nach einem Reload ist die Rücknahme nur noch als Einzel-Löschen möglich.
  Das ist die vom Nutzer freigegebene Einschränkung, keine Lücke. Die
  Tagesansicht setzt außerdem einen zusätzlichen Request je Tageswechsel ab.
- Betrifft künftig: Jede weitere additive Massenaktion mit Rücknahme
  (z. B. „Woche kopieren", Mehrfach-Log) nutzt `createEntries` +
  zurückgegebene IDs + `deleteEntries` und das Kontext-Map-Muster aus
  Punkt 4, statt ein eigenes Verfahren zu erfinden. Ein zweiter Nutzer der
  Inline-Rückmeldung löst den Umzug nach `shared/ui/` aus (Punkt 8).

## Alternativen (kurz)

- **Rücknahme über Merkmalssuche** (`food_id`/`amount_g`/`meal_type`/`date`)
  — verworfen: unterscheidet Kopie und Handeingabe nicht und scheitert an
  nachträglich bearbeiteten Kopien; die Akzeptanz verlangt ausdrücklich das
  Gegenteil.
- **`batch_id`/`copied_from`-Spalte auf `entries`** — verworfen: widerspricht
  der Vorgabe „kein zusätzliches Schema-Feld, keine Persistenz über Reload"
  und schreibt einen Sitzungszustand dauerhaft in die Datenbank; zudem eine
  Migration für eine reine UI-Komfortfunktion.
- **Kopieren als Postgres-Funktion/RPC (`insert … select`)** — verworfen:
  neues Persistenz-Pattern im Projekt (bisher ausschließlich PostgREST auf
  Tabellen, ADR-0012 Punkt 7) ohne Gewinn; die IDs kämen zwar zurück, die
  Client-seitige Undo-Verwaltung bliebe identisch.
- **Undo-Zustand in `DiaryShellComponent` statt im Store** — verworfen:
  Zustand der Tagesansicht gehört in den Signal-Store des Features
  (code-conventions.md), sonst ist er nur über den Komponententest prüfbar;
  die Bindung an den Seitenaufruf leistet das gezielte Leeren aus Punkt 4.
- **Optimistisches Einfügen der Kopien in die Liste** — verworfen: die
  Tagesansicht lädt nach jedem Schreibvorgang vollständig neu (ADR-0009
  Punkt 4); ein zweiter Aktualisierungsweg wäre eine zweite Wahrheit.
