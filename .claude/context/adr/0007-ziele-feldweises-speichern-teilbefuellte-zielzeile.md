# ADR-0007: Ziele — feldweises Speichern, teilbefüllte Zielzeile (Default 0 statt nullable) und Einstiegspunkt über die Tagesansicht

- **Status**: accepted
- **Datum**: 2026-09-20
- **Bounded Context(s)**: `goals` (wirkt auf `data-platform`, `diary`, `stats`, `app-shell`)
- **task_id**: `PO-2026-09-20-005`

## Kontext

Paket 005 legt `goals` als erstes Feature mit Code an und bringt eine
Nutzerentscheidung mit, die das bestehende Schema **strukturell nicht
hergibt**: Jedes der vier Felder (kcal, Kohlenhydrate, Protein, Fett) hat
einen eigenen Speichern-Button, schreibt ausschließlich seinen eigenen Wert
und muss die Zielzeile anlegen können, wenn sie noch nicht existiert. Eine
teilweise gefüllte Zielzeile ist damit ein **regulärer** Zustand.

`supabase/migrations/20260920161132_init_schema_rls.sql` definiert `goals`
mit vier `numeric not null`-Spalten **ohne Default** (ADR-0004). Das erste
feldweise Speichern wäre ein `insert` mit genau einer Wertspalte und würde an
den drei übrigen `not null`-Spalten scheitern. Ohne Schemaänderung sind die
Abnahmekriterien „erstes Speichern legt den Datensatz mit genau diesem Wert
an" und „andere drei Werte bleiben unverändert" nicht erfüllbar.

Gleichzeitig hat ADR-0006 die Lese-Semantik bereits festgelegt: „kein Ziel
gesetzt" heißt **keine Zeile vorhanden oder Zielwert `<= 0`**. `diary` liest
`goals` direkt per PostgREST und behandelt die vier Werte als `number`.
Jede Lösung für den Schreibpfad muss diese Semantik tragen, ohne den
Lesepfad der Tagesansicht umzubauen.

Die Entscheidung ist teuer umkehrbar: Sie betrifft eine migrierte Tabelle,
den Lesepfad von `diary` und künftig `stats` (Paket 012, Zielinie im
Verlauf).

## Entscheidung

1. **Teilbefüllung über `default 0`, nicht über `nullable`.** Eine neue,
   additive Migration setzt für `goals.kcal`, `carbs_g`, `protein_g`,
   `fat_g` je einen `default 0`; die Spalten bleiben `not null`. Ein
   `insert` mit nur einer Wertspalte ist damit gültig, die übrigen drei
   Werte stehen auf `0` und bedeuten nach ADR-0006 Punkt 4 exakt „kein Ziel
   gesetzt". Der Lesepfad in `diary.service.ts` und die Typen
   (`DiaryGoal` mit vier `number`) bleiben **unverändert**.
   `nullable` wird verworfen: Es erzeugt eine zweite, konkurrierende
   Darstellung von „kein Ziel" (`null` neben `<= 0`), zwingt jeden Leser zu
   einer Fallunterscheidung und widerspricht ADR-0006.
2. **Wertebereiche als `check`-Constraints in derselben Migration**
   (ADR-0004 Punkt 3): `kcal >= 0 and kcal <= 10000`, je Makro
   `>= 0 and <= 1000`. Die Untergrenze ist bewusst `0` und **nicht** `> 0`,
   sonst wäre der Default aus Punkt 1 nicht einfügbar. Die fachliche
   Untergrenze für kcal (`> 0`, ein kcal-Ziel von 0 ist keine sinnvolle
   Eingabe) setzt die Client-Validierung durch; die Datenbank sichert nur
   den Bereich, in dem „0 = kein Ziel" gilt.
3. **Ein Speichervorgang = ein Upsert mit genau einer Wertspalte.**
   `goals.service.ts` schreibt über
   `upsert({ user_id, <feld>, updated_at }, { onConflict: 'user_id' })`.
   PostgREST erzeugt daraus ein `on conflict do update set` **nur über die
   mitgelieferten Spalten**; die drei übrigen gespeicherten Werte werden
   nicht angefasst. Kein `select`-vor-`update`, kein Schreiben des ganzen
   Datensatzes aus dem Client-Zustand — genau das würde konkurrierende
   Feldwerte überschreiben. Die `user_id` kommt aus
   `core/supabase.service.ts` (`userId`, ADR-0003) und ist für den `insert`
   zwingend; die Abgrenzung leistet weiterhin RLS, nicht dieser Wert.
4. **Ein Signal-Store mit Zustand je Feld.** `goals.store.ts` hält für jedes
   der vier Felder unabhängig Eingabewert, Gültigkeit, Speicher- und
   Fehlerzustand (`idle` · `saving` · `saved` · `error`). Es gibt **keinen**
   formularweiten `dirty`/`saving`/`error`-Zustand: Ein globaler
   Speicherzustand würde die Unabhängigkeit der vier Vorgänge im UI wieder
   einsammeln, die dieses Paket gerade herstellt. Validierung und
   Grenzwerte liegen als reine Funktionen in `goals.calculations.ts`
   (code-conventions.md, ADR-0006 Punkt 3), nicht im Store und nicht in der
   Komponente.
5. **Einstieg und Rückweg, ohne Feature-zu-Feature-Import.** `goals` bekommt
   eine eigene lazy Top-Level-Route `ziele` hinter `authGuard`
   (`app.routes.ts`, Muster wie `tagebuch`). Die Tagesansicht bekommt in
   ihrer Kopfzeile einen Icon-Button, der per `routerLink` dorthin
   navigiert — `diary` importiert **nichts** aus `goals`, der Austausch
   läuft über die Route (code-conventions.md).
   Die Tagesansicht lädt ihre Zielzeile beim Aktivieren der Route erneut
   (eigene Methode in `diary.store.ts`/`diary.service.ts`), damit ein
   geändertes Ziel nach der Rückkehr wirkt: `DiaryStore` ist
   `providedIn: 'root'` und lädt sonst nur im Konstruktor.
   Es entsteht **keine** Bottom-Navigation — die kommt in Paket 012.

## Konsequenzen

- Positiv: Die vier Speichervorgänge sind vollständig unabhängig, auch bei
  gleichzeitigem Zugriff von zwei Geräten. „Kein Ziel gesetzt" hat weiterhin
  genau **eine** Darstellung (`<= 0`), die `diary`, `goals` und später
  `stats` gemeinsam verwenden. Der Lesepfad aus ADR-0006 bleibt unberührt.
- Negativ/Trade-off: Ein ausdrücklich gespeichertes Makroziel von `0 g` ist
  von „nie gesetzt" **nicht unterscheidbar** — es wird in der Tagesansicht
  als „kein Ziel" dargestellt. Das ist der Preis für die einheitliche
  Semantik; eine Unterscheidung bräuchte `nullable` und damit ein ablösendes
  ADR. Für die Zieleingabe ist `0` dadurch gleichbedeutend mit „Ziel
  entfernen".
- Negativ/Trade-off: Die Grenzwerte stehen an zwei Stellen — als
  `check`-Constraint in der Migration und als Konstante in
  `goals.calculations.ts`. Das ist beabsichtigt (Client-Rückmeldung vor dem
  Roundtrip, Datenbank als eigentliche Garantie) und keine der beiden
  Stellen darf entfallen; ändert sich ein Grenzwert, sind beide zu ändern.
  Nach `core/*.constants.ts` wandern sie erst, wenn ein **zweites** Feature
  sie auswertet (Zwei-Nutzer-Regel, ADR-0005).
- Betrifft künftig: Paket 012 (`stats`, Zielinie) liest dieselbe Zeile mit
  derselben `<= 0`-Semantik. Eine Historisierung von `goals` bleibt wie in
  ADR-0004 ausgeschlossen und bräuchte ein ablösendes ADR. Dieses ADR
  **verfeinert** die `goals`-Tabelle aus ADR-0004 (Defaults, Checks) und
  löst es nicht ab; RLS-Pattern und Migrationsworkflow gelten unverändert.

## Alternativen (kurz)

- **Vier `numeric`-Spalten `nullable`** — verworfen: zweite Darstellung von
  „kein Ziel" neben `<= 0`, widerspricht ADR-0006 Punkt 4 und zwingt
  `diary`/`stats` zu einer zusätzlichen Fallunterscheidung im Lesepfad.
- **Zeile beim ersten Öffnen der Zielansicht mit Nullwerten anlegen** —
  verworfen: schreibt ohne Nutzerabsicht, erzeugt Zielzeilen für Nutzer, die
  nie ein Ziel gesetzt haben, und braucht trotzdem Defaults für den
  `insert`.
- **Read-modify-write des gesamten Datensatzes je Speichern-Button** —
  verworfen: verletzt das Abnahmekriterium „ändert ausschließlich diesen
  einen Wert" sobald zwei Vorgänge nebeneinander laufen, und macht jeden
  Speichervorgang von der Gültigkeit der anderen drei Felder abhängig.
- **Schlüssel-Wert-Tabelle `goal_settings(user_id, key, value)`** —
  verworfen: macht den feldweisen Schreibpfad trivial, aber jeden Lesepfad
  (Tagesansicht, Verlauf) zur Pivotierung und wäre eine Ablösung von
  ADR-0004 für genau vier feste Felder.
- **Gemeinsamer Speichern-Button** — nicht zulässig: ausdrückliche
  Nutzerentscheidung im Paket.
