import { Injectable, effect, inject, signal } from '@angular/core';
import { ConnectivityService } from './connectivity.service';
import { EntryQueueService, type QueueEntry } from './entry-queue.service';
import {
  attemptInsertEntry,
  classifyEntryWriteError,
  EntrySyncService,
} from './entry-sync.service';
import { CoreFoodsService } from './foods.service';
import type { MealType } from './meal-type.constants';
import { SupabaseService } from './supabase.service';

/**
 * Einziger Schreibweg auf `entries` (anlegen/ändern/löschen) sowie das
 * Lesen eines **einzelnen** Eintrags (siehe ADR-0009). Kein Feature baut
 * einen eigenen Schreibweg auf die Tabelle — `food-catalog` (Paket 007),
 * `meals` (Paket 010) und `diary` (Paket 011) rufen ausschließlich hierüber.
 * Der Lesepfad der Tagesliste bleibt unverändert in `diary.service.ts`
 * (ADR-0006).
 *
 * Bewusster Feature-Bezug in `core/` (siehe code-conventions.md
 * „Abweichungen"): der Dienst hat drei Aufrufer aus drei Features, ein
 * Feature-Ort wäre in jedem Fall falsch.
 *
 * `EntryFood.source` wurde mit Paket PO-2026-09-20-008 ergänzt (ADR-0010
 * Punkt 5): der Quellenhinweis „Aus Open Food Facts übernommen" in Step B
 * gilt für JEDES Food mit persistiertem `source === 'off'`, auch beim
 * Bearbeiten eines bestehenden Eintrags — nicht nur bei einem frischen
 * Scan-Treffer. Eigener String-Typ statt Import aus
 * `food-search/models/food.model.ts` — gleiche bewusste Entkopplung wie
 * bei den übrigen `EntryFood`-Feldern (kein Feature-Import in `core/`).
 *
 * Ab Paket PO-2026-09-20-014 (ADR-0016) kapselt dieser Dienst zusätzlich die
 * Offline-Pufferung: `createEntry`/`createEntries` puffern statt
 * `success: false` zurückzugeben, wenn der Client offline ist oder ein
 * Schreibvorgang mit einem temporären Fehler scheitert (`revision` wird
 * trotzdem erhöht). `updateEntry`/`deleteEntry`/`loadEntry` bedienen sich
 * zuerst aus der Queue (`core/entry-queue.service.ts`), falls die ID dort
 * noch gepuffert liegt — dieser Dienst bleibt der einzige Aufrufer der
 * Queue und von `core/entry-sync.service.ts` (code-conventions.md).
 */

export type EntryFoodSource = 'off' | 'manual';

export interface EntryFood {
  id: string;
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
  source: EntryFoodSource;
}

export interface LoadedEntry {
  id: string;
  date: string;
  mealType: MealType;
  amountG: number;
  syncState: 'synced' | 'pending' | 'failed';
  food: EntryFood;
}

export interface CreateEntryInput {
  foodId: string;
  amountG: number;
  mealType: MealType;
  /** Lokaler `YYYY-MM-DD`-String, nie ein `Date`-Objekt (ADR-0006 Punkt 2). */
  date: string;
}

export interface UpdateEntryInput {
  amountG: number;
  mealType: MealType;
}

export type LoadEntryResult =
  { success: true; entry: LoadedEntry } | { success: false; message: string };

export type WriteEntryResult = { success: true } | { success: false; message: string };

/**
 * Ergebnis von `createEntries()` — verbreitert um die angelegten IDs
 * (ADR-0013 Punkt 1): die Rücknahme einer Massenaktion („gestern
 * kopieren") läuft ausschließlich über diese IDs, nie über eine
 * Merkmalssuche. `food-search.store.ts` (Mahlzeit loggen) wertet weiterhin
 * nur `success` aus und bleibt unverändert. Ab ADR-0016 sind die IDs bei
 * einem gepufferten Vorgang die client-generierten UUIDs — es gibt keine
 * „lokale" und keine „echte" ID (ADR-0016 Punkt 3).
 */
export type CreateEntriesResult =
  { success: true; ids: string[] } | { success: false; message: string };

interface RawFood {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  source: EntryFoodSource | null;
}

interface RawEntry {
  id: string;
  date: string;
  meal_type: MealType;
  amount_g: number;
  foods: RawFood | null;
}

const ENTRY_COLUMNS =
  'id, date, meal_type, amount_g, foods(id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, source)';

function toLoadedEntry(entry: QueueEntry): LoadedEntry {
  return {
    id: entry.id,
    date: entry.date,
    mealType: entry.mealType,
    amountG: entry.amountG,
    syncState: entry.syncState,
    food: {
      id: entry.food.id,
      name: entry.food.name,
      kcal100g: entry.food.kcal100g,
      proteinG100g: entry.food.proteinG100g,
      carbsG100g: entry.food.carbsG100g,
      fatG100g: entry.food.fatG100g,
      source: entry.food.source,
    },
  };
}

@Injectable({ providedIn: 'root' })
export class EntriesService {
  private readonly supabase = inject(SupabaseService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly entryQueue = inject(EntryQueueService);
  private readonly entrySync = inject(EntrySyncService);
  private readonly coreFoods = inject(CoreFoodsService);

  private readonly revisionState = signal(0);

  /**
   * Erhöht sich nach **jedem** erfolgreichen Schreibvorgang (ADR-0009
   * Punkt 4) — inklusive eines gepufferten Anlegens (ADR-0016 Punkt 4).
   * `DiaryStore` beobachtet dieses Signal per `effect` und lädt den
   * aktuellen Tag neu — Richtung `diary` → `core`, `core/` ruft nie in ein
   * Feature hinein.
   */
  readonly revision = this.revisionState.asReadonly();

  constructor() {
    // Startet eine neue Online-Phase, sobald `ConnectivityService.online()`
    // `true` wird — inklusive des ersten `effect()`-Laufs bei App-Start mit
    // bestehender Verbindung (ADR-0016 Punkt 9). Re-Arm dauerhaft
    // gescheiterter Einträge und Weiterverarbeitung liegen in
    // `entry-sync.service.ts`; dieser Dienst bleibt der einzige Aufrufer.
    effect(() => {
      if (this.connectivity.online()) {
        void this.entrySync.startOnlinePhase().catch((error: unknown) => {
          console.error('[EntriesService] startOnlinePhase fehlgeschlagen', error);
        });
      }
    });
  }

  async loadEntry(entryId: string): Promise<LoadEntryResult> {
    const pending = this.entryQueue.getById(entryId);
    if (pending) {
      return { success: true, entry: toLoadedEntry(pending) };
    }

    const response = await this.supabase.client
      .from('entries')
      .select(ENTRY_COLUMNS)
      .eq('id', entryId)
      .maybeSingle();

    if (response.error) {
      return { success: false, message: 'Eintrag konnte nicht geladen werden.' };
    }

    const raw = response.data as unknown as RawEntry | null;
    if (!raw || !raw.foods) {
      return { success: false, message: 'Eintrag konnte nicht geladen werden.' };
    }

    return {
      success: true,
      entry: {
        id: raw.id,
        date: raw.date,
        mealType: raw.meal_type,
        amountG: raw.amount_g,
        syncState: 'synced',
        food: {
          id: raw.foods.id,
          name: raw.foods.name,
          kcal100g: raw.foods.kcal_100g,
          proteinG100g: raw.foods.protein_100g,
          carbsG100g: raw.foods.carbs_100g,
          fatG100g: raw.foods.fat_100g,
          source: raw.foods.source ?? 'manual',
        },
      },
    };
  }

  /**
   * Legt einen Eintrag an. `entries.user_id` hat keinen DB-Default
   * (anders als `foods.created_by`) — deshalb explizit aus
   * `SupabaseService.userId()` gesetzt, Domain-Fehler bei `null` (Muster
   * wie `goals.service.ts`, ADR-0009 Punkt 2). Gespeichert werden
   * ausschließlich `id`, `food_id`, `amount_g`, `meal_type`, `date`,
   * `user_id` — nie berechnete Werte (kcal/Makros ergeben sich beim Lesen
   * aus dem eingebetteten Food).
   *
   * Ab ADR-0016: `id` wird im Client vergeben (`crypto.randomUUID()`) und
   * ist zugleich Idempotenzschlüssel. Ist der Client offline oder scheitert
   * der Versuch mit einem TEMPORÄREN Fehler, wird der Eintrag stattdessen
   * gepuffert (`core/entry-queue.service.ts`) — das Anlegen gilt nach außen
   * als erfolgreich, `revision` wird erhöht (ADR-0016 Punkt 4). Ein
   * PERMANENTER Fehler bleibt ein echter Fehlschlag.
   */
  async createEntry(input: CreateEntryInput): Promise<WriteEntryResult> {
    const userId = this.supabase.userId();
    if (!userId) {
      return { success: false, message: 'Nicht angemeldet.' };
    }

    const id = crypto.randomUUID();
    let attemptsUsed = 0;

    if (this.connectivity.online()) {
      const outcome = await attemptInsertEntry(this.supabase.client, userId, {
        id,
        foodId: input.foodId,
        amountG: input.amountG,
        mealType: input.mealType,
        date: input.date,
      });
      attemptsUsed = 1;

      if (outcome.kind === 'success') {
        this.bumpRevision();
        return { success: true };
      }
      if (outcome.kind === 'permanent') {
        return { success: false, message: outcome.message };
      }
      // temporär → weiter zur Pufferung
    }

    const buffered = await this.bufferCreate(id, input, attemptsUsed);
    if (!buffered) {
      return { success: false, message: 'Eintrag konnte nicht gespeichert werden.' };
    }

    void this.entrySync.runQueue().catch((error: unknown) => {
      console.error('[EntriesService] runQueue fehlgeschlagen (createEntry)', error);
    });
    this.bumpRevision();
    return { success: true };
  }

  /**
   * Legt mehrere Einträge in einem Vorgang an (Loggen einer gespeicherten
   * Mahlzeit, ADR-0012 Punkt 6; „gestern kopieren", ADR-0013 Punkt 1) — ein
   * Array-`insert` mit `.select('id')`, `revision` wird **einmal** erhöht
   * statt n-mal, damit die Tagesansicht einmal statt n-mal nachlädt. Liefert
   * bei Erfolg die angelegten IDs zurück — die einzige zulässige Grundlage
   * für eine spätere gezielte Rücknahme (`deleteEntries`), nie eine
   * Merkmalssuche. `false` bei leerem Array (defensiver Guard, kein
   * No-op-Request) oder Server-Fehler.
   *
   * Ab ADR-0016: Alle IDs werden im Client vergeben. Scheitert der
   * Batch-Insert temporär oder ist der Client offline, wird JEDE Position
   * einzeln als eigener Queue-Eintrag gepuffert (das Anlegen gilt nach
   * außen als erfolgreich); ein permanenter Fehler bleibt ein echter
   * Fehlschlag für den gesamten Batch (unverändertes Alles-oder-nichts).
   */
  async createEntries(inputs: readonly CreateEntryInput[]): Promise<CreateEntriesResult> {
    if (inputs.length === 0) {
      return { success: false, message: 'Keine Positionen zum Loggen.' };
    }

    const userId = this.supabase.userId();
    if (!userId) {
      return { success: false, message: 'Nicht angemeldet.' };
    }

    const ids = inputs.map(() => crypto.randomUUID());
    let attemptsUsed = 0;

    if (this.connectivity.online()) {
      const response = await this.supabase.client
        .from('entries')
        .insert(
          inputs.map((input, i) => ({
            id: ids[i],
            food_id: input.foodId,
            amount_g: input.amountG,
            meal_type: input.mealType,
            date: input.date,
            user_id: userId,
          })),
        )
        .select('id');
      attemptsUsed = 1;

      if (!response.error) {
        this.bumpRevision();
        return { success: true, ids: ((response.data ?? []) as { id: string }[]).map((r) => r.id) };
      }

      const classification = classifyEntryWriteError(response.status, response.error.code);
      if (classification === 'success') {
        // 23505 auf den Batch: die IDs sind bereits vorhanden — ein
        // Wiederholungsversuch gilt als Erfolg (Idempotenz, ADR-0016 Punkt 3).
        this.bumpRevision();
        return { success: true, ids };
      }
      if (classification === 'permanent') {
        return { success: false, message: 'Einträge konnten nicht gespeichert werden.' };
      }
      // temporär → weiter zur Pufferung
    }

    for (let i = 0; i < inputs.length; i += 1) {
      const buffered = await this.bufferCreate(ids[i], inputs[i], attemptsUsed);
      if (!buffered) {
        return { success: false, message: 'Einträge konnten nicht gespeichert werden.' };
      }
    }

    void this.entrySync.runQueue().catch((error: unknown) => {
      console.error('[EntriesService] runQueue fehlgeschlagen (createEntries)', error);
    });
    this.bumpRevision();
    return { success: true, ids };
  }

  /**
   * Ändert Menge und Mahlzeit eines Eintrags (Step B im Bearbeiten-Modus).
   * Liegt die ID noch in der Puffer-Queue, wirkt die Änderung rein lokal auf
   * den Queue-Eintrag (kein zweiter Queue-Eintrag, ADR-0016 Punkt 5) —
   * andernfalls unverändert netzabhängig.
   */
  async updateEntry(entryId: string, input: UpdateEntryInput): Promise<WriteEntryResult> {
    if (this.entryQueue.getById(entryId)) {
      const ok = await this.entryQueue.updateLocal(entryId, input);
      if (!ok) return { success: false, message: 'Eintrag konnte nicht gespeichert werden.' };
      this.bumpRevision();
      return { success: true };
    }

    const response = await this.supabase.client
      .from('entries')
      .update({ amount_g: input.amountG, meal_type: input.mealType })
      .eq('id', entryId);

    if (response.error) {
      return { success: false, message: 'Eintrag konnte nicht gespeichert werden.' };
    }

    this.bumpRevision();
    return { success: true };
  }

  /**
   * Liegt die ID noch in der Puffer-Queue, entfernt das Löschen sie dort
   * ohne Übertragungsversuch (ADR-0016 Punkt 5) — andernfalls unverändert
   * netzabhängig.
   */
  async deleteEntry(entryId: string): Promise<WriteEntryResult> {
    if (this.entryQueue.getById(entryId)) {
      const ok = await this.entryQueue.removeLocal(entryId);
      if (!ok) return { success: false, message: 'Eintrag konnte nicht gelöscht werden.' };
      this.bumpRevision();
      return { success: true };
    }

    const response = await this.supabase.client.from('entries').delete().eq('id', entryId);

    if (response.error) {
      return { success: false, message: 'Eintrag konnte nicht gelöscht werden.' };
    }

    this.bumpRevision();
    return { success: true };
  }

  /**
   * Löscht mehrere Einträge über ihre IDs in einem Vorgang — die Rücknahme
   * einer Massenaktion wie „gestern kopieren" (ADR-0013 Punkt 2), niemals
   * über eine Merkmalssuche. IDs, die noch in der Puffer-Queue liegen,
   * werden lokal entfernt (kein Übertragungsversuch, ADR-0016 Punkt 5); der
   * Rest läuft wie bisher über einen einzigen `.in()`-Request. Bereits
   * anderweitig gelöschte Remote-IDs führen zu **keinem** Fehler: PostgREST
   * löscht die vorhandene Schnittmenge, fehlende Zeilen werden
   * stillschweigend übersprungen. `revision` wird **einmal** erhöht. Leeres
   * Array ist ein defensiver Guard ohne Request.
   */
  async deleteEntries(ids: readonly string[]): Promise<WriteEntryResult> {
    if (ids.length === 0) {
      return { success: false, message: 'Keine Einträge zum Löschen.' };
    }

    const pendingIds = ids.filter((id) => this.entryQueue.getById(id) !== undefined);
    const remoteIds = ids.filter((id) => !pendingIds.includes(id));

    for (const id of pendingIds) {
      await this.entryQueue.removeLocal(id);
    }

    if (remoteIds.length > 0) {
      const response = await this.supabase.client
        .from('entries')
        .delete()
        .in('id', remoteIds as string[]);

      if (response.error) {
        return { success: false, message: 'Einträge konnten nicht gelöscht werden.' };
      }
    }

    this.bumpRevision();
    return { success: true };
  }

  /**
   * Manueller Einzel-Retry für GENAU diesen Eintrag
   * (design-conventions.md „Erneut versuchen", nur im Zustand „dauerhaft
   * gescheitert" sichtbar). Delegiert an `entry-sync.service.ts` — dieser
   * Dienst bleibt der einzige Aufrufer.
   */
  async retryEntry(entryId: string): Promise<void> {
    await this.entrySync.retryOne(entryId);
  }

  /**
   * Puffert einen Anlegevorgang in der Queue. Der Nährwert-Schnappschuss
   * (ADR-0016 Punkt 6) kommt aus dem Sitzungs-Cache von
   * `core/foods.service.ts` — das Food ist dort bereits geladen, weil der
   * Nutzer es in Step A ausgewählt hat (und der Katalog selbst offline über
   * den Lesecache verfügbar bleibt, ADR-0016 Punkt 8). `false`, wenn das
   * Food ausnahmsweise nicht im Cache liegt (defensiver Fallback ohne
   * Snapshot-Grundlage — ohne ihn wäre der Eintrag offline nicht darstellbar).
   */
  private async bufferCreate(
    id: string,
    input: CreateEntryInput,
    attemptsUsed: number,
  ): Promise<boolean> {
    const food = this.coreFoods.foods().find((f) => f.id === input.foodId);
    if (!food) return false;

    await this.entryQueue.enqueue({
      id,
      date: input.date,
      mealType: input.mealType,
      amountG: input.amountG,
      foodId: input.foodId,
      food: {
        id: food.id,
        name: food.name,
        kcal100g: food.kcal100g,
        proteinG100g: food.proteinG100g,
        carbsG100g: food.carbsG100g,
        fatG100g: food.fatG100g,
        source: food.source,
      },
      syncState: 'pending',
      attempts: attemptsUsed,
      createdAt: Date.now(),
    });
    return true;
  }

  private bumpRevision(): void {
    this.revisionState.update((current) => current + 1);
  }
}
