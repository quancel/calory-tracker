import { Injectable, inject, signal } from '@angular/core';
import { FOODS_SNAPSHOT_STORE, LocalDbService } from './local-db.service';
import { SupabaseService } from './supabase.service';

/**
 * Katalog-Lesepfad + Sitzungs-Cache (ADR-0012 Punkt 1, löst ADR-0008 Punkt 3
 * ab). Genau EIN Food-Cache im Projekt — `FoodSearchStore` (`food-catalog`)
 * und `MealsStore` (`meals`) filtern beide über `foods()` mit je eigener
 * Query, keine eigene Katalog-Query in einem Feature.
 *
 * Schreiben (Anlegen, Korrigieren) sowie Open-Food-Facts-Lookup und
 * Barcode-Auflösung bleiben ausschließlich in
 * `food-search/food-search.service.ts` — dieser Dienst kennt keine dieser
 * Operationen. `upsertFood()` dient ausschließlich der In-Place-Pflege des
 * Caches NACH einem Schreibvorgang dort (kein eigener Schreibweg auf
 * `foods`).
 *
 * Ab Paket PO-2026-09-20-014 (ADR-0016 Punkt 8): nach jedem erfolgreichen
 * Laden wird der Bestand als Schnappschuss in `core/local-db.service.ts`
 * abgelegt. Scheitert ein Ladeversuch (offline, Netzwerkfehler), wird dieser
 * Schnappschuss als Anzeige-Ersatz verwendet, statt einen Fehlerzustand zu
 * zeigen — nur so kann offline nach einem App-Neustart überhaupt ein
 * Eintrag angelegt werden (der Katalog wäre sonst leer). Die Netzabfrage
 * selbst bleibt unverändert.
 */

export type FoodSource = 'off' | 'manual';

export interface Food {
  id: string;
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
  /** `null` = „nicht gesetzt" — nie `100` als Ersatzwert (ADR-0008 Punkt 5). */
  defaultPortionG: number | null;
  source: FoodSource;
  /** `null` = kein Barcode hinterlegt. `foods.barcode` ist `unique` (ADR-0010 Punkt 4). */
  barcode: string | null;
  /**
   * Sperre für automatische Schreiber (ADR-0011 Punkt 7) — KEIN UI-Element,
   * reine Datenlogik: kein künftiger automatischer Schreibweg darf ein Food
   * mit `isCorrected === true` überschreiben. Wird nur von
   * `FoodSearchService.updateFood()` auf `true` gesetzt.
   */
  isCorrected: boolean;
}

interface RawFoodRow {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  default_portion_g: number | null;
  source: FoodSource | null;
  barcode: string | null;
  is_corrected: boolean;
}

const FOOD_COLUMNS =
  'id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, default_portion_g, source, barcode, is_corrected';

/** Fester Schlüssel des Food-Schnappschusses (ein Bestand, kein Datumsbezug, ADR-0016 Punkt 8). */
const FOODS_SNAPSHOT_KEY = 'current';

function toFood(raw: RawFoodRow): Food {
  return {
    id: raw.id,
    name: raw.name,
    kcal100g: raw.kcal_100g,
    proteinG100g: raw.protein_100g,
    carbsG100g: raw.carbs_100g,
    fatG100g: raw.fat_100g,
    defaultPortionG: raw.default_portion_g,
    source: raw.source ?? 'manual',
    barcode: raw.barcode,
    isCorrected: raw.is_corrected,
  };
}

/**
 * `providedIn: 'root'`, damit der Sitzungs-Cache über mehrfaches
 * Öffnen/Schließen von Sheets/Routen hinweg bestehen bleibt (ADR-0008 Punkt
 * 3, fortgeschrieben in ADR-0012 Punkt 1): `foods` wird nur beim
 * allerersten `ensureLoaded()`-Aufruf einer Sitzung geladen, jede weitere
 * Filterung läuft rein im Speicher (kein `ilike` je Tastendruck, kein
 * Debounce).
 *
 * Kein `user_id`-Filter (Context-Map: `foods` ist gemeinsamer Bestand
 * beider Nutzer, RLS regelt Sichtbarkeit serverseitig — `foods_select`).
 */
@Injectable({ providedIn: 'root' })
export class CoreFoodsService {
  private readonly supabase = inject(SupabaseService);
  private readonly localDb = inject(LocalDbService);

  private readonly foodsState = signal<Food[]>([]);
  private readonly sessionLoadedState = signal(false);
  private readonly loadingState = signal(false);
  private readonly loadErrorState = signal<string | null>(null);

  readonly foods = this.foodsState.asReadonly();
  /** `true` nur während des allerersten Ladevorgangs einer Sitzung (Skeleton-Bedingung). */
  readonly loading = this.loadingState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  /** `true` nach einem erfolgreichen Ladevorgang dieser Sitzung — steuert z. B. Leerzustände in aufrufenden Stores. */
  readonly loaded = this.sessionLoadedState.asReadonly();

  /** Lädt den Food-Bestand genau einmal je Sitzung. Erneuter Aufruf ohne `retryLoad()` ist ein No-op. */
  async ensureLoaded(): Promise<void> {
    if (this.sessionLoadedState() || this.loadingState()) return;
    await this.load();
  }

  /** Erneuter Ladeversuch nach einem Fehler (Retry-Button im Fehlerzustand). */
  async retryLoad(): Promise<void> {
    await this.load();
  }

  /** Fügt ein neues Food an (kein Neuladen) oder aktualisiert ein bestehendes in place — aufgerufen NACH einem Schreibvorgang in `food-search.service.ts`. */
  upsertFood(food: Food): void {
    this.foodsState.update((current) => {
      const index = current.findIndex((existing) => existing.id === food.id);
      if (index === -1) return [...current, food];
      const next = [...current];
      next[index] = food;
      return next;
    });
  }

  private async load(): Promise<void> {
    this.loadingState.set(true);
    this.loadErrorState.set(null);

    const response = await this.supabase.client.from('foods').select(FOOD_COLUMNS).order('name');

    this.loadingState.set(false);

    if (response.error) {
      // Lesecache-Fallback (ADR-0016 Punkt 8): zeigt den zuletzt geladenen
      // Bestand statt eines Fehlerzustands, wenn einer vorliegt — reiner
      // Anzeige-Ersatz, nie Schreibquelle.
      const snapshot = await this.localDb.get<Food[]>(FOODS_SNAPSHOT_STORE, FOODS_SNAPSHOT_KEY);
      if (snapshot && snapshot.length > 0) {
        this.foodsState.set(snapshot);
        this.sessionLoadedState.set(true);
        return;
      }
      this.loadErrorState.set('Foods konnten nicht geladen werden.');
      return;
    }

    const foods = ((response.data ?? []) as unknown as RawFoodRow[]).map(toFood);
    this.foodsState.set(foods);
    this.sessionLoadedState.set(true);
    await this.localDb.put(FOODS_SNAPSHOT_STORE, foods, FOODS_SNAPSHOT_KEY);
  }
}
