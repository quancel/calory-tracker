# Learnings

**Single-Writer: Nur der `architekt`-Agent schreibt hierhin.** Alle anderen
Agents lesen nur. Kein Log: Der Architekt kuratiert nach Abschluss eines
Arbeitspakets, ob ein Learning wiederkehrend relevant ist, und fasst es in
1–3 Zeilen. Veraltete Einträge werden gelöscht, nicht angehängt
(Faustregel: < 50 Einträge).

## Format pro Eintrag

```
- [YYYY-MM-DD] <bounded_context>: <Erkenntnis in 1-3 Sätzen> (task_id: <id>)
```

## Einträge

- [2026-09-20] `data-platform`: Das „Backend" ist ausschließlich Postgres +
  RLS ohne eigenen API-Server. Jede Zugriffsregel muss deshalb als Policy
  formuliert werden — ein Constraint der Form „das Frontend filtert nach
  user_id" ist keine Absicherung und darf nicht als solche geroutet werden.
  (task_id: PO-2026-09-20-003)
- [2026-09-20] `design-system`: Die Hex-Werte in `design-conventions.md` sind
  ausdrücklich ungeprüfte Vorschläge; die Kontrastprüfung des `frontend-lead`
  korrigiert sie regelmäßig (bei Paket 013a alle drei Makrofarben). Pakete,
  die Farb-/Elevation-Tokens anlegen oder ändern, brauchen deshalb immer eine
  anschließende Konventions-Nachpflege beim `ux-ui-designer` — sonst driftet
  `tokens.css` von der Dokumentation weg. (task_id: PO-2026-09-20-013a)
- [2026-09-22] `offline-sync`: Fire-and-forget-Aufrufe (`void
  this.entrySync.runQueue()`) in `core/`-Diensten brauchen ein `.catch()`.
  Ohne das wird jede Rejection aus dem Hintergrundlauf zur unbehandelten
  Promise — in Tests als Rauschen sichtbar, ohne dass ein Test fehlschlägt,
  in Produktion unbemerkt. Wer einen solchen Aufruf einführt, behandelt den
  Fehlerfall an der Aufrufstelle. (task_id: PO-2026-09-20-014)
- [2026-09-22] `projektweit`: Handoff-Constraints sind Zusammenfassungen und
  regelmäßig knapper als das referenzierte ADR. Nennt ein Constraint eine
  ADR-Nummer, ist das ADR die Quelle — Leads lesen es, statt sich auf den
  Handoff-Satz zu verlassen. (task_id: PO-2026-09-20-015-be)
- [2026-09-22] `projektweit`: Wird ein Paket nach einer Unterbrechung
  fortgesetzt, fehlt der Kontext des ersten Laufs. Vor der Abgabe deshalb
  explizit gegen **jeden** Punkt der relevanten `design-conventions.md`-
  Abschnitte prüfen (nicht nur gegen die Kernlogik) und zusätzlich, ob zu
  jeder neuen Datei die `*.spec.ts` existiert. (task_id:
  PO-2026-09-20-015-fe)
