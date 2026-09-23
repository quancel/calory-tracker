# ADR-0003: Supabase-Client in `core/`, Session als Signal, Konfiguration über `src/environments/`

- **Status**: accepted
- **Datum**: 2026-09-20
- **Bounded Context(s)**: `auth`, `app-shell`, `data-platform`
- **task_id**: `PO-2026-09-20-002`

## Kontext

Paket 002 bringt die erste echte Außenanbindung der App. Vor diesem Paket
enthält das Repo **keine** Supabase-Abhängigkeit (`package.json` hat nur
Angular + rxjs), **kein** `src/environments/` und **kein** `supabase/`.
Gleichzeitig hängen alle späteren Datenpakete (`diary`, `meals`, `goals`,
`stats`) daran: Sie greifen laut Context-Map direkt per Supabase-Client
unter RLS zu und brauchen dafür die `user_id` aus der Session. Ein zweiter
Client oder ein zweites Session-Signal wäre später über alle Features hinweg
teuer zu korrigieren — insbesondere, weil `@supabase/supabase-js` pro
Instanz eigene Session-Persistenz und einen eigenen
`onAuthStateChange`-Kanal aufbaut.

Zusätzlich kollidieren zwei Regeln aus `code-conventions.md`, wenn man
Session-Zustand naiv in `auth/auth.store.ts` legt: `core/` darf nicht aus
einem Feature importieren, der Route-Guard liegt aber laut Konvention in
`core/` und braucht genau diesen Zustand.

## Entscheidung

1. **Neue Laufzeit-Abhängigkeit** `@supabase/supabase-js`. Sie wird
   ausschließlich in `src/app/core/supabase.service.ts` importiert; kein
   Feature importiert das Paket direkt.
2. `core/supabase.service.ts` ist der einzige Zugriffspunkt auf den Client
   und hält zugleich den **app-weiten Session-Zustand** als `readonly`
   Signal (`session`, abgeleitet `userId`, `isAuthenticated`). Er abonniert
   `onAuthStateChange` und stellt die Wiederherstellung der persistierten
   Session bereit.
3. **Feature-seitig** bleibt es bei der Konvention Komponente → Store →
   Service: `auth/auth.service.ts` kapselt `signInWithPassword`/`signOut`
   und übersetzt Supabase-Fehler, `auth/auth.store.ts` hält nur den
   Formular-/Absendezustand (`submitting`, generische Fehlermeldung). Der
   Session-Zustand wird dort **nicht** dupliziert, sondern aus
   `SupabaseService` abgeleitet.
4. **Guard**: `core/auth.guard.ts` (CanActivateFn) schützt alle Routen außer
   `login` und wertet erst aus, **nachdem** die persistierte Session
   wiederhergestellt wurde. Der Bootstrap wartet auf diese
   Wiederherstellung, bevor die erste Navigation aufgelöst wird.
5. **Konfiguration**: `src/environments/environment.example.ts` liegt im
   Repo (Platzhalter), `src/environments/environment.ts` ist gitignored und
   wird lokal aus der Beispieldatei kopiert. Der Anon-Key ist zwar kein
   Geheimnis, aber projektspezifisch — die Trennung hält das Repo frei von
   Instanzdaten und macht den Setup-Schritt in der README sichtbar.
6. **Kein Signup**: Die beiden Accounts werden im Supabase-Dashboard
   angelegt. `signUp` wird nicht aufgerufen, es gibt keine Registrierungsroute.

## Konsequenzen

- Positiv: Genau ein Client, genau eine Session-Wahrheit. Folgepakete
  injizieren `SupabaseService` und lesen `userId`, ohne `auth` zu
  importieren. Der Guard bleibt in `core/`, ohne die Feature-Import-Regel zu
  brechen.
- Negativ/Trade-off: Der Session-Zustand liegt bewusst **nicht** im
  `auth.store.ts`, obwohl er fachlich nach `auth` klingt — das muss
  dokumentiert bleiben, sonst wird es „aufgeräumt". Außerdem lässt sich das
  Projekt nach einem frischen Clone nicht ohne den Kopierschritt bauen.
- Betrifft künftig: Jedes Paket, das Daten liest oder schreibt. Ein zweiter
  Supabase-Client, ein zweites Session-Signal oder eine Registrierungs-
  funktion brauchen ein eigenes ADR, das dieses hier ablöst.

## Alternativen (kurz)

- Session-Signal in `auth/auth.store.ts` und Guard ebenfalls unter `auth/` —
  verworfen: Der Guard schützt Routen fremder Features, und jedes
  datenlesende Feature müsste dann aus `auth` importieren.
- Client pro Feature-Service erzeugen — verworfen: mehrfache
  Session-Persistenz und konkurrierende `onAuthStateChange`-Kanäle.
- Echte `environment.ts` mit Platzhaltern committen (Build läuft sofort) —
  verworfen zugunsten der Beispieldatei, weil ein committetes
  Konfigurationsfile erfahrungsgemäß irgendwann mit echten Werten
  überschrieben und versehentlich eingecheckt wird.
