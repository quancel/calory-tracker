import { computed, effect, inject, signal, untracked } from '@angular/core';
import { ConnectivityService } from './connectivity.service';
import { MIN_SERVER_QUERY_LENGTH } from './food-search.constants';
import {
  type ServerFoodHit,
  type ServerSearchPhase,
  dedupeServerHits,
  isSearchStatusReserved,
  mergeLocalAndServer,
  rankLocalFoods,
  resolveSearchEmptyState,
  resolveSearchStatus,
  searchAnnouncement,
} from './foods.calculations';
import { CoreFoodsService } from './foods.service';

/** Wartezeit nach dem letzten Tastendruck, bevor die Serversuche startet (ADR-0021 Punkt 10). */
export const SERVER_SEARCH_DEBOUNCE_MS = 250;

/**
 * Gemeinsame Suchlogik für Step A (`food-catalog`) und M2 (`meals`) —
 * ADR-0021 Punkt 10. Factory statt Singleton, weil jeder Aufrufer einen
 * EIGENEN Query- und Antwortzustand braucht; aufzurufen im
 * Feldinitialisierer des Stores (Injection Context).
 *
 * Hält Query, Debounce, Laufnummer (eine Antwort wirkt nur, wenn ihre
 * Laufnummer die aktuelle ist), Abbruch per `AbortController` (ein Abbruch
 * ist nie ein Fehler), Server-Phase und das Neu-Auslösen beim Wechsel
 * offline → online. Die reinen Regeln (Rang, Merge, Status, Leerzustand)
 * liegen in `foods.calculations.ts`.
 */
export function createHybridFoodSearch() {
  const coreFoods = inject(CoreFoodsService);
  const connectivity = inject(ConnectivityService);

  const queryState = signal('');
  const phaseState = signal<ServerSearchPhase>('idle');
  const hitsState = signal<readonly ServerFoodHit[]>([]);

  let runNumber = 0;
  let controller: AbortController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const trimmedLength = computed(() => queryState().trim().length);

  const localResults = computed(() =>
    rankLocalFoods(coreFoods.foods(), queryState(), coreFoods.ownUseCounts()),
  );
  const serverResults = computed(() => dedupeServerHits(localResults(), hitsState()));
  const results = computed(() => mergeLocalAndServer(localResults(), serverResults()));

  const status = computed(() =>
    resolveSearchStatus({
      localState: coreFoods.localState(),
      queryLength: trimmedLength(),
      serverPhase: phaseState(),
    }),
  );
  const statusReserved = computed(() =>
    isSearchStatusReserved({ localState: coreFoods.localState(), queryLength: trimmedLength() }),
  );
  const announcement = computed(() => searchAnnouncement(phaseState(), serverResults().length));
  const emptyState = computed(() =>
    resolveSearchEmptyState({
      localState: coreFoods.localState(),
      queryLength: trimmedLength(),
      serverPhase: phaseState(),
      resultCount: results().length,
    }),
  );

  function cancelPending(): void {
    runNumber += 1;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    controller?.abort();
    controller = null;
  }

  async function run(): Promise<void> {
    cancelPending();
    const thisRun = runNumber;
    const query = queryState().trim();
    controller = new AbortController();
    phaseState.set('pending');

    const result = await coreFoods.searchServer(query, controller.signal);

    // Veraltete Antwort (neue Eingabe, Abbruch, Wechsel offline): ohne sichtbare Wirkung.
    if (thisRun !== runNumber || result.status === 'aborted') return;

    if (result.status === 'success') {
      hitsState.set(result.hits);
      phaseState.set('success');
    } else {
      phaseState.set('error');
    }
  }

  function setQuery(value: string): void {
    cancelPending();
    queryState.set(value);
    hitsState.set([]);

    if (value.trim().length < MIN_SERVER_QUERY_LENGTH) {
      phaseState.set('idle');
      return;
    }
    if (!connectivity.online()) {
      phaseState.set('offline');
      return;
    }

    phaseState.set('pending');
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void run();
    }, SERVER_SEARCH_DEBOUNCE_MS);
  }

  /** „Erneut versuchen" je nach angezeigtem Status: Lokalbestand nachladen bzw. Serversuche für die aktuelle Eingabe sofort anstoßen. */
  async function retry(): Promise<void> {
    const current = status();
    if (current.kind === 'local-unavailable') {
      await coreFoods.retryLoad();
    } else if (current.kind === 'server-failed' && connectivity.online()) {
      await run();
    }
  }

  // Wechsel online ↔ offline: offline bricht eine laufende Suche ab, online
  // löst die Suche für die bestehende Eingabe neu aus (ADR-0021 Punkt 10).
  effect(() => {
    const online = connectivity.online();
    untracked(() => {
      if (trimmedLength() < MIN_SERVER_QUERY_LENGTH) return;
      if (!online) {
        cancelPending();
        hitsState.set([]);
        phaseState.set('offline');
      } else if (phaseState() === 'offline') {
        void run();
      }
    });
  });

  return {
    query: queryState.asReadonly(),
    setQuery,
    retry,
    /** Lokale Treffer, bereits nach `rankLocalFoods` sortiert; bei leerer Eingabe `[]`. */
    localResults,
    /** Server-Gruppe nach Duplikat-Abzug und Kürzung auf `SERVER_RESULT_LIMIT`. */
    serverResults,
    /** Lokal ++ Server in einer Liste. */
    results,
    serverPhase: phaseState.asReadonly(),
    status,
    statusReserved,
    announcement,
    emptyState,
  };
}

export type HybridFoodSearch = ReturnType<typeof createHybridFoodSearch>;
