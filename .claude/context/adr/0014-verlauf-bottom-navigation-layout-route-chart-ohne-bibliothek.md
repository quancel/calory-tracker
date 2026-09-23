# ADR-0014: Verlauf & Bottom-Navigation — pfadlose Layout-Route als App-Shell, Balken-Chart ohne Chart-Bibliothek, Perioden-Aggregation im Client, geteilte Bausteine nach `core/`/`shared/`

- **Status**: accepted
- **Datum**: 2026-09-21
- **Bounded Context(s)**: `stats`, `app-shell` (wirkt auf `diary`, `goals`, `meals`, `food-catalog`, `data-platform`)
- **task_id**: `PO-2026-09-20-012`

## Kontext

Paket 012 bringt zwei Dinge zusammen, die bisher aufgeschoben waren:

1. **Die Bottom-Navigation.** ADR-0007 Punkt 5 hat sie ausdrücklich auf dieses
   Paket vertagt; `design-conventions.md` („Bottom-Navigation (final, Paket
   012)") beschreibt sie als **projektweit gültig für alle Ansichten hinter
   dem Login**. Heute liegt hinter dem Login jede Route flach in
   `app.routes.ts` (`tagebuch`, `ziele`, `mahlzeiten`, je eigener
   `authGuard`), dazu zwei Auxiliary-Routen im Outlet `sheet`. Es gibt keinen
   Ort, an dem eine dauerhafte Navigation hängen könnte, außer `app.html` —
   das aber auch den Login rendert.
2. **Das erste Diagramm der App.** `stats` existiert als Bounded Context in
   der Context-Map, hat aber noch keine Datei. Die Verlaufsansicht braucht
   eine Aggregation über einen **Zeitraum** (bis 31 Tage) statt über einen
   Tag — der Lesepfad aus ADR-0006 ist tagesbezogen.

Beide Entscheidungen sind teuer umkehrbar: Die Navigations-Topologie betrifft
jede künftige Ansicht hinter dem Login, die Chart- und Aggregationsfrage
jedes künftige Auswertungspaket (015 Gewichtslog ist bereits angekündigt).
Zusätzlich wird mit `stats` der **zweite Nutzer** für drei Bausteine
erreicht, für die ADR-0006 die Auslagerung bereits angekündigt hatte.

## Entscheidung

1. **Bottom-Navigation als pfadlose Layout-Route, nicht als Sichtbarkeits-
   Logik in `app.ts`.** `app.routes.ts` bekommt eine pfadlose Route
   (`{ path: '', canActivate: [authGuard], loadComponent: MainLayoutComponent,
   children: [...] }`), unter die **alle** geschützten Top-Level-Routen als
   `children` wandern: `tagebuch`, `verlauf`, `ziele`, `mahlzeiten`. Der
   `authGuard` steht damit **einmal** an der Layout-Route statt viermal an
   den Kindern. `MainLayoutComponent` rendert den primären
   `<router-outlet/>` und darunter `<app-bottom-nav/>`. Die Sichtbarkeit der
   Navigation ergibt sich aus der **Routenzugehörigkeit**; es gibt keinen
   URL-Vergleich und kein `showNav`-Signal in `app.ts`. `login` und der
   `''`→`login`-Redirect (mit `pathMatch: 'full'`, **vor** der Layout-Route)
   bleiben unverändert top-level.
   Die App-Shell bekommt dafür erstmals ein eigenes Verzeichnis
   `src/app/shell/` mit `components/main-layout/` und
   `components/bottom-nav/`.
2. **Die beiden `sheet`-Auxiliary-Routen bleiben top-level** neben der
   Layout-Route, `app.html` behält beide Outlets. Das Sheet liegt damit
   weiterhin über allem — auch über der Bottom-Navigation — und die
   bestehenden Aufrufe `router.navigate([{ outlets: { sheet: [...] } }])`
   aus `diary`/`meals` bleiben unverändert gültig (absolut ab Wurzel,
   primärer Outlet-Zweig bleibt erhalten). ADR-0008 Punkt 1 / ADR-0012
   Punkt 9 gelten fort.
3. **Genau zwei Tabs; `ziele` und `mahlzeiten` bleiben tab-lose Routen.**
   Tabs: Tagebuch → `/tagebuch`, Verlauf → `/verlauf`. `ziele` (Icon im
   Tagesansicht-Header, ADR-0007 Punkt 5) und `mahlzeiten` (Icon im
   Tagesansicht-Header, ADR-0012 Punkt 9) behalten ihren Einstieg und
   bekommen **keinen** Tab und kein Mehr-Menü. Sie liegen trotzdem innerhalb
   der Layout-Route und zeigen die Navigation (design-conventions.md:
   „projektweit für alle Ansichten hinter dem Login"), markieren dabei aber
   **keinen** Tab als aktiv — kein `aria-current` auf einem Tab, den man
   gerade nicht besucht.
4. **Kein Chart-Bibliothek-Zugang — Inline-SVG/CSS im Feature.** Es kommt
   keine neue Laufzeit-Abhängigkeit ins Projekt (Fortschreibung von ADR-0006
   Punkt 5). Das Balken-Chart wird als eigene Komponente in
   `src/app/stats/components/` gebaut. Grund: Praktisch alles am Chart ist
   Eigenverhalten — drei Balkenzustände (normal/Lücke/Zukunft), die
   105-%-Aufteilung aus dem Kalorienring-Pattern, eine gestrichelte Zielinie
   mit rechtsbündigem Label, ein randkorrigiertes Tooltip mit am Balken
   ausgerichteter Zeigerspitze, je Balken ein vollständiges `aria-label` und
   eine `sr-only`-Tabelle als Alternative. Eine Bibliothek müsste an jeder
   dieser Stellen überschrieben werden und brächte Bundle und ein zweites
   Rendering-Modell mit. **Jeder Balken ist ein fokussierbares interaktives
   Element** (Button), kein reines `<rect>`.
5. **Aggregation im Client über genau eine Bereichsabfrage je Periode.**
   `stats.service.ts` lädt die sichtbare Periode mit **einer** PostgREST-
   Abfrage auf `entries` (`gte`/`lte` auf `date`, eingebetteter `foods`-Teil)
   in einer **schlanken Projektion**: `date, amount_g, foods(kcal_100g,
   protein_100g, carbs_100g, fat_100g)` — ohne `id`, `name`, `meal_type`,
   `created_at`, denn der Verlauf zeigt keine Einzeleinträge. Die Zielzeile
   kommt als zweite `maybeSingle`-Abfrage. Kein View, keine RPC, keine
   berechnete Spalte, **keine Migration** (ADR-0004 Punkt 2, ADR-0006
   Punkt 3); der vorhandene Index `entries_user_id_date_idx` deckt den
   Bereichsfilter, kein `user_id`-Filter im Client (RLS).
   Die Bucket-Bildung je Kalendertag, die Periodengrenzen (Woche Mo–So,
   Monat), der Anker-Tag-Erhalt beim Umschalten, die drei Tageszustände und
   der Durchschnitt liegen als reine Funktionen in `stats.calculations.ts`.
   Für die Mengenumrechnung wird `computeLiveNutrition()` aus
   `core/foods.calculations.ts` benutzt — die Formel `amount_g / 100 × Wert
   je 100 g` wird in `stats` **nicht** erneut geschrieben.
6. **Ziele bleiben unhistorisiert und werden pro Periode einmal gelesen.**
   Das aktuell gesetzte Ziel gilt für den ganzen dargestellten Zeitraum
   (Paket-Constraint); „kein Ziel gesetzt" ist weiterhin „keine Zeile **oder**
   Wert `<= 0`" (ADR-0006 Punkt 4, ADR-0007). `stats.service.ts` liest die
   Zeile mit derselben einzeiligen Abfrage wie `diary.service.ts` — eine
   bewusste zweite Lesestelle, siehe Konsequenzen.
7. **Zweiter Nutzer erreicht: drei Bausteine wandern nach `core/`/`shared/`**
   (löst die in ADR-0006 angekündigte Auslagerung ein, Zwei-Nutzer-Regel
   ADR-0005):
   - `computeProgress()` und `ProgressResult` → `core/progress.calculations.ts`
     (wertet `GOAL_OVERSHOOT_TOLERANCE` aus `core/nutrition.constants.ts`
     aus). Kein Re-Export aus `diary` — `diary` importiert ab jetzt aus
     `core/`.
   - `MacroBarComponent` → `src/app/shared/ui/macro-bar/`, Verhalten und
     API (`label`, `macro`, `progress`) **unverändert**; `diary` und `stats`
     importieren von dort. Der Verlauf nutzt sie mit gemitteltem Ist-Wert,
     ohne sie zu erweitern.
   - Kalendertag-Arithmetik und -Beschriftung (`todayKey`, `addDaysToKey`,
     `diffInDays`, `maxForwardKey`, `formatDateLabel`, `MAX_FORWARD_DAYS`,
     `DateLabel`/`DateLabelKind`) → `core/date.calculations.ts`. In
     `diary.calculations.ts` bleibt, was nur `diary` auswertet
     (`suggestedMealTypeForHour`, `computeDayTotals`, `computeMealSections`).
   Diese Verschiebungen sind reine Umzüge **ohne Verhaltensänderung**; die
   bestehenden Tests ziehen mit um, es entsteht keine zweite Definition.
8. **Vorwärtsgrenze der Periodennavigation ist dieselbe wie in der
   Tagesansicht.** Die nächste Periode ist erreichbar, solange sie
   mindestens einen Tag `<= heute + MAX_FORWARD_DAYS` enthält; sonst ist der
   Vorwärts-Chevron deaktiviert dargestellt (nicht entfernt). `heute + 7`
   steht weiterhin nur an **einer** Stelle (`MAX_FORWARD_DAYS`, ab jetzt in
   `core/date.calculations.ts`).

## Konsequenzen

- Positiv: Navigations-Chrome ist an der Routen-Topologie festgemacht statt
  an URL-Vergleichen; eine künftige Ansicht hinter dem Login bekommt die
  Navigation allein dadurch, dass sie Kind der Layout-Route ist. Der
  `authGuard` steht nur noch an einer Stelle.
- Positiv: Der Verlauf kostet zwei Abfragen je Periode, keine Migration und
  kein zusätzliches Paket im Bundle. Die Grenzfälle (Lücke vs. Zukunft,
  Nenner des Durchschnitts, Anker-Tag beim Umschalten) sind ohne
  Angular-Kontext testbar.
- Negativ/Trade-off: Die vier Routen wandern in einen `children`-Block; alle
  Tests und `routerLink`-Ziele müssen als **absolute** Pfade (`/tagebuch`,
  `/verlauf`) geprüft werden — eine pfadlose Elternroute ändert die URLs
  nicht, aber relative Navigationen innerhalb der Features verschieben ihre
  Basis um eine Ebene.
- Negativ/Trade-off: Die Zielzeile wird jetzt an zwei Stellen gelesen
  (`diary.service.ts`, `stats.service.ts`) — vier Spalten und dieselbe
  snake→camel-Abbildung doppelt. Bewusst in Kauf genommen, weil die
  eigentlich riskante Logik (`<= 0` heißt „kein Ziel") mit
  `core/progress.calculations.ts` genau **einmal** existiert und ein Umzug
  des Lesepfads nach `core/goals.service.ts` ein abgeschlossenes Feature
  (`diary`) ohne fachlichen Gewinn anfassen würde. Beim **dritten** Leser
  wird umgezogen (Muster wie `core/meals.service.ts`); die Doppelung steht
  dafür in `code-conventions.md` unter „Abweichungen".
- Negativ/Trade-off: Das Chart ist handgeschrieben. Eine spätere, deutlich
  anspruchsvollere Visualisierung müsste diese Entscheidung neu prüfen —
  Paket 015 (Liniendiagramm Gewichtslog) ist der nächste Anlass und bleibt
  mit demselben Ansatz machbar.
- Betrifft künftig: Jede neue Ansicht hinter dem Login ist Kind der
  Layout-Route. Jedes weitere Diagramm folgt Punkt 4 (eigene SVG/CSS-
  Komponente, fokussierbare Datenpunkte, `sr-only`-Alternative). Eine
  Serverseiten-Aggregation oder eine Historisierung von `goals` bräuchte
  weiterhin ein ablösendes ADR (ADR-0004/0006/0007).

## Alternativen (kurz)

- **Bottom-Navigation direkt in `app.html`, Sichtbarkeit über die aktive
  URL** — verworfen: `app.html` rendert auch den Login; die Regel „wo ist
  die Navigation sichtbar" läge dann als String-Vergleich in der
  Root-Komponente und müsste bei jeder neuen Route nachgezogen werden.
- **Navigation je Feature-Shell einbinden** — verworfen: vier Stellen, die
  auseinanderlaufen, und jede neue Ansicht vergisst sie.
- **`ziele`/`mahlzeiten` als dritter/vierter Tab oder Mehr-Menü** — verworfen:
  `design-conventions.md` legt zwei Tabs fest und verweist für „Ziele"
  ausdrücklich auf den bestehenden Icon-Einstieg.
- **Chart-Bibliothek (ngx-charts, Chart.js o. ä.)** — verworfen: Bundle und
  zweites Rendering-Modell für ein Chart, dessen Zustände, Zielinie,
  Tooltip-Positionierung und Barrierefreiheit ohnehin vollständig
  eigendefiniert sind; „Chart-Bibliothek schlank halten" aus den
  Paket-Constraints wird damit als „gar keine" gelesen.
- **Aggregation als Postgres-View/RPC (`daily_totals`)** — verworfen:
  widerspricht ADR-0004 Punkt 2 und ADR-0006 Punkt 3, macht jede
  Anzeigeänderung zur Migration und die Grenzfälle schlechter testbar. Bei
  zwei Nutzern und ≤ 31 Tagen je Abfrage gibt es kein Mengenproblem.
- **Pro Tag eine Abfrage (Wiederverwendung von `diary.service.loadDay`)** —
  verworfen: bis zu 31 Roundtrips je Periode und ein Feature-zu-Feature-
  Zugriff, den die Konventionen ausschließen.
- **`MacroBarComponent` in `diary` lassen und in `stats` nachbauen** —
  verworfen: zwei Implementierungen derselben 105-%-Darstellung; genau der
  Fall, für den die Zwei-Nutzer-Regel existiert.
