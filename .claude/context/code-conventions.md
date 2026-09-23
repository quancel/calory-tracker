# Code Conventions

**Single-Writer: Nur der `architekt`-Agent schreibt hierhin.** Die Leads
liefern Vorschläge über `notes_for_conventions` im Handoff.

- **Modus**: `vorgegeben` (Greenfield, festgelegt in ADR-0001)
- **Zuletzt geprüft**: 2026-09-22 (Nachpflege nach Abschluss aller Pakete
  001–015; Quellen: `notes_for_conventions` der Pakete 013b, 014, 015)

## Frontend (Angular, Standalone Components, Signals — kein NgRx)

### Ordnerstruktur

~~~
src/
  main.ts
  index.html
  manifest.webmanifest
  app/
    app.config.ts                  # Provider-Bootstrap (Router, SW, Session-Init)
                                   #   kein HttpClient (ADR-0010 Punkt 3)
    app.routes.ts                  # Top-Level-Routen + pfadlose Layout-Route,
                                   #   alles lazy (ADR-0014)
    shell/                         # App-Shell hinter dem Login (app-shell):
      components/main-layout/      #   Layout-Route: <router-outlet/> + Bottom-Nav
      components/bottom-nav/       #   Bottom-Navigation (zwei Tabs)
    core/                          # genau einmal instanziiert: Supabase-Client,
                                   #   Guards, Interceptors, app-weite Dienste.
                                   #   Kein Feature-Code.
    shared/
      ui/<component-name>/         # wiederverwendbare, zustandslose Bausteine
      pipes/ · directives/
    <feature>/                     # auth, diary, food-search, meals,
                                   #   goals, stats — kein eigenes
                                   #   `scanner/` (ADR-0010 Punkt 1)
      components/<component-name>/ # je Komponente ein Ordner (.ts/.html/.css)
      <feature>.store.ts           # Signal-Store: einzige Zustandsquelle des Features
      <feature>.service.ts         # Datenzugriff (Supabase/HTTP), kein UI-Wissen
      <feature>.routes.ts          # Lazy-Routen des Features
      models/<name>.model.ts
  styles/
    tokens.css                     # Design-Tokens gemäß design-conventions.md
    styles.css                     # globale Basis/Reset, importiert tokens.css
  environments/                    # Supabase-URL und Anon-Key, keine Secrets
  assets/icons/                    # PWA-Icons (192/512, maskable)
~~~

### Regeln, die die Struktur tragen

- Komponenten lesen Zustand **nur** über den Signal-Store ihres Features
  (`readonly`-Signals/`computed` nach außen), nie über direkte
  Service-Aufrufe aus dem Template.
- Kein HTTP-/Supabase-Aufruf aus einer Komponente. Der Weg ist
  Komponente → Store → Service.
- Ein Feature importiert **nicht** aus einem anderen Feature. Austausch läuft
  über `core/` oder Routen-Parameter.
- Nach `shared/` darf etwas erst, wenn es von **mindestens zwei** Features
  genutzt wird — nicht vorsorglich.
- `core/` enthält nur Dinge, die genau einmal existieren (Supabase-Client,
  Auth-Guard, Fehler-Handling). Alles andere ist Feature oder Shared.
- Alle Komponenten sind Standalone; keine NgModules. State ausschließlich
  über Signals — kein NgRx, kein zusätzlicher State-Container.
- Kein `any`, keine `@ts-ignore`/`@ts-nocheck`. TypeScript läuft strict,
  Ausnahmen werden nicht lokal abgeschaltet.
- CSS referenziert ausschließlich Rollen-Tokens aus `styles/tokens.css`,
  nie Literal-Farben (siehe `design-conventions.md`).
- Ein bewusst nicht abgewarteter Hintergrundlauf (`void someAsyncCall()`,
  typisch in einem `effect` oder nach einem Schreibvorgang) behandelt seinen
  Fehlerfall an der Aufrufstelle — `void` allein lässt jede Rejection
  unbehandelt. Betrifft aktuell die Sync-Anstöße in
  `core/entries.service.ts`.

### Namenskonventionen

- Dateien: kebab-case mit Typ-Suffix — `day-summary.component.ts`,
  `diary.store.ts`, `diary.service.ts`, `diary.routes.ts`,
  `auth.guard.ts`, `food.model.ts`
- Klassen/Symbole: PascalCase mit demselben Suffix (`DiaryStore`,
  `DaySummaryComponent`)
- Tests: `*.spec.ts` direkt neben der getesteten Datei
- Signals: Zustand als `readonly` nach außen; abgeleitete Werte als
  `computed`, keine Duplikate im State

### Tests (Vitest über `@angular/build:unit-test`)

- Globale Testumgebung: `src/test-setup.ts`, registriert in `angular.json`
  unter `projects.*.architect.test.options.setupFiles` und in
  `tsconfig.spec.json` unter `include`. Neue globale Test-Polyfills/-Setups
  kommen **in diese eine Datei**, nicht als zweite Setup-Datei und nicht per
  Import in einzelne `*.spec.ts`.
- `jsdom` kennt kein `indexedDB`: `fake-indexeddb/auto` wird in
  `test-setup.ts` importiert und ist **DevDependency** — damit ist
  `core/local-db.service.ts` ohne Mock-Schicht testbar und ADR-0016 Punkt 2
  („natives `indexedDB`, keine Wrapper-Bibliothek") bleibt unberührt. Eine
  DevDependency ist keine neue Laufzeit-Abhängigkeit im Sinne von ADR-0016.
- Tests, die die IndexedDB anfassen, räumen im `afterEach` in dieser
  **Reihenfolge** auf: erst `TestBed.inject(LocalDbService).close()`, dann
  `indexedDB.deleteDatabase(...)`. Umgekehrt blockiert die noch offene
  Verbindung das Löschen, und der nächste Test läuft auf altem Bestand.
- Tests, die einen gepufferten Schreibvorgang auslösen, warten den
  Hintergrund-Sync explizit ab (`await
  TestBed.inject(EntrySyncService).runQueue()` als Drain), statt sich auf
  Timing zu verlassen — `entries.service.ts` stößt den Lauf per
  `void`/Effect an.
- Ein Supabase-Stub (`{ from: vi.fn() }`) deckt **alle** Pfade ab, die der
  Test auslösen kann — auch die, die nur der Hintergrund-Sync benutzt
  (`from('entries').insert`). Ein fehlender Pfad lässt keinen Test
  fehlschlagen, sondern erzeugt eine unbehandelte Promise-Rejection in der
  Testausgabe.

### Wo was hingehört

- Neue Komponente: `src/app/<feature>/components/<component-name>/`
- Neuer Zustand: in den bestehenden `<feature>.store.ts`, kein zweiter Store
  je Feature ohne ADR
- Geteiltes UI-Element: `src/app/shared/ui/<component-name>/`, erst ab
  zweitem Nutzer
- Reine Rechenlogik eines Features (Summen, Umrechnungen, Schwellen-
  auswertung): `src/app/<feature>/<feature>.calculations.ts` — exportierte
  Funktionen ohne DI, ohne Angular-Import, ohne UI-Wissen; der Store ruft sie
  in `computed` auf. Nicht in den Store einbetten (sonst nur über
  `TestBed` prüfbar) und nicht in eine Komponente (ADR-0006).
- Einmaliger App-Dienst: `src/app/core/`
- Zweite Datenquelle eines Features (z. B. externe API neben Supabase):
  eigene Datei `src/app/<feature>/<feature>.<quelle>.service.ts`, die
  **ausschließlich** von `<feature>.service.ts` aufgerufen wird —
  `<feature>.service.ts` bleibt der einzige Zugang für Store und
  Komponenten und kapselt die Reihenfolge der Quellen (ADR-0008).
- Externe HTTP-APIs: natives `fetch` mit `AbortSignal.timeout(…)` — **kein**
  `HttpClient`, `provideHttpClient` wird nicht registriert (ADR-0010 Punkt
  3). Dienste bleiben `async`/`await`-basiert, keine Observables. Die
  Antwort wird im Dienst nur geholt und in Form gebracht; die **reine**
  Umrechnung/Normalisierung gehört in `<feature>.calculations.ts`.
- Technische Betriebswerte eines Dienstes (Timeouts, Endpunkt-URLs,
  Retry-Grenzen) stehen als exportierte Konstante **in der Dienstdatei
  selbst** (`OFF_REQUEST_TIMEOUT_MS` in `food-search.off.service.ts`) —
  nicht in `<feature>.calculations.ts` (dort nur fachliche Grenzwerte) und
  nicht in `core/*.constants.ts`. Tests importieren die Konstante, statt den
  Wert zu wiederholen.
- Browser-Plattform-APIs mit Fallback (Kamera/`BarcodeDetector` ↔
  `@zxing/browser`): ein Adapter-Dienst `<feature>.<thema>.service.ts` mit
  quellenunabhängiger API; das Fallback-Paket wird per dynamischem
  `import()` erst im Fallback-Fall geladen, nie statisch importiert
  (ADR-0010 Punkt 2). Komponenten prüfen nie selbst auf Verfügbarkeit.
- Neue Ansicht **hinter dem Login**: als `children`-Eintrag der pfadlosen
  Layout-Route in `app.routes.ts` (ADR-0014 Punkt 1). Der `authGuard` steht
  **an der Layout-Route**, nicht am Kind. Navigations-Chrome (Bottom-Nav)
  ergibt sich allein aus dieser Zugehörigkeit — keine URL-Vergleiche, kein
  `showNav`-Signal in `app.ts`, keine Navigation in einer Feature-Shell.
  `routerLink`-Ziele zwischen Features werden **absolut** geschrieben
  (`/tagebuch`, `/verlauf`), nie relativ. Die beiden Auxiliary-Routen im
  Outlet `sheet` bleiben top-level neben der Layout-Route.
- Diagramme/Charts: eigene Komponente im jeweiligen Feature aus Inline-SVG
  und CSS, **keine Chart-Bibliothek** — projektweit keine neue
  Laufzeit-Abhängigkeit für Visualisierung (ADR-0006 Punkt 5, ADR-0014
  Punkt 4). Jeder Datenpunkt ist ein fokussierbares interaktives Element mit
  vollständigem `aria-label`, zusätzlich existiert eine `sr-only`-Tabellen-
  oder Listenalternative mit denselben Werten. Ausnahme: rein andeutende
  Sparklines (Gewichtskarte im Tagebuch, ADR-0019 Punkt 6) sind
  `aria-hidden`, ihre Aussage steht als Text daneben, Werte als
  `sr-only`-Liste.
- Overlay/Bottom-Sheet, das aus einem **anderen** Feature heraus geöffnet
  wird: als lazy Route im benannten Outlet `sheet` in `app.routes.ts`
  (zweites `<router-outlet name="sheet">` in `app.html`); die Komponente
  selbst liegt im besitzenden Feature. Das aufrufende Feature navigiert per
  `routerLink`/`Router` auf das Outlet und importiert nichts (ADR-0008).
- Fachliche Grenzwerte, die **nur ein** Feature auswertet (z. B. zulässige
  Wertebereiche eines Eingabeformulars), bleiben als exportierte Konstanten
  in `src/app/<feature>/<feature>.calculations.ts` — nicht vorsorglich nach
  `core/*.constants.ts`; dorthin wandern sie erst beim zweiten Nutzer
  (Zwei-Nutzer-Regel, ADR-0005). Wird derselbe Grenzwert zusätzlich als
  `check`-Constraint in einer Migration geführt, ist das eine bewusste
  Doppelung (Client-Rückmeldung + Datenbank-Garantie) und bei jeder Änderung
  an **beiden** Stellen nachzuziehen (ADR-0007).
- Supabase-Konfiguration: `src/environments/environment.example.ts` liegt im
  Repo (Platzhalter), `src/environments/environment.ts` ist gitignored und
  wird lokal daraus kopiert. Der Supabase-Client wird ausschließlich in
  `src/app/core/supabase.service.ts` erzeugt; `@supabase/supabase-js` wird
  nirgends sonst importiert (siehe ADR-0003).
- App-weiter Session-Zustand (`session`, `userId`, `isAuthenticated`) liegt
  in `core/supabase.service.ts`, **nicht** in `auth/auth.store.ts` — Features
  lesen die `user_id` von dort, ohne aus `auth` zu importieren (ADR-0003).
- Design-Tokens: ausschließlich `src/styles/tokens.css` — angelegt in Paket
  PO-2026-09-20-001, danach von Folgepaketen nur **erweitert**, nie neu
  angelegt und nie durch eine zweite Token-Datei ergänzt. Bei Abweichung
  zwischen `tokens.css` und `design-conventions.md` ist **`tokens.css` der
  verbindliche Stand** (dort stehen die kontrastgeprüften Werte); die
  Dokumentation wird nachgezogen, nicht der Code zurückgedreht. Jede
  Feinjustierung eines Hex-Werts trägt den Grund als Kommentar an der Zeile
  (alter Wert + gemessener Kontrast, siehe `--color-macro-*`).
- Service-Worker-/PWA-Laufzeit (`@angular/service-worker`): importiert wird
  das Paket nur an zwei Stellen — `app.config.ts` (Registrierung) und
  `src/app/core/app-update.service.ts` (`SwUpdate`, ab Paket 013b). Keine
  Komponente und kein Feature-Store injiziert `SwUpdate`; der Dienst gibt
  Zustand als Signal und Aktionen als Methoden nach außen und bleibt bei
  `isEnabled === false` stumm (ADR-0015).
- Fest am unteren Bildschirmrand positionierte Elemente (Bottom-Navigation,
  FAB, Update-Banner) beziehen ihre Höhen und Abstände aus
  `--size-bottom-nav-height` / `--size-fab` / `env(safe-area-inset-bottom)`
  in `src/styles/tokens.css` — **kein `56px`-Literal** im Komponenten-CSS.
  Stapelung von oben nach unten: Update-Banner → FAB → Bottom-Navigation;
  die `sheet`-Auxiliary-Routen liegen darüber. Ein Element der Shell fragt
  nie zur Laufzeit ab, ob ein Element eines Features gerade sichtbar ist
  (ADR-0015 Punkt 3).
- Schreibzugriff auf `entries` (anlegen/ändern/löschen) und das Lesen eines
  **einzelnen** Eintrags: ausschließlich `src/app/core/entries.service.ts` —
  kein Feature baut einen eigenen Schreibweg auf die Tabelle (ADR-0009). Die
  Tagesliste bleibt in `diary.service.ts` (ADR-0006). Features erfahren von
  Änderungen über das `revision`-Signal des Dienstes (`effect` im
  Feature-Store); `core/` ruft nie in ein Feature hinein. Massenoperationen
  (`createEntries`, `deleteEntries`) erhöhen `revision` **einmal**, nicht
  n-mal; `createEntries` liefert die angelegten IDs zurück (ADR-0013).
- Lokale Persistenz (IndexedDB): einziger Zugang ist
  `src/app/core/local-db.service.ts` — natives `indexedDB`, **keine**
  Wrapper-Bibliothek (`idb`, Dexie o. ä.), genau eine Datenbank, genau ein
  Versionierungs-/Migrationsort. Kein Feature und kein anderer Dienst öffnet
  eine eigene Datenbank; neue Object Stores kommen über eine Versionserhöhung
  dort dazu. `localStorage` wird für Fachdaten nicht verwendet (ADR-0016
  Punkt 2).
- Verbindungszustand (`navigator.onLine`, `online`/`offline`-Events):
  ausschließlich `src/app/core/connectivity.service.ts`, nach außen ein
  Signal. Keine Komponente, kein Store und kein Feature liest diese
  Browser-APIs selbst (Muster wie `SwUpdate` in `core/app-update.service.ts`,
  ADR-0015 / ADR-0016 Punkt 9).
- Offline-Puffer für `entries`: `core/entry-queue.service.ts` (Zustand +
  IndexedDB-Persistenz) und `core/entry-sync.service.ts` (Übertragung,
  sequenziell und single-flight) liegen **hinter**
  `core/entries.service.ts` — dieser bleibt der einzige Schreibweg
  (ADR-0009) und der einzige Aufrufer der beiden. Aufrufende Features ändern
  ihren Aufruf nicht und prüfen nie selbst auf „online". Gepuffert wird nur
  das **Anlegen**; ein Schreibvorgang, der gepuffert wurde, gilt nach außen
  als erfolgreich und erhöht `revision` (ADR-0016 Punkt 4/5).
- Eintrags-IDs werden beim Anlegen im **Client** vergeben
  (`crypto.randomUUID()`) und mit dem Insert mitgesendet; sie sind zugleich
  Idempotenzschlüssel. Ein Unique-Violation-Fehler (`23505`) auf die eigene
  ID beim Wiederholungsversuch wird als **Erfolg** behandelt. Es gibt keine
  „lokale" und keine „echte" ID und kein ID-Umschreiben nach dem Sync
  (ADR-0016 Punkt 3). Technische Betriebswerte des Syncs (Versuchsgrenze,
  Backoff-Stufen, Liste der als permanent geltenden Statuscodes) stehen als
  exportierte Konstanten **in** `core/entry-sync.service.ts`, nicht in
  `core/*.constants.ts`.
- Offline-Lesecache: Schnappschüsse (zuletzt geladener Tag + Zielzeile,
  zuletzt geladener Food-Bestand) werden nach jedem **erfolgreichen** Laden
  über `core/local-db.service.ts` geschrieben und nur bei gescheiterter
  Abfrage gelesen. Ein Schnappschuss ist reiner Anzeige-Ersatz und nie
  Grundlage eines Schreibvorgangs; die netzabhängigen Lesepfade
  (`diary.service.ts`, `core/foods.service.ts`) bleiben in ihrer Query
  unverändert (ADR-0016 Punkt 8).
- Rücknahme einer gerade ausgeführten Massenaktion (z. B. „gestern
  kopieren"): ausschließlich über die beim Anlegen zurückgegebenen
  **Datensatz-IDs**, nie über eine Merkmalssuche und nie über ein
  Batch-/Aktionsfeld in der Datenbank. Der Undo-Zustand ist reiner
  Client-State im bestehenden Feature-Store (Map `Kontext → { ids, … }`),
  wird nicht persistiert und beim Verlassen der Ansicht bzw. Wechsel des
  fachlichen Bezugs (Datum) geleert (ADR-0013). Der Reload-Pfad des Stores
  setzt diesen Zustand nicht zurück.
- Foods **lesen** (Liste + Sitzungs-Cache): `src/app/core/foods.service.ts`
  — genau ein Cache im Projekt, Feature-Stores filtern über dessen
  `foods()`-Signal mit eigener Query. Foods **schreiben** (Anlegen,
  Korrigieren), Barcode-Lookup und Open Food Facts bleiben ausschließlich in
  `src/app/food-search/food-search.service.ts` (ADR-0012 Punkt 1). Der Typ
  `Food` wird in `core/foods.service.ts` definiert — keine zweite
  Definition, kein Re-Export.
- Reine Food-/Nährwert-Rechenlogik mit mehr als einem nutzenden Feature
  (Filter, Mengen-/Live-Berechnung, Plausibilitäts-/Vollständigkeitsprüfung,
  generische Feldvalidierung): `src/app/core/foods.calculations.ts`; die
  zugehörigen Schwellen in `src/app/core/nutrition.constants.ts`. Was nur
  `food-catalog` nutzt (OFF-Normalisierung, Step-A2-Formularvalidierung,
  Kamera-Fehlertexte), bleibt in `food-search.calculations.ts`
  (ADR-0012 Punkt 2).
- Gespeicherte Mahlzeiten: **Lesepfad** (Liste mit Positionen und
  eingebetteten Foods) in `src/app/core/meals.service.ts`, Sortierung und
  Summen in `src/app/core/meals.calculations.ts` — Sortierung immer über
  `Intl.Collator('de', { sensitivity: 'base' })`, nie über `order by` in der
  Abfrage. **Schreiben** von `meals`/`meal_items` ausschließlich in
  `src/app/meals/meals.service.ts` (ADR-0012 Punkt 3/4).
- Geteilte UI-Bausteine liegen ab Paket 010 in `src/app/shared/ui/`:
  `bottom-sheet/` (Rahmen mit Backdrop, Drag-Handle, Fokusfalle, Output
  `close`, Inhalt per `ng-content`), `confirm-dialog/`,
  `plausibility-marker/`, ab Paket 012 zusätzlich `macro-bar/` (zweiter
  Nutzer `stats`, API `label`/`macro`/`progress` unverändert, ADR-0014
  Punkt 7). Ein Sheet-Rahmen, Bestätigungsdialog, Marker oder Makro-Balken
  **im Feature** ist ab hier eine Abweichung und braucht ein ADR
  (ADR-0012 Punkt 5).
- `MealType`, `MEAL_TYPE_ORDER`, `MEAL_TYPE_LABELS`:
  `src/app/core/meal-type.constants.ts` (genutzt von `diary` und
  `food-catalog`, ADR-0009). `suggestedMealTypeForHour()` bleibt dagegen in
  `diary.calculations.ts` — Rechenlogik mit genau einem Aufrufer.
- Kalendertage (`entries.date` und alles, was darauf filtert) werden im
  Frontend als **lokaler** `YYYY-MM-DD`-String geführt — nie als `Date` im
  Zustand, nie über `toISOString()` serialisiert (UTC-Verschiebung). Keine
  Datums-Bibliothek (ADR-0006). Tagesarithmetik und Tages-Beschriftung
  (`todayKey`, `addDaysToKey`, `diffInDays`, `maxForwardKey`,
  `formatDateLabel`, `MAX_FORWARD_DAYS`, `DateLabel`) liegen ab Paket 012
  in `src/app/core/date.calculations.ts` — genau eine Quelle, auch für das
  Vorwärtsfenster „heute + 7" (ADR-0014 Punkt 7/8). Perioden-Arithmetik
  (Woche Mo–So, Monat, Anker-Tag) bleibt in `stats.calculations.ts`.
- Ziel-/Überschussberechnung gegen ein Zielwert (`computeProgress`,
  `ProgressResult`, 105-%-Schwelle): `src/app/core/progress.calculations.ts`
  — genutzt von `diary` und `stats`, keine Zweitdefinition, kein Re-Export
  aus einem Feature (ADR-0014 Punkt 7). Die Semantik „kein Ziel gesetzt =
  keine Zeile oder Wert `<= 0`" (ADR-0006 Punkt 4) wird ausschließlich hier
  ausgewertet.
- Mengenumrechnung eines Eintrags (`amount_g / 100 × Wert je 100 g`):
  `computeLiveNutrition()` aus `src/app/core/foods.calculations.ts` — kein
  Feature schreibt die Formel erneut.
- Gewichtslog und Kalorienziel-Vorschlag liegen im Feature `goals`
  (ADR-0017), die Ansicht ist seit ADR-0019 der eigene Tab `/gewicht`
  (`goals/components/weight-page/`, Route `goals/weight.routes.ts`):
  `goals/weight.store.ts` (zweiter Store im Feature — ausdrücklich durch
  ADR-0017 Punkt 5 gedeckte Ausnahme), `goals/weight.calculations.ts`
  (Regressionsrechnung, Mindestdatenlage, Diagramm, **alle** Konstanten der
  Rechenregel), `goals/models/weight.model.ts`, `goals/components/weight-*/`.
  Der Tabellenzugriff auf `weight_logs` liegt seit ADR-0019 **ausschließlich**
  in `src/app/core/weight-logs.service.ts` (zweiter Nutzer `diary`,
  `revision`-Signal wie bei `entries`), ebenso der Typ `WeightLogEntry`.
  Wertebereich, `validateWeightEntry` und `formatWeightKg`:
  `src/app/core/weight.calculations.ts`. Die Gewichtskarte im Tagebuch
  (`diary/components/weight-card/`) hält ihren Zustand im `DiaryStore`, der
  Mini-Verlauf wird in `diary.calculations.ts` berechnet. Kein `stats`-Bezug,
  kein `shared/`-Umzug des großen Charts (ein Nutzer). Die **Rechenregel** des Vorschlags ist seit ADR-0018
  zielbasiert (ADR-0017 Punkt 3 ist abgelöst); sie gibt einen **Summentyp**
  (`'no-entries' | 'no-target' | 'insufficient' | { kind: 'suggestion',
  kcal, holding }`) zurück, keine Zahl mit Sonderwerten — die Komponente
  rechnet nichts nach und trifft keine Fallunterscheidung selbst.
- Das **Zielgewicht** (`goals.target_weight_kg`) ist ein regulärer
  Feldblock des feldweisen Speicherns in `goals.store.ts`/`goals.service.ts`
  — kein Zustand des `WeightStore`, der es nur **liest** (ADR-0018 Punkt 6).
  `GOAL_FIELD_ORDER` bleibt die Anzeigereihenfolge der **vier**
  kcal-/Makro-Feldblöcke; die Menge aller Feldschlüssel (Store-Record,
  `load()`) ist eine eigene Konstante. Das Zielgewicht wird außerhalb der
  `@for`-Schleife im Gewichtslog-Abschnitt gerendert
  (`design-conventions.md`), mit derselben `GoalFieldComponent`.
- Ein Bottom-Sheet, das **innerhalb desselben Features** geöffnet wird
  (z. B. das Gewichts-Erfassen-Sheet in der Ziele-Ansicht), ist **keine**
  Auxiliary-Route: Es wird als Komponente im Feature gerendert und benutzt
  `shared/ui/bottom-sheet/` als Rahmen. Die `sheet`-Outlet-Regel gilt nur
  für Sheets, die aus einem **anderen** Feature heraus geöffnet werden
  (ADR-0008 Punkt 1, ADR-0017 Punkt 8).
- Projektweite fachliche Konstanten (Schwellen, Grenzwerte, Pflichtfeld-
  Listen), die in **Rechenlogik** ausgewertet werden und mehr als ein
  Feature betreffen: `src/app/core/<thema>.constants.ts` — z. B.
  `src/app/core/nutrition.constants.ts` mit der 105-%-Toleranzschwelle
  (ADR-0005). Kein Feature definiert einen solchen Wert lokal, kein Feature
  importiert ihn aus einem anderen Feature, und ein Wert wird nie zugleich
  als CSS-Token **und** als Konstante geführt (zwei Quellen für einen Wert).

## Backend (Supabase — kein eigener Service)

### Layout

~~~
supabase/
  migrations/<YYYYMMDDHHMMSS>_<beschreibung>.sql   # Schema + RLS, fortlaufend
  seed.sql                                          # optional, keine echten Daten
~~~

### Regeln und Benennung

- Tabellen/Spalten: snake_case, Tabellen im Plural (`foods`, `entries`,
  `meal_items`).
- Jede Tabelle hat RLS aktiviert; Policies liegen in derselben Migration wie
  die Tabelle, nie nachträglich „später".
- Migrationen sind **additiv und unveränderlich**: eine bereits committete
  Migration wird nie editiert, Korrekturen kommen als neue Migration.
- Dateiname mit UTC-Zeitstempel `<YYYYMMDDHHMMSS>_<beschreibung>.sql`; der
  Inhalt ist wiederholbar einspielbar (`if not exists`,
  `drop policy if exists` vor `create policy`). Keine Supabase-CLI als
  Projekt-Abhängigkeit (ADR-0004).
- Schlüssel sind `uuid` mit `default gen_random_uuid()`; Nutzerbezug immer
  `references auth.users(id) on delete cascade`.
- Wertebereiche als `check`-Constraint, **keine** Postgres-`enum`-Typen
  (ADR-0004).
- Policies benennen: `<tabelle>_<operation>` (z. B. `entries_select`).
  Kindtabellen ohne eigene `user_id` binden per `exists`-Unterabfrage auf
  den Elternsatz, statt `user_id` zu denormalisieren.
- Keine Secrets im Repo — nur Supabase-URL und Anon-Key über
  `src/environments/`.

## Abweichungen

Stellen, die bewusst von obigen Regeln abweichen — damit sie nicht bei
nächster Gelegenheit „korrigiert" werden.

- Features liegen direkt unter `src/app/<feature>/`, nicht unter
  `src/app/features/<feature>/` (Vorgabe aus dem Feature-Request; siehe
  ADR-0001).
- Kein `store/`-Unterordner und keine Facade je Feature: ein einzelner
  Signal-Store ersetzt Actions/Reducer/Effects/Selectors/Facade
  (siehe ADR-0001).
- `core/entries.service.ts` enthält bewusst fachlichen Tabellenbezug,
  obwohl `core/` sonst frei von Feature-Code ist: Die Tabelle hat ab Paket
  011 Schreiber aus drei Features, ein Feature-Ort wäre in jedem Fall
  falsch (ADR-0009). Nicht nach `diary/` „zurückräumen". Dasselbe gilt ab
  Paket 010 für `core/foods.service.ts`, `core/foods.calculations.ts`,
  `core/meals.service.ts` und `core/meals.calculations.ts` (ADR-0012) —
  die Abhängigkeit zwischen `meals` und `food-catalog` läuft in beide
  Richtungen und ist nur über `core/` importfrei auflösbar.
- `core/entries.service.ts` kapselt ab Paket 014 zusätzlich
  Fehlerklassifizierung (permanent vs. temporär) und Pufferung — bewusst
  mehr Fachlichkeit an einer Stelle, weil der Puffer sonst an drei Features
  dupliziert würde (ADR-0016 Punkt 4). Nicht in die Features „zurückverteilen".
- Ein gepufferter Eintrag trägt einen **Nährwert-Schnappschuss** seines Foods
  (Name + vier 100-g-Werte + `source`). Das ist eine bewusste
  Denormalisierung gegen die Regel „Nährwerte nie doppelt führen": Ohne sie
  ist ein gepufferter Eintrag offline weder darstellbar noch summierbar.
  Übertragen wird trotzdem ausschließlich `food_id`; der Schnappschuss
  verschwindet mit dem Queue-Eintrag (ADR-0016 Punkt 6).
- Der Zugriff auf `meals`/`meal_items` ist bewusst auf zwei Dateien
  verteilt (Lesen in `core/meals.service.ts`, Schreiben in
  `meals/meals.service.ts`) — gleiche bewusste Aufteilung wie bei
  `entries` (ADR-0006/0009). Bei Spaltenänderungen sind **beide**
  nachzuziehen.
- Die Zielzeile aus `goals` wird ab Paket 012 an **zwei** Stellen gelesen:
  `diary/diary.service.ts` und `stats/stats.service.ts` (je vier Spalten,
  gleiche snake→camel-Abbildung). Bewusst doppelt, weil die riskante Logik
  (`<= 0` = kein Ziel) mit `core/progress.calculations.ts` nur einmal
  existiert und ein Umzug des Lesepfads ein abgeschlossenes Feature
  anfassen würde. Beim **dritten** Leser wandert der Lesepfad nach
  `core/goals.service.ts` (Muster `core/meals.service.ts`) — bis dahin nicht
  „aufräumen" (ADR-0014 Punkt 6).
- `entries` wird ab Paket 015 an **zwei** Stellen über einen Zeitraum
  gelesen: `stats/stats.service.ts` (vier Makros, Woche/Monat) und
  `goals/goals.service.ts` (nur `foods(kcal_100g)`, 28-Tage-Fenster für den
  Kalorienziel-Vorschlag). Bewusst doppelt — ein Umzug nach `core/` würde im
  letzten Paket ein abgeschlossenes Feature ohne fachlichen Gewinn
  anfassen. Beim **dritten** Bereichsleser wandert der Lesepfad nach
  `core/` (Muster `core/meals.service.ts`); bis dahin nicht „aufräumen"
  (ADR-0017 Punkt 4).
- Das Feature `goals` hat ab Paket 015 **zwei** Signal-Stores
  (`goals.store.ts` für die vier Zielfelder, `weight.store.ts` für
  Gewichtslog und Vorschlag). Das ist eine durch ADR-0017 Punkt 5
  begründete Ausnahme von „kein zweiter Store je Feature ohne ADR" und kein
  Präzedenzfall für andere Features. `WeightStore` injiziert `GoalsStore`
  ausschließlich für die Übernahme des Vorschlags — es gibt weiterhin genau
  einen Schreibweg auf `goals` (`goals.service.ts`, ADR-0007).
- `goals.target_weight_kg` ist **nullable** und trägt `null` als „nicht
  gesetzt" — abweichend von den vier Wertspalten der Zielzeile, bei denen
  `0` (bzw. `<= 0`) diese Bedeutung hat (ADR-0007 Punkt 1). Begründung in
  ADR-0018 Punkt 2: `0` liegt außerhalb jedes gültigen Gewichtsbereichs.
  Die Abweichung gilt **nur** für diese Spalte — nicht auf die vier anderen
  übertragen und nicht „vereinheitlichen". Wer die Zeile liest, muss beide
  Konventionen kennen.
- `core/` enthält mit `*.constants.ts` bewusst auch reine Wertedateien ohne
  Dienst-Charakter. `shared/` wäre der naheliegendere Ort, scheitert aber an
  der Zwei-Nutzer-Regel, solange die nutzenden Features noch nicht alle
  existieren (ADR-0005). Nicht „aufräumen".
- Die drei Makrofarben in `src/styles/tokens.css` (`--color-macro-carbs`
  `#a58520`, `--color-macro-protein` `#4c60ab`, `--color-macro-fat`
  `#b95844`) weichen bewusst von den in `design-conventions.md` notierten
  Vorschlagswerten ab — sie wurden in Paket PO-2026-09-20-013a gemeinsam
  abgedunkelt (HSL-Lightness × 0.82), weil `#c9a227` mit 2.42:1 die
  3:1-Schwelle für Diagrammflächen verfehlte. **Nicht auf die dokumentierten
  Werte zurücksetzen**; die Nachpflege der Doku liegt beim `ux-ui-designer`.
- `--elevation-flat` / `--elevation-medium` / `--elevation-high` existieren in
  `tokens.css`, sind in `design-conventions.md` aber noch nicht als Tokens
  benannt (dort nur „Elevation flach/mittel/hoch" in Prosa). Bis zur
  Nachpflege ist `tokens.css` die Quelle — keine eigenen `box-shadow`-Literale
  in Komponenten anlegen.
- `--size-bottom-nav-height: 56px` und `--size-fab: 56px` (Paket 013b,
  ADR-0015 Punkt 3) existieren in `tokens.css`, sind in
  `design-conventions.md` aber noch nicht als Tokens dokumentiert. Bis zur
  Nachpflege beim `ux-ui-designer` ist `tokens.css` die Quelle; der
  Bottom-Offset des Update-Banners ergibt sich als
  `calc(var(--size-bottom-nav-height) + env(safe-area-inset-bottom) +
  var(--space-4) * 2 + var(--size-fab))` und wird nicht durch Literale
  ersetzt.
- Die Inline-Erläuterung des Sync-Status-Markers ist **je
  `MealSectionComponent`** exklusiv (Signal `openMarkerEntryId` in der
  Komponente), nicht seitenweit: Ein Tap in einer anderen Mahlzeiten-Sektion
  schließt eine bereits offene Erläuterung nicht. `design-conventions.md`
  („Sync-Status-Marker") beschreibt seitenweite Exklusivität. Bewusst so
  belassen in Paket 014 — seitenweite Exklusivität bräuchte gehobenen
  Zustand in der Tagebuch-Seite bzw. im Store. Nicht „nachziehen", solange
  die Klärung beim `ux-ui-designer` offen ist.
