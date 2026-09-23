import { Injectable, inject, signal } from '@angular/core';
import { ENTRY_QUEUE_STORE, LocalDbService } from './local-db.service';
import type { MealType } from './meal-type.constants';

/**
 * Puffer-Queue für noch nicht übertragene `entries` (ADR-0016). Zustand +
 * IndexedDB-Persistenz — die Übertragung selbst (sequenziell, single-flight,
 * Fehlerklassifizierung) liegt in `core/entry-sync.service.ts`. Beide liegen
 * hinter `core/entries.service.ts`, das der einzige Aufrufer bleibt
 * (code-conventions.md).
 *
 * `EntryQueueFoodSnapshot` ist die bewusste Denormalisierung aus ADR-0016
 * Punkt 6: ohne sie wäre ein gepufferter Eintrag offline weder darstellbar
 * noch summierbar. Übertragen wird trotzdem ausschließlich `foodId`.
 */

export type EntryQueueSyncState = 'pending' | 'failed';
export type EntryQueueFoodSource = 'off' | 'manual';

export interface EntryQueueFoodSnapshot {
  id: string;
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
  source: EntryQueueFoodSource;
}

export interface QueueEntry {
  id: string;
  /** Lokaler `YYYY-MM-DD`-String, nie ein `Date`-Objekt (ADR-0006 Punkt 2). */
  date: string;
  mealType: MealType;
  amountG: number;
  foodId: string;
  food: EntryQueueFoodSnapshot;
  syncState: EntryQueueSyncState;
  /** Versuche der AKTUELLEN Online-Phase (ADR-0016 Punkt 9) — beim Re-Arm auf 0 zurückgesetzt. */
  attempts: number;
  /** Epoch-ms der Anlage — Sync-Reihenfolge („in Anlegereihenfolge", ADR-0016 Punkt 9). */
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class EntryQueueService {
  private readonly localDb = inject(LocalDbService);

  private readonly entriesState = signal<QueueEntry[]>([]);
  private loadPromise: Promise<void> | null = null;

  /** Alle gepufferten Einträge, sortiert nach Anlegereihenfolge. `diary` beobachtet dieses Signal, um Einträge des angezeigten Tages einzumischen (ADR-0016 Punkt 7). */
  readonly entries = this.entriesState.asReadonly();

  constructor() {
    void this.ensureLoaded();
  }

  /** Wartet, bis die Queue initial aus IndexedDB geladen ist (App-Neustart, ADR-0016 Punkt 5). */
  whenReady(): Promise<void> {
    return this.ensureLoaded();
  }

  getById(id: string): QueueEntry | undefined {
    return this.entriesState().find((entry) => entry.id === id);
  }

  async enqueue(entry: QueueEntry): Promise<void> {
    await this.whenReady();
    await this.localDb.put(ENTRY_QUEUE_STORE, entry);
    this.entriesState.update((current) => sortByCreatedAt([...current, entry]));
  }

  /** Bearbeiten eines noch gepufferten Eintrags wirkt rein lokal — kein zweiter Queue-Eintrag (ADR-0016 Punkt 5). `false` ohne passenden Queue-Eintrag. */
  async updateLocal(id: string, input: { amountG: number; mealType: MealType }): Promise<boolean> {
    const current = this.getById(id);
    if (!current) return false;

    const next: QueueEntry = { ...current, amountG: input.amountG, mealType: input.mealType };
    await this.localDb.put(ENTRY_QUEUE_STORE, next);
    this.entriesState.update((list) => list.map((entry) => (entry.id === id ? next : entry)));
    return true;
  }

  /** Löschen eines noch gepufferten Eintrags entfernt ihn ohne Übertragungsversuch (ADR-0016 Punkt 5, design-conventions.md). `false` ohne passenden Queue-Eintrag. */
  async removeLocal(id: string): Promise<boolean> {
    if (!this.getById(id)) return false;

    await this.localDb.delete(ENTRY_QUEUE_STORE, id);
    this.entriesState.update((list) => list.filter((entry) => entry.id !== id));
    return true;
  }

  /** Nach erfolgreicher Übertragung — entfernt den Queue-Eintrag endgültig (aufgerufen von `entry-sync.service.ts`). */
  async markSynced(id: string): Promise<void> {
    await this.localDb.delete(ENTRY_QUEUE_STORE, id);
    this.entriesState.update((list) => list.filter((entry) => entry.id !== id));
  }

  /** Setzt Sync-Status + Versuchszähler eines Queue-Eintrags (aufgerufen von `entry-sync.service.ts`). No-op ohne passenden Eintrag (z. B. zwischenzeitlich lokal gelöscht). */
  async setSyncState(id: string, syncState: EntryQueueSyncState, attempts: number): Promise<void> {
    const current = this.getById(id);
    if (!current) return;

    const next: QueueEntry = { ...current, syncState, attempts };
    await this.localDb.put(ENTRY_QUEUE_STORE, next);
    this.entriesState.update((list) => list.map((entry) => (entry.id === id ? next : entry)));
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.localDb
        .getAll<QueueEntry>(ENTRY_QUEUE_STORE)
        .then((rows) => {
          this.entriesState.set(sortByCreatedAt(rows));
        })
        .catch(() => {
          // Defensiv: eine nicht verfügbare IndexedDB (z. B. privater Modus
          // mancher Browser) darf den Rest der App nicht blockieren — die
          // Queue bleibt dann für diese Sitzung leer.
          this.entriesState.set([]);
        });
    }
    return this.loadPromise;
  }
}

function sortByCreatedAt(entries: readonly QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => a.createdAt - b.createdAt);
}
