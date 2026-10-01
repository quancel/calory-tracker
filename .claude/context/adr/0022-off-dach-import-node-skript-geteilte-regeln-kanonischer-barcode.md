# ADR-0022: DACH-Import aus dem OFF-Bulk-Export — Node-Skript unter `scripts/off-import/` ohne Laufzeit-Abhängigkeit, geteilte reine Regeln aus `src/app`, kanonische Barcode-Form für Import **und** Scan, Chargen als reine DML

- **Status**: accepted (Punkt 7 — erzeugte Chargen nicht committet — steht unter Vorbehalt der Nutzerfrage aus `PO-2026-09-30-002`; Ergänzung zu ADR-0010 Punkt 4, siehe „Verhältnis zu bestehenden ADRs")
- **Datum**: 2026-10-01
- **Bounded Context(s)**: `data-platform` (wirkt auf `food-catalog`)
- **task_id**: `PO-2026-09-30-002` (Teilpakete `-be` Skript/Regeln/README, `-fe` Scan-Lookup)

## Kontext

`foods` soll einmalig mit ~250–300k DACH-Produkten aus Open Food Facts befüllt
werden (Spalte `off_popularity` und Rang aus ADR-0020, Fingerabdruck aus
ADR-0021). Das Repo ist ein Angular-Projekt ohne Node-Werkzeuge außerhalb von
`ng`; `@types/node` ist nicht installiert, `scripts/` existiert nicht. Die
Regeln, nach denen ein OFF-Produkt übernommen wird (kJ→kcal, nur `_100g`-Werte,
Vollständigkeit, Plausibilität), existieren bereits als reine Funktionen in
`src/app/food-search/food-search.calculations.ts` (`normalizeOffProduct`,
`isOffProductComplete`, ADR-0010 Punkt 3) und `src/app/core/foods.calculations.ts`
(`findPlausibilityFindings`, Schwellen in `core/nutrition.constants.ts`,
ADR-0011/ADR-0012). Diese Dateien importieren untereinander **ohne**
Dateiendung (Bundler-Auflösung).

Belegter Ist-Stand Barcode (2026-10-01): Der Scan übergibt den Rohwert des
Detektors unverändert an `findByBarcode()` (`.eq('barcode', code)`) und
speichert ihn so. Der zxing-Fallback läuft ohne Format-Hinweise
(`BrowserMultiFormatReader()`), der native Detektor mit `upc_a` in der
Formatliste — ein EAN-13 mit führender Null kann damit je nach Engine als
13- **oder** 12-stelliger Code ankommen. Ein Import, der nur „den OFF-Code"
schreibt, kann deshalb nicht zusichern, dass ein Scan ihn findet.

## Entscheidung

1. **Ort und Sprache.** Das Werkzeug liegt unter `scripts/off-import/` und ist
   TypeScript, ausgeführt mit **Node 22 (`.nvmrc`) ohne Transpiler**: native
   Type-Stripping-Ausführung plus ein ~15-zeiliger Resolve-Hook
   (`module.registerHooks`, eingebunden per `node --import`), der **nur**
   relative Spezifizierer ohne Endung auf `.ts` ergänzt — damit laufen die
   bestehenden `src/app`-Dateien unverändert mit. Keine Laufzeit-Abhängigkeit,
   kein `tsx`/`ts-node`/`esbuild`-Aufruf, keine Parquet-Bibliothek.
   Einzige Paketänderung: `@types/node` (Major 22) als **devDependency**, nur
   für die Typprüfung des Skripts. Sie leckt nicht in die App:
   `tsconfig.app.json` (`types: []`) und `tsconfig.spec.json` (`types:
   ["vitest/globals"]`) listen Typen explizit.
2. **Eingabeformat: JSONL-Export (`openfoodfacts-products.jsonl.gz`),
   gestreamt** über `node:fs` → `node:zlib` (`createGunzip`) →
   `node:readline`. Kein Entpacken auf die Platte. Parquet ist verworfen
   (bräuchte eine Bibliothek), der CSV-Export ebenfalls (führt keinen
   sprachspezifischen Produktnamen). Vor `JSON.parse` darf eine Zeile per
   Substring-Vorfilter (`en:germany`/`en:austria`/`en:switzerland`)
   übersprungen werden; maßgeblich bleibt danach `countries_tags`.
3. **Geteilte Regeln — importiert, nie kopiert.** Das Skript importiert
   `normalizeOffProduct`/`isOffProductComplete` und
   `findPlausibilityFindings` aus ihren bestehenden Dateien. Ein Skript unter
   `scripts/` darf **reine** `*.calculations.ts`/`*.constants.ts` aus
   `src/app` importieren (egal ob Feature oder `core/`), nie Dienste, Stores,
   Komponenten oder etwas mit Angular-/Supabase-Laufzeitimport. Die
   Zwei-Nutzer-Regel (ADR-0005) zählt Features der App; ein Werkzeug ist kein
   zweiter Nutzer, der einen Umzug nach `core/` auslöst. Ändert sich eine
   dieser Regeln, wirkt das auf Scan und nächsten Import gleichzeitig — das
   ist der Zweck.
   Das Skript liefert an `normalizeOffProduct` nur **endliche Zahlen** oder
   `undefined` (OFF-JSONL enthält Werte auch als Zeichenkette; nicht-numerisch
   = fehlend, nie 0). Ein negativer Rohwert, den die Normalisierung verwenden
   würde, wird **vor** der Normalisierung als „unplausibel" klassifiziert —
   die geteilte Funktion bildet ihn sonst auf `null` ab, und er erschiene als
   „fehlender Nährwert".
4. **Kanonische Barcode-Form, eine Funktion für Import und Scan.**
   `normalizeBarcode(raw: string): string | null` in
   `src/app/food-search/food-search.calculations.ts`: trimmen; nur Ziffern,
   sonst `null`; führende Nullen entfernen; leer → `null`; Länge ≤ 8 → links
   mit `0` auf 8 auffüllen; Länge 9–13 → auf 13 auffüllen; ≥ 14 unverändert.
   (GS1-Lesart: dieselbe GTIN in 8/12/13/14 Stellen ergibt dieselbe Form.)
   Dazu `barcodeLookupKeys(raw: string): string[]` — eindeutige, geordnete
   Liste aus kanonischer Form, bei 13-stelliger Form mit führender `0`
   zusätzlich der 12-stelligen UPC-A-Form, und dem getrimmten Rohwert. Der
   Import schreibt **nur** die kanonische Form; ein Produkt ohne kanonische
   Form zählt als „kein Barcode". Der Scan sucht über alle Schlüssel (findet
   damit auch vor dieser Entscheidung gespeicherte Rohwerte) und speichert
   neue Foods mit der kanonischen Form.
5. **Chargen-Dateien sind reine DML auf `public.foods`.** Je Datei: Kopfzeilen-
   Kommentar (Quelle Open Food Facts, ODbL, Charge i/N, Zeilenzahl,
   Voraussetzung Migration `20260930090000`), `begin;`, `set local
   statement_timeout`, **ein** Statement `with v(…) as (values …), ins as
   (insert … select … from v where not exists (select 1 from public.foods f
   where f.barcode = any(<Lookup-Schlüssel der Zeile>)) on conflict (barcode)
   do nothing returning barcode) update public.foods f set off_popularity =
   v.off_popularity from v where f.barcode = any(<Schlüssel>) and
   f.off_popularity <> v.off_popularity`, `commit;`. Kein `create`, `drop`,
   `alter`, `truncate`, kein Index-Abbau (ADR-0020 Konsequenzen). Damit gilt:
   bestehendes Food (auch mit Barcode in Altform) bleibt bis auf
   `off_popularity` unberührt (ADR-0011 Punkt 7, ADR-0020 Punkt 2);
   Doppeleinspielen ändert nichts; ohne Migration 001 bricht die Charge mit
   Fehler ab und schreibt nichts.
6. **Ausgabe deterministisch, beliebteste zuerst.** Nach dem Lesen wird je
   kanonischem Barcode genau ein Produkt behalten (höheres `unique_scans_n`,
   bei Gleichstand das zuerst gelesene); sortiert nach `off_popularity` desc,
   Barcode asc; aufgeteilt in Chargen fester Zeilenzahl. Gleiche Eingabe ⇒
   byte-gleiche Dateien (kein Zeitstempel im Inhalt). Die ersten Chargen
   tragen damit den Top-Bestand aus ADR-0021.
7. **Erzeugte Chargen werden nicht committet** (unter Vorbehalt, siehe
   Status): Ausgabeort `supabase/data/off-dach/`, per `.gitignore`
   ausgeschlossen; committet werden Skript, Tests und README-Anleitung.
   Gründe: ~30–60 MB SQL je OFF-Stand wachsen bei jeder Neuerzeugung
   dauerhaft in die Git-Historie; eine öffentlich veröffentlichte, abgeleitete
   OFF-Datenbank fällt unter die Share-Alike-Pflichten der ODbL. Die
   Chargengröße bleibt trotzdem so gewählt, dass jede Datei weit unter dem
   GitHub-Grenzwert liegt — ein späteres Committen braucht nur die
   `.gitignore`-Zeile zu entfernen.

## Verhältnis zu bestehenden ADRs

- **ADR-0010 Punkt 4** (Barcode-Lookup an der Datenbank): gilt fort, ergänzt
  um Punkt 4 dieses ADR — gesucht wird über `barcodeLookupKeys`, nicht mehr
  per `.eq` auf den Rohwert.
- **ADR-0010 Punkt 3 / ADR-0011 / ADR-0012 Punkt 2**: Regeln und Orte
  unverändert; neu ist nur der zusätzliche Verbraucher außerhalb der App.
  Abweichung in der **Anwendung** (nicht in der Regel): Der Scan speichert
  ein unplausibles, vollständiges Produkt (ADR-0011 Punkt 5, markiert statt
  blockiert); der Import verwirft es (Produktentscheidung `PO-2026-09-30-002`).
- **ADR-0020 Punkt 2** und **ADR-0021 Punkt 4**: umgesetzt durch Punkt 5/6
  (echte `unique_scans_n`, fehlend → 0, Aktualisierung auch bei
  `is_corrected`).
- ADR-0004 (Migrations-Workflow) unberührt: Chargen sind keine Migrationen.

## Konsequenzen

- Positiv: keine zweite Fassung von kJ→kcal, Vollständigkeit oder
  Plausibilität; Scan und Import finden dasselbe Food; das Skript läuft
  offline ohne Zugangsdaten; Wiederholbarkeit ohne Sonderfall.
- Negativ/Trade-off: Die Ausführung hängt an Node ≥ 22.18 (Type Stripping
  ohne Flag, `module.registerHooks`) — `.nvmrc` pinnt 22.23.1. Das Skript
  erbt die Syntaxgrenze des Type Strippings (nur löschbare TS-Syntax) für
  **jede** Datei in seinem Laufzeit-Importgraphen; wer dort ein `enum` oder
  eine Parameter-Property einführt, bricht den Import, nicht die App.
  Produkte mit Alkohol/Polyolen weichen typisch > 10 % von Atwater ab und
  fallen heraus. Ein Altbestand mit Rohwert-Barcode bleibt in dieser Form
  stehen (kein Umschreiben bestehender Zeilen).
- Betrifft künftig: Jedes weitere Werkzeug unter `scripts/` folgt Punkt 1/3
  (`code-conventions.md` „Werkzeuge"). Jeder neue Schreibweg mit Barcode
  benutzt `normalizeBarcode`. Ein erneuter Import (neuer OFF-Stand) ist
  derselbe Lauf.

## Alternativen (kurz)

- **Python-Skript** — verworfen: zweite Sprache/Laufzeit im Repo, und die
  Regeln müssten nachgebaut werden (Duplikat).
- **Parquet-Export** — verworfen: braucht eine Bibliothek (Laufzeit-
  Abhängigkeit) ohne Gewinn gegenüber gestreamtem JSONL.
- **`tsx`/`esbuild` als Runner** — verworfen: neues Paket bzw. Abhängigkeit
  von einer nur transitiv vorhandenen Bibliothek.
- **Regeln ins Skript kopieren** — verworfen: zwei Regeln, die driften.
- **Barcode nur im Import normalisieren** — verworfen: zxing liefert für
  EAN-13 mit führender Null zwölf Stellen, der Scan fände den Datensatz nicht.
- **Bestehende Barcodes per Migration auf die kanonische Form umschreiben** —
  verworfen: schreibt Zeilen mit `is_corrected = true` (ADR-0011 Punkt 7);
  die Lookup-Schlüssel decken die Altform ab.
- **Chargen committen** — siehe Punkt 7; Nutzerfrage offen.
