# ADR-0001: Frontend-Projektstruktur mit Signal-Stores statt NgRx

- **Status**: accepted
- **Datum**: 2026-09-20
- **Bounded Context(s)**: `app-shell`, `auth`, `diary`, `food-catalog`, `meals`, `goals`, `stats`
- **task_id**: `PO-2026-09-20-001`

## Kontext

Greenfield: Das Repo enthält außer den Kontext-Dateien und `project.md`
keinen Code. Ohne festgelegte Struktur legt jedes Paket — und jeder von
einem Lead gespawnte Subagent, der nur sein Sub-Handoff sieht — Dateien nach
eigenem Gutdünken ab. Die Referenzstruktur des Agent-Team-Plugins geht von
Angular mit NgRx aus (`features/<feature>/store/*`, Facade als einzige
Brücke). Der Feature-Request schreibt dagegen ausdrücklich Standalone
Components, Signals und „kein NgRx" vor, nennt die Feature-Ordner namentlich
und fordert „kein Over-Engineering — es sind zwei Nutzer".

## Entscheidung

`.claude/context/code-conventions.md` wird im Modus `vorgegeben` angelegt und
weicht an drei Stellen bewusst von der Plugin-Referenzstruktur ab:

1. Features liegen direkt unter `src/app/<feature>/` (auth, diary,
   food-search, scanner, meals, goals, stats) statt unter
   `src/app/features/<feature>/`.
2. Statt `store/` mit Actions/Reducer/Effects/Selectors plus Facade hat jedes
   Feature genau **einen** `<feature>.store.ts` auf Signal-Basis. Er ist die
   einzige Zustandsquelle des Features und ersetzt zugleich die Facade.
3. Datenzugriff liegt in `<feature>.service.ts`; der Weg ist immer
   Komponente → Store → Service. Kein HTTP-/Supabase-Aufruf aus einer
   Komponente.

Alle übrigen Regeln der Referenz gelten unverändert: `core/` nur für
einmalig existierende Dienste, `shared/` erst ab zwei Nutzern, kein
Feature-zu-Feature-Import, kebab-case mit Typ-Suffix, `*.spec.ts` neben der
getesteten Datei.

## Konsequenzen

- Positiv: Deutlich weniger Dateien und Indirektion pro Feature; die Struktur
  passt zu Signals und zur Projektgröße. Die Regel „Komponente → Store →
  Service" erhält trotzdem die Testbarkeit und lokalisiert spätere Umbauten.
- Negativ/Trade-off: Ohne Effects/Actions fehlt eine eingebaute Konvention
  für asynchrone Abläufe — Ladezustände und Fehler müssen je Store
  konsistent von Hand modelliert werden. Eine spätere Einführung von NgRx
  wäre ein Bruch über alle Features hinweg.
- Betrifft künftig: `frontend-lead` und alle von ihm gespawnten Subagents
  legen Dateien ausschließlich nach `code-conventions.md` ab. Ein zweiter
  Store je Feature oder ein zusätzlicher State-Container braucht ein eigenes
  ADR.

## Alternativen (kurz)

- Plugin-Referenzstruktur mit NgRx unverändert übernehmen — verworfen, weil
  der Feature-Request NgRx ausschließt und die Store-Schichten bei zwei
  Nutzern reiner Ballast wären.
- `src/app/features/<feature>/` beibehalten und nur den Store-Teil ersetzen —
  verworfen, weil der Feature-Request und die Abnahmekriterien von Paket 001
  `src/app/<feature>/` als Pfad nennen; zwei konkurrierende Pfadangaben sind
  schlimmer als eine dokumentierte Abweichung.
