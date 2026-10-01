import { Injectable } from '@angular/core';

/**
 * Einziger Zugang zu lokaler Persistenz (siehe code-conventions.md,
 * ADR-0016 Punkt 2): natives `indexedDB`, **keine** Wrapper-Bibliothek
 * (`idb`, Dexie o. ä.). Genau eine Datenbank, genau ein
 * Öffnungs-/Versionierungsort. Kein Feature und kein anderer Dienst öffnet
 * eine eigene Datenbank — neue Object Stores kommen über eine
 * Versionserhöhung hier dazu.
 *
 * Drei Object Stores für Paket PO-2026-09-20-014:
 * - `ENTRY_QUEUE_STORE` (`entry-queue.service.ts`): Puffer-Queue, `keyPath: 'id'`.
 * - `DAY_SNAPSHOT_STORE` (`diary/diary.service.ts`): Lesecache des zuletzt
 *   geladenen Tages + Zielzeile, fester Schlüssel (ADR-0016 Punkt 8).
 * - `FOODS_SNAPSHOT_STORE` (`core/foods.service.ts`): lokaler Food-Bestand in
 *   drei Teilen unter den Schlüsseln `'top'`, `'shared'`, `'user:<userId>'`
 *   (ADR-0021 Punkt 3, löst den Schlüssel `'current'` aus ADR-0016 Punkt 8 ab).
 *
 * Reine Low-Level-Kapsel (get/getAll/put/delete) — Fachlogik (was
 * gespeichert wird, wann gelesen wird) bleibt bei den Aufrufern.
 */

export const LOCAL_DB_NAME = 'calory-tracker-offline';
/**
 * Version 2 (ADR-0021 Punkt 3): `foods-snapshot` hält statt eines Schlüssels
 * `'current'` jetzt die Teile `'top'`, `'shared'`, `'user:<userId>'`; das
 * Upgrade von 1 leert den Store (alte `Food`-Form).
 */
export const LOCAL_DB_VERSION = 2;

export const ENTRY_QUEUE_STORE = 'entry-queue';
export const DAY_SNAPSHOT_STORE = 'day-snapshot';
export const FOODS_SNAPSHOT_STORE = 'foods-snapshot';

@Injectable({ providedIn: 'root' })
export class LocalDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = request.result;
          const upgradeTx = request.transaction;
          if (!db.objectStoreNames.contains(ENTRY_QUEUE_STORE)) {
            db.createObjectStore(ENTRY_QUEUE_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(DAY_SNAPSHOT_STORE)) {
            db.createObjectStore(DAY_SNAPSHOT_STORE);
          }
          if (!db.objectStoreNames.contains(FOODS_SNAPSHOT_STORE)) {
            db.createObjectStore(FOODS_SNAPSHOT_STORE);
          } else if (event.oldVersion < 2 && upgradeTx) {
            // ADR-0021 Punkt 3: der alte `'current'`-Schnappschuss hat die alte Food-Form.
            upgradeTx.objectStore(FOODS_SNAPSHOT_STORE).clear();
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  async getAll<T>(store: string): Promise<T[]> {
    const db = await this.open();
    return new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.open();
    return new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllKeys(store: string): Promise<IDBValidKey[]> {
    const db = await this.open();
    return new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  /** `key` weglassen, wenn der Store einen `keyPath` hat (z. B. `ENTRY_QUEUE_STORE`). */
  async put<T>(store: string, value: T, key?: IDBValidKey): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      if (key === undefined) {
        tx.objectStore(store).put(value);
      } else {
        tx.objectStore(store).put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async delete(store: string, key: IDBValidKey): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Schließt die offene Verbindung (falls vorhanden). Im Produktivbetrieb
   * ohne Aufrufer (die Verbindung lebt so lange wie die Seite) — genutzt von
   * Tests, um zwischen Testfällen eine frische Datenbank anlegen zu können,
   * ohne dass `indexedDB.deleteDatabase()` an einer offenen Verbindung
   * blockiert.
   */
  async close(): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    db.close();
    this.dbPromise = null;
  }
}
