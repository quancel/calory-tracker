# ADR-0016: Offline-Puffer — client-vergebene Eintrags-UUID als Idempotenzschlüssel, IndexedDB-Queue in `core/`, neuer Bounded Context `offline-sync`

- **Status**: accepted
- **Datum**: 2026-09-22
- **Bounded Context(s)**: `offline-sync` (neu), `diary`, `food-catalog`,
  `meals`, `app-shell`, `data-platform`
- **task_id**: `PO-2026-09-20-014`

## Kontext

Ein bei fehlender Verbindung angelegter Eintrag muss sofort in der
Tagesansicht erscheinen, einen App-Neustart während der Offline-Phase
überleben und nach Wiederherstellung **genau einmal** übertragen werden.
Der einzige Schreibweg auf `entries` ist `core/entries.service.ts`
(ADR-0009); der Lesepfad der Tagesliste liegt in `diary/diary.service.ts`
(ADR-0006) und ist rein netzabhängig. Signals überleben keinen Reload.
ADR-0002 hat Offline-Verhalten für Einträge ausdrücklich als eigenes
Vorhaben in der **Anwendungsschicht** vorgemerkt und `dataGroups` im
Service Worker ausgeschlossen.

## Entscheidung

1. **Kein `dataGroups` im Service Worker.** ADR-0002 gilt unverändert;
   `ngsw-config.json` bleibt unangetastet. Fachdaten-Offline-Verhalten
   entsteht ausschließlich in der Anwendungsschicht.
2. **Persistenz: IndexedDB über einen einzigen Zugangsdienst**
   `src/app/core/local-db.service.ts` — natives `indexedDB`, **keine neue
   Laufzeit-Abhängigkeit** (kein `idb`, kein Dexie; gleiche Linie wie
   „keine Chart-Bibliothek", ADR-0014 Punkt 4). Genau eine Datenbank, genau
   ein Öffnungs-/Versionierungsort. Kein `localStorage` für Fachdaten.
3. **Die Eintrags-ID wird im Client vergeben.** `entries.id` ist
   `uuid primary key default gen_random_uuid()`, die Insert-Policy prüft nur
   `user_id` — ein mitgesendetes `id` ist zulässig. Jeder gepufferte Eintrag
   bekommt beim Anlegen eine `crypto.randomUUID()` und behält sie bis in die
   Datenbank. Damit ist der Primärschlüssel der **Idempotenzschlüssel**: Ein
   Wiederholungsversuch nach verlorener Antwort läuft in einen
   Unique-Violation-Fehler (`23505`), der als **Erfolg** gewertet wird. Keine
   Migration, kein zusätzliches Batch-/Client-ID-Feld, kein ID-Umschreiben
   nach dem Sync. Es gibt keine „lokale ID" und keine „echte ID" — es gibt
   eine ID.
4. **Die Queue hängt hinter dem bestehenden Schreibweg, nicht daneben.**
   `core/entries.service.ts` bleibt der einzige Schreibweg (ADR-0009) und
   der einzige Aufrufer der Queue. Aufrufende Features (`diary`,
   `food-catalog`, `meals`) ändern ihren Aufruf **nicht** und erfahren vom
   Puffer nichts. Schlägt ein Schreibvorgang mit einem als temporär
   eingestuften Fehler fehl oder ist der Client offline, wird **gepuffert
   statt `success: false` zurückgegeben** — das Anlegen gilt nach außen als
   erfolgreich, `revision` wird erhöht.
5. **Gepuffert wird ausschließlich das Anlegen** (`createEntry`,
   `createEntries`). `updateEntry`/`deleteEntry`/`deleteEntries` auf einem
   **bereits übertragenen** Eintrag bleiben unverändert netzabhängig und
   scheitern offline wie bisher. Auf einem **noch gepufferten** Eintrag
   wirken sie rein lokal auf den Queue-Eintrag (ändern bzw. entfernen ihn) —
   nie entsteht daraus ein zweiter Queue-Eintrag, ein gelöschter gepufferter
   Eintrag wird nie übertragen.
6. **`loadEntry(id)` bedient sich zuerst aus der Queue.** Das
   Bearbeiten-Sheet (`eintrag-erfassen?entryId=…`, ADR-0009 Punkt 5) ruft
   unverändert `EntriesService.loadEntry()`; für eine gepufferte ID kommt
   die Antwort aus der Queue statt aus PostgREST. Deshalb trägt jeder
   Queue-Eintrag einen **Nährwert-Schnappschuss des Foods** (Name,
   vier 100-g-Werte, `source`) zum Zeitpunkt des Anlegens — sonst wäre ein
   gepufferter Eintrag offline weder darstellbar noch summierbar.
   Der Schnappschuss dient **nur** der Anzeige/Summe; übertragen wird
   ausschließlich `food_id` (Nährwerte bleiben unberechnet und
   unpersistiert, ADR-0006/ADR-0009).
7. **Die Tagesansicht mischt, sie puffert nicht.** `diary.service.ts`
   bleibt netzabhängig und unverändert. `DiaryStore` legt über die
   geladenen Server-Einträge die gepufferten Einträge desselben Tages
   (`computed`, Quelle: Signal der Queue) — daraus ergeben sich Liste,
   Sektionen und Tagessummen **in einem** Rechenweg, ein ungesynchter
   Eintrag zählt damit zwangsläufig wie ein synchronisierter. Kein zweiter
   Summenpfad, keine Sonderbehandlung in `diary.calculations.ts`.
   `DiaryEntry` bekommt ein Feld `syncState: 'synced' | 'pending' |
   'failed'`; `'synced'` ist der Wert für alles, was aus dem Server-Lesepfad
   kommt.
8. **Lesecache für den Kaltstart ohne Netz**: der zuletzt geladene Tag
   (Einträge + Zielzeile) und der zuletzt geladene Food-Bestand werden nach
   jedem erfolgreichen Laden als **Schnappschuss** in dieselbe IndexedDB
   geschrieben und beim Laden verwendet, wenn die Abfrage scheitert. Der
   Schnappschuss ist ein Anzeige-Ersatz, nie eine Schreibquelle, und wird
   bei jedem erfolgreichen Laden überschrieben. Der Food-Schnappschuss
   speist `core/foods.service.ts` — ohne ihn ist „offline einen Eintrag
   anlegen" nach einem Neustart unmöglich, weil der Katalog leer wäre.
9. **Online-Phase und Wiederholung.** Eine Online-Phase beginnt mit einem
   `online`-Event bzw. einem App-Start bei `navigator.onLine === true` und
   endet mit dem nächsten `offline`-Event. Verbindungszustand kommt
   ausschließlich aus `core/connectivity.service.ts` (kapselt
   `navigator.onLine` + `online`/`offline`-Listener, exponiert ein Signal);
   kein Feature liest diese Browser-APIs selbst. Je Online-Phase erhält ein
   Eintrag bis zu **3** Versuche mit wachsendem Abstand; danach `failed`.
   **Permanente** Fehler (HTTP 4xx außer 408/429, sowie PostgREST-Fehler,
   die eine Wiederholung nicht heilt) führen **sofort** zu `failed`, ohne
   weitere Versuche. `23505` auf die eigene ID ist kein Fehler, sondern
   Erfolg (Punkt 3). Der Sync läuft **sequenziell und single-flight** (ein
   Lauf gleichzeitig, Einträge in Anlegereihenfolge) — kein paralleles
   Abfeuern der Queue.
10. **Ein gepufferter Eintrag wird nie automatisch verworfen.** Auch
    `failed`-Einträge bleiben in der Queue und in der Tagesansicht. Entfernt
    werden sie nur durch erfolgreiche Übertragung oder durch bewusstes
    Löschen des Nutzers.
11. **Rückmeldung nur an der Zeile.** Marker und „Erneut versuchen" leben in
    der Eintragszeile der Tagesansicht; es entsteht **keine** Banner-/
    Sammelkomponente und kein globaler Offline-Indikator. Der Marker liegt
    als Komponente in `diary/components/` (genau ein Nutzer — die
    Zwei-Nutzer-Regel für `shared/ui/` ist nicht erfüllt).

## Konsequenzen

- Positiv: „Genau einmal übertragen" ist eine Datenbankgarantie statt einer
  Client-Heuristik; ein doppelter Versuch kann keinen Doppel-Eintrag
  erzeugen. Alle Features schreiben weiter über genau einen Weg und bleiben
  unverändert. Kein neues npm-Paket, keine Migration, kein
  Service-Worker-Eingriff.
- Negativ/Trade-off: `core/entries.service.ts` wird deutlich fachlicher —
  es kapselt ab hier auch Fehlerklassifizierung und Pufferung. Der
  Nährwert-Schnappschuss im Queue-Eintrag ist eine bewusste Denormalisierung
  mit begrenzter Lebensdauer (er kann veralten, wenn das Food zwischenzeitlich
  korrigiert wird — nach dem Sync zeigt der Server-Lesepfad wieder den
  aktuellen Stand). Der Lesecache aus Punkt 8 zeigt im Offline-Kaltstart
  bewusst potenziell veraltete Daten statt eines Fehlers.
- Betrifft künftig: Wer einen weiteren Schreibvorgang offline-fähig machen
  will (Ziele, Mahlzeiten), erweitert die Queue in `core/`, baut keine
  zweite. Wer eine neue IndexedDB-Nutzung braucht, geht über
  `core/local-db.service.ts` und erhöht dort die Version. `dataGroups` in
  `ngsw-config.json` bleiben ausgeschlossen (ADR-0002) — eine Ergänzung
  braucht weiterhin ein eigenes ADR.

## Alternativen (kurz)

- **Server-generierte ID + Client-Batch-ID als Idempotenzschlüssel** —
  verworfen, weil es eine Migration (neue Spalte + Unique-Index) und ein
  ID-Umschreiben nach dem Sync erfordert; der Primärschlüssel leistet
  dasselbe umsonst.
- **Background Sync API des Service Workers** — verworfen: nicht
  browserübergreifend verfügbar, und der Worker bräuchte dann eigene
  Supabase-Auth. Widerspricht ADR-0002 („Offline in der
  Anwendungsschicht").
- **`dataGroups` für die Supabase-Lesepfade statt eigener Schnappschüsse** —
  verworfen, weil es die Konsistenzgarantien aller Lesepfade global
  verändert (ADR-0002) und für Schreibvorgänge ohnehin nichts löst.
- **Queue als eigenes Feature `src/app/offline/`** — verworfen: Sie hat
  Aufrufer aus drei Features und liegt hinter `core/entries.service.ts`;
  ein Feature-Ort wäre wie bei `entries.service.ts` in jedem Fall falsch
  (ADR-0009).
- **`localStorage` statt IndexedDB** — verworfen: synchron, Größenlimit,
  und der Food-Schnappschuss wäre dort unpassend groß.
