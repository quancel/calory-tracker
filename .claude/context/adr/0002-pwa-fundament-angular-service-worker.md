# ADR-0002: PWA-Fundament über @angular/service-worker

- **Status**: accepted
- **Datum**: 2026-09-20
- **Bounded Context(s)**: `app-shell`
- **task_id**: `PO-2026-09-20-001`

## Kontext

Die App soll installierbar sein, offline zumindest die App-Shell zeigen und
Updates schnell ausliefern (Hinweis „Neue Version verfügbar, neu laden").
Ein Service Worker ist eine Laufzeit-Abhängigkeit mit projektweiter Wirkung:
Er entscheidet, welche Antworten aus dem Cache kommen, und ist nach einem
Fehlkonfigurieren im Feld nur schwer zurückzuholen — ausgelieferte Clients
behalten den registrierten Worker.

## Entscheidung

- Service Worker über `@angular/service-worker`, Registrierung nur im
  Produktions-Build (`enabled: !isDevMode()`), Konfiguration in
  `ngsw-config.json`.
- **Cache-Strategie**: `assetGroups` für App-Shell und statische Assets
  (`installMode: prefetch` für die Shell, `lazy` für Icons/Fonts-Assets).
  **Keine `dataGroups`** für Supabase- oder Open-Food-Facts-Antworten in
  diesem Paket: Fachdaten werden nicht vom Service Worker gecacht. Offline-
  Verhalten für Einträge ist ein eigenes Vorhaben (Offline-Puffer) und wird
  in der Anwendungsschicht gelöst, nicht im Worker.
- **Update-Flow**: `SwUpdate.versionUpdates` mit `VERSION_READY`; das Update
  wird nie automatisch angewendet, sondern über den Update-Hinweis aus
  `design-conventions.md` bestätigt. `unrecoverable` Zustände lösen einen
  Reload aus.
- **Manifest**: `src/manifest.webmanifest`, `display: standalone`,
  `theme_color`/`background_color` fest hell (Light-Mode-only gemäß
  `design-concept.md`), Icons 192px und 512px plus eine maskable Variante.

## Konsequenzen

- Positiv: Installierbarkeit und schneller Kaltstart ohne zusätzliche
  Abhängigkeit; der Update-Zeitpunkt bleibt beim Nutzer, keine stillen
  Versionssprünge während einer Eingabe.
- Negativ/Trade-off: Gecachte Shell bedeutet, dass Fehler in der Shell bis
  zum nächsten angenommenen Update bestehen bleiben. Entwicklung und Tests
  müssen den Worker im Dev-Server bewusst ausgeschaltet lassen, sonst sind
  Änderungen scheinbar wirkungslos.
- Betrifft künftig: Wer Fachdaten cachen will (Food-Cache, Offline-Puffer),
  tut das in der Anwendungsschicht (IndexedDB/Store) — `dataGroups` in
  `ngsw-config.json` zu ergänzen braucht ein eigenes ADR, weil es die
  Konsistenzgarantien der Supabase-Zugriffe verändert.

## Alternativen (kurz)

- Eigener Service Worker (Workbox/handgeschrieben) — verworfen, weil das
  Angular-Paket Build-Integration und Update-Ereignisse mitbringt und bei
  zwei Nutzern keine Sonderanforderung besteht.
- Updates automatisch anwenden (`activateUpdate` ohne Nachfrage) — verworfen,
  weil ein Reload mitten in einer Eingabe Daten kostet; der bestätigte
  Update-Hinweis ist in `design-conventions.md` bereits festgelegt.
