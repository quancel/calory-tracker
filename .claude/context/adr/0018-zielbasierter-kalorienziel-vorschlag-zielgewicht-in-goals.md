# ADR-0018: Zielbasierter Kalorienziel-Vorschlag und Zielgewicht in `goals` — trendkorrigierte Zielrate mit Wochen-Obergrenzen, `goals.target_weight_kg` nullable (löst ADR-0017 ab)

- **Status**: accepted (löst ADR-0017 ab — siehe Punkt 0: ersetzt wird
  ausschließlich dessen Punkt 3, alle übrigen Punkte werden wörtlich
  fortgeschrieben)
- **Datum**: 2026-09-22
- **Bounded Context(s)**: `goals`, `data-platform` (wirkt auf `diary` nur
  lesend: die Zielzeile bekommt eine Spalte dazu)
- **task_id**: `PO-2026-09-20-015`

## Kontext

Paket 015 war mit ADR-0017 eingeordnet und noch **nicht** umgesetzt (weder
`goals/weight.*` noch eine `weight_logs`-Migration existieren im Repo). In
diesem Zustand hat der `product-owner` das Paket um ein **Zielgewicht**
erweitert: Der Vorschlag soll nicht mehr den Erhaltungsbedarf anzeigen,
sondern den Kalorienwert, der zum gesetzten Zielgewicht führt. Der
`ux-ui-designer` hat `design-conventions.md` entsprechend ergänzt
(Zielgewicht-Feldblock als erstes Element des Gewichtslog-Abschnitts,
Zustands-Priorität der Vorschlagskarte, „Halten"-Zustand).

Damit sind vier Fragen offen, die ADR-0017 nicht beantwortet:

1. **Die Formel.** ADR-0017 Punkt 3 rechnet `avgIntake − trendKcalPerDay`
   (Erhaltungsbedarf). Eine zielbasierte Regel braucht eine Zielrate, eine
   Vorzeichenkonvention und eine Obergrenze pro Woche — und die Herleitung
   muss festlegen, **worauf** die kcal-Differenz aufgeschlagen wird. Naiv
   auf die Ist-Zufuhr aufgeschlagen zählt sie den bereits laufenden Trend
   doppelt (siehe Punkt 3, „Vorzeichen- und Basisprobe").
2. **Wo lebt das Zielgewicht?** Es ist ein Zielwert (`goals`), wird aber im
   Gewichtslog-Abschnitt gerendert und vom Vorschlag gelesen.
3. **Nullable oder `0 = nicht gesetzt`?** ADR-0007 Punkt 1 hat für die vier
   Wertspalten ausdrücklich `not null default 0` festgelegt und `<= 0` als
   „kein Ziel gesetzt" definiert. Für ein Gewicht ist das nicht übertragbar.
4. **Migrationsschnitt.** `weight_logs` ist noch nicht eingespielt — eine
   gemeinsame oder zwei getrennte Migrationen?

Alle vier sind teuer umkehrbar: Punkt 1 ist die Zahl, die dem Nutzer als
Empfehlung angezeigt und per „Übernehmen" in sein Kalorienziel geschrieben
wird; Punkte 2–4 legen Schema und Schreibweg fest.

## Entscheidung

0. **Verhältnis zu ADR-0017.** Ersetzt wird **ausschließlich Punkt 3
   (Rechenregel)**. Die Punkte 1, 2, 4, 5, 6, 7, 8 und 9 aus ADR-0017 gelten
   unverändert fort — Punkt 2 (`weight_logs`) wird durch Punkt 5 unten nur
   um eine **zweite** Migration ergänzt, die Tabellendefinition selbst bleibt
   wörtlich. Die Verweise auf ADR-0017 in `context-map.md` und
   `code-conventions.md` bleiben damit gültig; nur wo die Rechenregel
   gemeint ist, gilt dieses ADR. ADR-0017 trägt `superseded by ADR-0018`,
   weil das Vokabular des Index keine Teil-Ablösung kennt — nicht, weil
   seine übrigen Festlegungen aufgehoben wären.

1. **Zielgewicht als nullable Spalte `goals.target_weight_kg`** — nicht in
   `weight_logs` und nicht in einer eigenen Tabelle. Es ist ein **Ziel**
   (genau einer je Nutzer, nicht historisiert, ohne Datumsbezug) und gehört
   damit in dieselbe Zeile wie die vier bestehenden Zielwerte.
   `weight_logs` bleibt die reine Messreihe; eine Zielspalte dort wäre je
   Messtag wiederholt und sofort widersprüchlich.

2. **`null` statt `0` als „nicht gesetzt" — bewusste Abweichung von
   ADR-0007 Punkt 1.** Die Spalte ist `numeric null`, ohne Default.
   Begründung: Bei kcal/Makros ist `0` ein Wert **innerhalb** des zulässigen
   Bereichs (`>= 0`) und trägt die Bedeutung „kein Ziel"; bei einem Gewicht
   liegt `0` außerhalb jedes sinnvollen Bereichs (20–400 kg) und wäre mit
   dem `check`-Constraint nur über eine Ausnahme (`= 0 or between 20 and
   400`) einfügbar — eine zweite Sonderbedeutung für einen physikalisch
   unmöglichen Wert. `null` sagt dasselbe ohne Trick und entspricht dem, was
   das Design verlangt („ein leeres Feld ist gültig; das Leeren entfernt den
   gespeicherten Zielwert"). Die Abweichung gilt **nur** für diese Spalte und
   ist kein Präzedenzfall für die vier bestehenden.
   `check`-Constraint entsprechend null-tolerant:
   `target_weight_kg is null or (target_weight_kg >= 20 and
   target_weight_kg <= 400 and target_weight_kg = round(target_weight_kg,
   1))` — derselbe Wertebereich und dieselbe Nachkommastellen-Regel wie
   `weight_logs.weight_kg` (ADR-0017 Punkt 2), erneut als bewusste Doppelung
   zur Client-Validierung.

3. **Die Rechenregel — zielbasiert, trendkorrigiert, mit Wochen-Obergrenze.**
   Alle Konstanten liegen **einmal** in `goals/weight.calculations.ts`
   (ADR-0017 Punkt 3 gilt hier fort), die Herleitung als Modulkommentar
   dort und als Abschnitt „Kalorienziel-Vorschlag" in `README.md`.

   **Eingangsgrößen** (Fenster, Mindestdatenlage, Regression und Ist-Zufuhr
   **unverändert** aus ADR-0017 Punkt 3):
   - `slopeKgPerDay` — lineare Regression (Least Squares) von `weight_kg`
     über den Tagesabstand, Fenster `WEIGHT_TREND_WINDOW_DAYS = 28`.
   - `avgIntakeKcal` — Mittelwert der Tages-kcal über die Tage **mit**
     Einträgen im Fenster (Nenner = erfasste Tage, nicht 28).
   - `currentWeightKg` — `weight_kg` der **jüngsten Messung überhaupt**
     (nach der Mindestdatenlage höchstens 28 Tage alt). Bewusst der
     Messwert, nicht der auf heute fortgeschriebene Regressionswert: Das
     Design definiert den „Halten"-Zustand über „das aktuelle (letzte
     gemessene) Gewicht" — Kartentext und Formel müssen dieselbe Zahl
     benutzen, sonst zeigt die Karte „stabil" und rechnet trotzdem ein
     Defizit.
   - `targetWeightKg` — `goals.target_weight_kg`. **Pflicht für einen
     Vorschlag**: ist die Spalte `null`, wird gar nicht gerechnet (Punkt 4).
   - Mindestdatenlage unverändert: ≥ 3 Messungen im Fenster · Spanne
     ältester↔jüngster Messwert im Fenster ≥ 14 Tage · jüngste Messung ≤ 28
     Tage alt · ≥ 14 Tage mit mindestens einem `entries`-Datensatz im Fenster
     (`MIN_INTAKE_DAYS = 14`).

   **Schritt 1 — Erhaltungsbedarf (Basis).**
   `maintenanceKcal = avgIntakeKcal − slopeKgPerDay × KCAL_PER_KG_BODY_WEIGHT`
   mit `KCAL_PER_KG_BODY_WEIGHT = 7700`. Das ist exakt der Wert, den
   ADR-0017 angezeigt hat; er ist jetzt **Zwischenergebnis** statt Ergebnis.

   **Schritt 2 — Zielrate.** `delta = targetWeightKg − currentWeightKg`.
   - `|delta| <= GOAL_WEIGHT_TOLERANCE_KG (0,5)` →
     `targetRateKgPerDay = 0` (**Halten-Fall**, Punkt 4).
   - `delta < 0` (Ziel liegt unter dem Ist-Gewicht, also Abnahme) →
     `targetRateKgPerDay = −min(MAX_WEEKLY_LOSS_KG (0,5), |delta|) / 7`
   - `delta > 0` (Ziel liegt über dem Ist-Gewicht, also Zunahme) →
     `targetRateKgPerDay = +min(MAX_WEEKLY_GAIN_KG (0,25), |delta|) / 7`

   Das Vorzeichen der Zielrate ist das Vorzeichen von `delta` — die Rate ist
   eine **Gewichtsänderung pro Tag**, keine Energiegröße; die Umdrehung ins
   Kalorische passiert nirgends noch einmal. Die Asymmetrie der beiden
   Obergrenzen (0,5 kg Abnahme gegen 0,25 kg Zunahme pro Woche) ist eine
   Nutzerfestlegung, keine Ableitung. Das `min(…, |delta|)` ist ein formaler
   Schutz gegen ein Überschießen der Restdistanz; bei
   `GOAL_WEIGHT_TOLERANCE_KG >= MAX_WEEKLY_LOSS_KG` greift es nie, es bleibt
   aber stehen, damit ein späteres Absenken der Toleranz die Formel nicht
   still falsch macht.

   **Schritt 3 — Vorschlag.**
   `rawKcal = maintenanceKcal + targetRateKgPerDay × KCAL_PER_KG_BODY_WEIGHT`
   `suggestedKcal = Math.round(rawKcal / 10) × 10` (volle 10 kcal, wie
   bisher).

   Zusammengezogen: `suggestedKcal ≈ avgIntakeKcal − (slopeKgPerDay −
   targetRateKgPerDay) × 7700`. Korrigiert wird also die **Differenz
   zwischen beobachtetem und gewünschtem Trend** — nicht der gewünschte
   Trend allein.

   **Schritt 4 — Plausibilitätsgrenze (unverändert, harte Grenze).** Liegt
   `suggestedKcal` außerhalb `1200 … 6000 kcal`, wird **kein** Vorschlag
   gezeigt, sondern derselbe neutrale Hinweistext wie bei zu dünner
   Datenlage. Die Grenze gilt auch im Halten-Fall.

   **Vorzeichen- und Basisprobe** (gehört als Testtabelle in
   `weight.calculations.spec.ts`; `avgIntakeKcal = 2400`):

   | Fall | `slopeKgPerDay` | `delta` | `maintenanceKcal` | `suggestedKcal` | Erwartung |
   |---|---|---|---|---|---|
   | Ziel unter Ist, Gewicht stabil | `0` | `−5` | 2400 | **1850** | Defizit, Vorschlag < Ist-Zufuhr |
   | Ziel über Ist, Gewicht stabil | `0` | `+5` | 2400 | **2680** | Überschuss, Vorschlag > Ist-Zufuhr |
   | Ziel unter Ist, nimmt bereits 0,5 kg/Woche ab | `−0,0714` | `−5` | 2950 | **2400** | „weiter so" — Vorschlag = Ist-Zufuhr |
   | Ziel unter Ist, nimmt 0,5 kg/Woche zu | `+0,0714` | `−5` | 1850 | **1300** | doppelte Korrektur, zurecht |
   | Ziel erreicht (±0,5 kg) | `0` | `−0,3` | 2400 | **2400** | Halten = Erhaltungsbedarf |

   Zeile 3 ist der Grund für die Trendkorrektur: Ohne sie (Differenz direkt
   auf `avgIntakeKcal`) bekäme ein Nutzer, der sein Ziel bereits im
   gewünschten Tempo verfolgt, jedes Mal **weitere** 550 kcal abgezogen —
   der Vorschlag würde sich mit jeder Übernahme nach unten aufschaukeln und
   irgendwann an der 1200er-Grenze verstummen. Die Basis ist deshalb der
   Erhaltungsbedarf, nicht die Ist-Zufuhr.

4. **Zustands-Priorität — die Rechenregel liefert einen Summentyp, keine
   Zahl mit Sonderwerten.** `computeCalorieSuggestion(...)` gibt genau eine
   der vier Ausprägungen zurück, in dieser Prüfreihenfolge (deckungsgleich
   mit `design-conventions.md`, „Zustands-Priorität der Vorschlagskarte"):
   `'no-entries'` (keine Gewichtseinträge — ersetzt Diagramm **und** Karte)
   → `'no-target'` (`target_weight_kg is null`; **vor** der
   Datenlagenprüfung, unabhängig von der Messpunktzahl) → `'insufficient'`
   (Mindestdatenlage nicht erfüllt **oder** Plausibilitätsgrenze verletzt)
   → `{ kind: 'suggestion', kcal, holding: boolean }`. `holding: true` ist
   der Halten-Fall aus Punkt 3 Schritt 2; er ändert **nur den Kartentext**,
   nicht die Aktionen — „Übernehmen"/„Verwerfen" bleiben unverändert
   vorhanden. Die Komponente trifft keine dieser Fallunterscheidungen selbst
   und rechnet nichts nach.

5. **Zwei getrennte additive Migrationen in diesem Paket**, nicht eine
   gemeinsame: `<ts>_weight_logs.sql` (Tabelle + RLS + Constraints, wörtlich
   nach ADR-0017 Punkt 2) und `<ts>_goals_target_weight_kg.sql` (Spalte +
   `check`). Beide sind noch nicht eingespielt, eine gemeinsame Datei wäre
   also zulässig — getrennt, weil sie zwei verschiedene Tabellen betreffen
   und die Zielspalte damit einzeln nachvollziehbar (und bei Bedarf einzeln
   zurückgenommen) bleibt. Reihenfolge über die Zeitstempel; eine
   Abhängigkeit zwischen beiden besteht nicht.

6. **Das Zielgewicht ist ein fünftes Feld im feldweisen Speichern von
   `GoalsStore`, kein Zustand des `WeightStore`.** `goals.service.ts` bleibt
   der einzige Schreibweg auf `goals` (ADR-0007 Punkt 3); `WeightStore`
   **liest** den Zielwert aus dem bereits injizierten `GoalsStore`
   (ADR-0017 Punkt 5) und schreibt ihn nie. Damit gibt es weiterhin genau
   einen Schreibweg und genau eine Ladestelle der Zielzeile im Feature.
   Trennung von Datenhaltung und Darstellung: `GOAL_FIELD_ORDER` bleibt die
   **Anzeigereihenfolge der vier** kcal-/Makro-Feldblöcke oben in der
   Ansicht; die Menge aller Feldschlüssel (die der Store-Record und `load()`
   durchlaufen) wird zu einer eigenen Konstante. Das Zielgewicht wird vom
   Design ausdrücklich **nicht** dort, sondern als erstes Element des
   Gewichtslog-Abschnitts gerendert — mit derselben
   `GoalFieldComponent`, aber außerhalb der `@for`-Schleife.

## Konsequenzen

- Positiv: Der Vorschlag ist jetzt eine Antwort auf eine Nutzerabsicht
  („ich will auf X kg") statt einer Beobachtung. Der Kartentext bleibt
  trotzdem beobachtend, und die Obergrenzen verhindern, dass die App bei
  einem weit entfernten Ziel ein extremes Defizit vorschlägt.
- Positiv: Der Halten-Fall ist kein Sonderweg, sondern `targetRate = 0` —
  derselbe Rechenweg, ein Zweig weniger. Der angezeigte Wert ist exakt der
  Erhaltungsbedarf aus ADR-0017.
- Positiv: Kein neuer Schreibweg, keine neue Tabelle, kein neuer Store, kein
  neuer Bounded Context. Die Erweiterung kostet eine nullable Spalte und
  einen Feldblock.
- Negativ/Trade-off: Ohne Zielgewicht zeigt die App **gar keinen** Wert mehr
  — der Erhaltungsbedarf, den ADR-0017 auch ohne Ziel angezeigt hätte,
  verschwindet hinter dem „Setze ein Zielgewicht"-Hinweis. Bewusst so
  festgelegt (Nutzerentscheidung): Zwei verschiedene Zahlen in derselben
  Karte, je nachdem ob ein Ziel gesetzt ist, wären schwerer erklärbar als
  eine Voraussetzung.
- Negativ/Trade-off: `goals` hat ab jetzt eine Spalte mit
  `null`-Semantik neben vier Spalten mit `0`-Semantik. Wer die Zeile liest,
  muss beide Konventionen kennen; der Verweis steht in `code-conventions.md`
  unter „Abweichungen".
- Negativ/Trade-off: Die Regel hängt weiterhin an der Erfassungsdisziplin
  (ADR-0017) — und jetzt zusätzlich an einem realistisch gesetzten
  Zielgewicht. Ein Zielwert von 45 kg bei 90 kg erzeugt monatelang denselben
  maximalen Defizitvorschlag. Abgefedert nur durch die Wochen-Obergrenze und
  die 1200er-Untergrenze; nicht beseitigt.
- Betrifft künftig: Ein Zieldatum („bis wann") würde die Zielrate aus
  Restdistanz/Restzeit statt aus der festen Obergrenze bestimmen. Das ist
  eine Formeländerung an genau einer Stelle (`weight.calculations.ts`), aber
  ein neues Feld und ein ablösendes ADR.

## Alternativen (kurz)

- **kcal-Differenz direkt auf die Ist-Zufuhr** (`avgIntake − Zielrate ×
  7700`, ohne Trendkorrektur) — verworfen: zählt den bereits laufenden Trend
  doppelt und schaukelt sich bei wiederholter Übernahme nach unten auf
  (Zeile 3 der Probe in Punkt 3). Die Variante ist einfacher zu erklären,
  aber im häufigsten Fall — der Nutzer verfolgt sein Ziel bereits — falsch.
- **Zielrate aus Restdistanz gleichmäßig verteilt** (Ziel in N Wochen) —
  verworfen: braucht ein Zieldatum, das das Paket nicht vorsieht. Ohne
  Datum ist jede „angemessene Verteilung" eine verdeckte Erfindung.
- **`currentWeightKg` als Regressionswert für heute statt letzter Messung** —
  verworfen: statistisch sauberer, aber dann weicht die Zahl, die den
  ±0,5-kg-Halten-Zustand auslöst, von der ab, die der Nutzer im Diagramm
  und im Feld sieht.
- **Zielgewicht in `weight_logs`** — verworfen: je Messtag wiederholt,
  sofort widersprüchlich, und ein Zielwert ohne Messung wäre nicht
  speicherbar.
- **`target_weight_kg numeric not null default 0`** (analog ADR-0007) —
  verworfen: `0` ist für ein Gewicht kein zulässiger Wert; der
  `check`-Constraint bräuchte eine Ausnahme für genau diesen einen
  physikalisch unmöglichen Wert.
- **Eigener Store/Schreibweg für das Zielgewicht im `WeightStore`** —
  verworfen: zweiter Schreibweg auf `goals`, verstößt gegen ADR-0007
  Punkt 3, ohne einen einzigen Vorteil gegenüber dem bestehenden feldweisen
  Speichern.
