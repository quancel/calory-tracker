import { InjectionToken, Injectable, inject } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ConnectivityService } from './connectivity.service';
import { EntryQueueService, type QueueEntry } from './entry-queue.service';
import { SupabaseService } from './supabase.service';
import type { MealType } from './meal-type.constants';

/**
 * Übertragung der Puffer-Queue — sequenziell, single-flight, mit
 * Fehlerklassifizierung und Online-Phasen-Re-Arm (ADR-0016 Punkt 9). Liegt
 * hinter `core/entries.service.ts`, das der einzige Aufrufer bleibt
 * (code-conventions.md) und diesen Dienst für den allerersten
 * synchronen Übertragungsversuch ebenfalls über `attemptInsertEntry()`
 * nutzt (kein zweiter Insert-Code-Pfad).
 *
 * Technische Betriebswerte des Syncs stehen hier als exportierte
 * Konstanten, nicht in `core/*.constants.ts` (code-conventions.md).
 */

/** Je Online-Phase bis zu 3 automatische Versuche (ADR-0016 Punkt 9). */
export const SYNC_MAX_ATTEMPTS_PER_ONLINE_PHASE = 3;

/** Wachsender Abstand zwischen automatischen Versuchen (ms) — Index = bereits verbrauchte Versuche dieser Online-Phase. */
export const SYNC_BACKOFF_MS: readonly number[] = [0, 1000, 2000];

/** HTTP-Status, die trotz 4xx als temporär gelten (ADR-0016 Punkt 9). */
export const SYNC_TEMPORARY_4XX_STATUS: readonly number[] = [408, 429];

/** Unique-Violation der eigenen ID — ein Wiederholungsversuch gilt als Erfolg (ADR-0016 Punkt 3). */
export const UNIQUE_VIOLATION_CODE = '23505';

/**
 * Verzögerung zwischen automatischen Versuchen — als Token statt eines
 * direkten `setTimeout`-Aufrufs, damit Tests sie durch eine sofort
 * auflösende Funktion ersetzen können (gleiches Muster wie `RELOAD_PAGE` in
 * `core/app-update.service.ts`).
 */
export const SYNC_RETRY_DELAY = new InjectionToken<(ms: number) => Promise<void>>(
  'SYNC_RETRY_DELAY',
  {
    providedIn: 'root',
    factory: () => (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
);

export type EntryWriteOutcome =
  | { kind: 'success' }
  | { kind: 'temporary'; message: string }
  | { kind: 'permanent'; message: string };

/**
 * Klassifiziert einen fehlgeschlagenen `entries`-Schreibvorgang (ADR-0016
 * Punkt 9): `23505` auf die eigene ID ist Erfolg, 4xx außer 408/429 ist
 * dauerhaft, alles andere (kein Netz/Status 0, 408, 429, 5xx) ist temporär.
 */
export function classifyEntryWriteError(
  status: number,
  code: string | null | undefined,
): 'success' | 'temporary' | 'permanent' {
  if (code === UNIQUE_VIOLATION_CODE) return 'success';
  if (status === 0) return 'temporary';
  if (SYNC_TEMPORARY_4XX_STATUS.includes(status)) return 'temporary';
  if (status >= 500) return 'temporary';
  if (status >= 400) return 'permanent';
  // Unerwarteter Status ohne erkennbares 4xx/5xx-Muster — defensiv als
  // temporär behandeln (lieber erneut versuchen als einen Eintrag ohne
  // Grund als dauerhaft gescheitert markieren).
  return 'temporary';
}

export interface EntryInsertPayload {
  id: string;
  foodId: string;
  amountG: number;
  mealType: MealType;
  date: string;
}

/**
 * Roher, einmaliger Übertragungsversuch — genutzt vom ersten synchronen
 * Versuch in `entries.service.createEntry()`/`createEntries()` UND von den
 * automatischen/manuellen Wiederholungen hier. Ein einziger Insert-Code-Pfad
 * für alle Aufrufer.
 */
export async function attemptInsertEntry(
  client: SupabaseClient,
  userId: string,
  entry: EntryInsertPayload,
): Promise<EntryWriteOutcome> {
  const response = await client.from('entries').insert({
    id: entry.id,
    food_id: entry.foodId,
    amount_g: entry.amountG,
    meal_type: entry.mealType,
    date: entry.date,
    user_id: userId,
  });

  if (!response.error) return { kind: 'success' };

  const classification = classifyEntryWriteError(response.status, response.error.code);
  if (classification === 'success') return { kind: 'success' };
  return { kind: classification, message: 'Eintrag konnte nicht übertragen werden.' };
}

@Injectable({ providedIn: 'root' })
export class EntrySyncService {
  private readonly supabase = inject(SupabaseService);
  private readonly entryQueue = inject(EntryQueueService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly delay = inject(SYNC_RETRY_DELAY);

  private runningPromise: Promise<void> | null = null;

  /**
   * Beginn einer neuen Online-Phase (ADR-0016 Punkt 9): dauerhaft
   * gescheiterte Einträge werden re-armed (Versuchszähler auf 0, Zustand
   * zurück auf „wartet") und die Queue wird anschließend abgearbeitet.
   * Aufgerufen von `core/entries.service.ts`, sobald
   * `ConnectivityService.online()` `true` wird (inkl. App-Start bei
   * bestehender Verbindung).
   */
  async startOnlinePhase(): Promise<void> {
    await this.entryQueue.whenReady();
    for (const entry of this.entryQueue.entries()) {
      if (entry.syncState === 'failed') {
        await this.entryQueue.setSyncState(entry.id, 'pending', 0);
      }
    }
    await this.runQueue();
  }

  /**
   * Arbeitet die Queue sequenziell und single-flight ab (ein Lauf
   * gleichzeitig, Einträge in Anlegereihenfolge, ADR-0016 Punkt 9). Ein
   * bereits laufender Aufruf wird geteilt statt einen zweiten Lauf zu
   * starten.
   */
  async runQueue(): Promise<void> {
    if (!this.runningPromise) {
      this.runningPromise = this.processQueue().finally(() => {
        this.runningPromise = null;
      });
    }
    await this.runningPromise;
  }

  /**
   * Manueller Einzel-Retry (design-conventions.md „Erneut versuchen") —
   * genau ein sofortiger Versuch für GENAU diesen Eintrag, kein
   * Sammel-Retry, verbraucht kein automatisches Online-Phasen-Budget. No-op
   * außerhalb des Zustands „dauerhaft gescheitert".
   */
  async retryOne(id: string): Promise<void> {
    const entry = this.entryQueue.getById(id);
    if (!entry || entry.syncState !== 'failed') return;

    const outcome = await attemptInsertEntry(this.supabase.client, this.userId(), entry);

    if (outcome.kind === 'success') {
      await this.entryQueue.markSynced(id);
      return;
    }
    await this.entryQueue.setSyncState(id, 'failed', entry.attempts);
  }

  private async processQueue(): Promise<void> {
    for (const entry of [...this.entryQueue.entries()]) {
      if (entry.syncState !== 'pending') continue;
      if (!this.connectivity.online()) return;
      await this.attemptWithRetries(entry);
    }
  }

  private async attemptWithRetries(entry: QueueEntry): Promise<void> {
    let attempts = entry.attempts;

    while (attempts < SYNC_MAX_ATTEMPTS_PER_ONLINE_PHASE) {
      if (!this.connectivity.online()) return;
      if (attempts > 0) {
        await this.delay(SYNC_BACKOFF_MS[Math.min(attempts, SYNC_BACKOFF_MS.length - 1)]);
      }
      attempts += 1;

      const outcome = await attemptInsertEntry(this.supabase.client, this.userId(), entry);

      if (outcome.kind === 'success') {
        await this.entryQueue.markSynced(entry.id);
        return;
      }
      if (outcome.kind === 'permanent') {
        await this.entryQueue.setSyncState(entry.id, 'failed', attempts);
        return;
      }

      const stillWithinBudget = attempts < SYNC_MAX_ATTEMPTS_PER_ONLINE_PHASE;
      await this.entryQueue.setSyncState(
        entry.id,
        stillWithinBudget ? 'pending' : 'failed',
        attempts,
      );
    }
  }

  private userId(): string {
    return this.supabase.userId() ?? '';
  }
}
