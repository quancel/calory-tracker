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
- [2026-10-01] `data-platform`: Ohne Supabase-Instanz lassen sich Migrationen
  und SQL-Funktionen gegen ein lokales Postgres 16 prüfen (`initdb` unter
  `/var/tmp`, Stubs für `anon`/`authenticated`, `auth.uid()` und das Schema
  `extensions`). Ungeprüft bleiben echte RLS-Rollen, PostgREST (`max_rows`,
  `.range` auf `rpc`) und Nutzerwechsel; Backend-Pakete sollen das im
  Handoff als ungeprüft ausweisen. (task_id: PO-2026-09-30-001)
- [2026-10-01] `data-platform`: In `language sql`-Funktionen kennt der Planer
  die Eingabelänge nicht. Ein `or` über längenabhängige Fälle kann einen
  Index komplett abarbeiten lassen (1,2 s gegenüber 9–24 ms mit `union
  all`). Pakete mit neuer Such-RPC brauchen deshalb einen `explain` je Zweig
  mit realistischem Datenbestand als Constraint. (task_id: PO-2026-09-30-001)
- [2026-10-01] `projektweit`: Annahmen über externe Datenformate (OFF-Export)
  beim Einordnen als **ungeprüft** markieren und eine Prüfung an einer
  echten Stichprobe als ersten Schritt des Leads vorgeben. Hier lagen die
  Nährwerte nicht in `nutriments`, ohne Rückfall wären es 56 statt 261k
  Produkte geworden. (task_id: PO-2026-09-30-002-be)
- [2026-10-01] `projektweit`: Akzeptanzkriterien mit absoluten Wörtern
  („alle", „nur", „unverändert") haben dreimal Abnahme-Rückfragen ausgelöst,
  weil ein ADR eine Ausnahme vorsah (z. B. Update von `off_popularity`).
  Beim Einordnen solche Kriterien gegen die ADRs gegenlesen und die
  Ausnahme als `constraint` ausschreiben. (task_id: PO-2026-09-30-002/-003)
- [2026-10-01] `food-catalog`: Lokale Trefferlisten ohne Obergrenze werden
  bei großem lokalem Bestand zum Render-Problem (4.998 Zeilen, ~666 ms).
  Pakete, die einen lokalen Bestand vergrößern, brauchen eine
  Anzeigegrenze als Produktwert. (task_id: PO-2026-09-30-003)
- [2026-10-01] `projektweit`: In der Agent-Umgebung meldet `ng` eine zu alte
  Node-Version (22.22.2 < 22.22.3). Abhilfe ist ein Wrapper im Scratchpad,
  der `process.version` überschreibt; im Repo wird dafür nichts geändert.
  (task_id: PO-2026-09-30-003)
