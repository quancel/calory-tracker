import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import {
  isOffProductComplete,
  normalizeOffProduct,
  offProductToCreateForm,
  type CreateFoodFormValues,
} from './food-search.calculations';
import { FoodSearchOffService } from './food-search.off.service';
import type { Food, FoodSource } from '../core/foods.service';
import type { CreateFoodInput } from './models/food.model';

export type SearchFoodsResult =
  { success: true; foods: Food[] } | { success: false; message: string };

export type CreateFoodResult = { success: true; food: Food } | { success: false; message: string };

export type UpdateFoodResult = { success: true; food: Food } | { success: false; message: string };

export type FindByBarcodeResult =
  { success: true; food: Food | null } | { success: false; message: string };

/**
 * Ergebnis eines Barcode-Scans, quellenübergreifend (ADR-0010 Punkt 4/5):
 * - `found`: lokaler DB-Treffer, kein OFF-Aufruf.
 * - `off-complete`: OFF-Treffer mit allen vier Pflichtwerten, bereits mit
 *   `source: 'off'` gespeichert und in den Sitzungs-Cache einzufügen.
 * - `off-incomplete`: OFF-Treffer ohne alle Pflichtwerte, NICHT gespeichert
 *   — `prefill` öffnet Step A2, fehlende Felder bleiben leer.
 * - `not-found`: weder lokal noch bei OFF ein Treffer.
 * - `error`: Netzwerk-/API-Fehler bei OFF (unterschieden von `not-found`,
 *   Akzeptanz).
 */
export type BarcodeLookupResult =
  | { status: 'found'; food: Food }
  | { status: 'off-complete'; food: Food }
  | { status: 'off-incomplete'; prefill: CreateFoodFormValues }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

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
 * Schreibweg auf `foods` ("FoodRepository", ADR-0008 Punkt 2) sowie
 * einziger Zugang zu Open Food Facts und zum Barcode-Lookup. Der
 * Katalog-Lesepfad/Sitzungs-Cache liegt seit Paket 010 in
 * `core/foods.service.ts` (ADR-0012 Punkt 1) — `food-search.store.ts` ruft
 * dafür nicht mehr `search()` auf dieser Datei, sondern
 * `CoreFoodsService.ensureLoaded()`. Seit Paket 008 kapselt diese Datei
 * zusätzlich die Reihenfolge der Quellen für den Barcode-Scan (lokal → Open
 * Food Facts → manuelles Anlegen, ADR-0010 Punkt 4): `food-search.off.service.ts`
 * wird ausschließlich von hier aus aufgerufen.
 *
 * Kein `user_id`-Filter (Context-Map: `foods` ist gemeinsamer Bestand
 * beider Nutzer, RLS regelt Sichtbarkeit serverseitig — `foods_select`).
 */
@Injectable({ providedIn: 'root' })
export class FoodSearchService {
  private readonly supabase = inject(SupabaseService);
  private readonly offService = inject(FoodSearchOffService);

  /**
   * Lädt den lokalen Food-Bestand, quellenunabhängig. Bleibt aus
   * API-Kompatibilitätsgründen erhalten, wird aber seit Paket 010
   * (ADR-0012 Punkt 1) operativ nicht mehr aufgerufen — der Katalog-
   * Lesepfad läuft über `core/foods.service.ts`. `query` wird bewusst
   * NICHT serverseitig ausgewertet (ADR-0008 Punkt 3: kein `ilike` je
   * Tastendruck).
   */
  async search(_query: string): Promise<SearchFoodsResult> {
    const response = await this.supabase.client.from('foods').select(FOOD_COLUMNS).order('name');

    if (response.error) {
      return { success: false, message: 'Foods konnten nicht geladen werden.' };
    }

    const rows = (response.data ?? []) as unknown as RawFoodRow[];
    return { success: true, foods: rows.map(toFood) };
  }

  /**
   * Löst einen gescannten Barcode gezielt an der Datenbank auf — NICHT am
   * Sitzungs-Cache (ADR-0010 Punkt 4: `barcode` ist `unique`, der Cache
   * kennt nicht alle Datensätze, z. B. vom zweiten Nutzer angelegte).
   */
  async findByBarcode(barcode: string): Promise<FindByBarcodeResult> {
    const response = await this.supabase.client
      .from('foods')
      .select(FOOD_COLUMNS)
      .eq('barcode', barcode)
      .maybeSingle();

    if (response.error) {
      return { success: false, message: 'Food konnte nicht geladen werden.' };
    }

    const raw = response.data as unknown as RawFoodRow | null;
    return { success: true, food: raw ? toFood(raw) : null };
  }

  /**
   * Reihenfolge der Quellen für einen gescannten Barcode (ADR-0010 Punkt
   * 4/5): zuerst die Datenbank, dann — nur bei keinem lokalen Treffer —
   * Open Food Facts. Ein vollständiger OFF-Treffer wird sofort mit
   * `source: 'off'` gespeichert; ein unvollständiger wird NICHT
   * gespeichert, sondern als Vorbelegung für Step A2 zurückgegeben.
   */
  async lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
    const localResult = await this.findByBarcode(barcode);
    if (!localResult.success) {
      return { status: 'error', message: localResult.message };
    }
    if (localResult.food) {
      return { status: 'found', food: localResult.food };
    }

    const offResult = await this.offService.fetchProductByBarcode(barcode);
    if (offResult.status === 'not-found') {
      return { status: 'not-found' };
    }
    if (offResult.status === 'error') {
      return { status: 'error', message: offResult.message };
    }

    const normalized = normalizeOffProduct(offResult.product, barcode);
    if (!isOffProductComplete(normalized)) {
      return { status: 'off-incomplete', prefill: offProductToCreateForm(normalized) };
    }

    const created = await this.createFoodFromOff({
      name: normalized.name,
      kcal100g: normalized.kcal100g,
      proteinG100g: normalized.proteinG100g,
      carbsG100g: normalized.carbsG100g,
      fatG100g: normalized.fatG100g,
      defaultPortionG: null,
      barcode: normalized.barcode,
    });
    if (!created.success) {
      return { status: 'error', message: created.message };
    }
    return { status: 'off-complete', food: created.food };
  }

  /**
   * Legt ein neues Food manuell an (Step A2). `source` wird explizit auf
   * `'manual'` gesetzt — auch wenn `input.barcode` gesetzt ist (ein
   * unvollständiger OFF-Treffer wurde vom Nutzer ergänzt, ADR-0010 Punkt
   * 5: `source` bildet die Herkunft der Werte ab, nicht nur den Barcode).
   */
  async createFood(input: CreateFoodInput): Promise<CreateFoodResult> {
    return this.insertFood(input, 'manual');
  }

  /**
   * Legt ein vollständiges Open-Food-Facts-Produkt automatisch an
   * (ADR-0010 Punkt 5) — nur für Treffer mit allen vier Pflichtwerten,
   * ausschließlich von `lookupBarcode()` aufgerufen.
   */
  async createFoodFromOff(input: CreateFoodInput): Promise<CreateFoodResult> {
    return this.insertFood(input, 'off');
  }

  /**
   * Korrigiert ein bestehendes Food (Step C, ADR-0011 Punkt 6) — einziger
   * Schreibweg auf ein bereits gespeichertes Food. Schreibt die neuen
   * Nährwerte/Name/Standardportion/Barcode UND `is_corrected = true` im
   * selben `update`-Statement (ein Roundtrip, kein Zwei-Schritt, der halb
   * scheitern kann). `is_corrected` wird dabei IMMER auf `true` gesetzt —
   * das ist die Vorrangsperre für künftige automatische Schreiber
   * (ADR-0011 Punkt 7: kein automatischer Schreibweg überschreibt danach
   * dieses Food); dieses Verhalten darf bei einer künftigen Erweiterung
   * (z. B. einem OFF-Refresh-Pfad) nicht versehentlich bedingt gemacht
   * werden. `source` bleibt unverändert (nicht Teil des Payloads) — eine
   * Korrektur ändert die Herkunft der ursprünglichen Werte nicht.
   */
  async updateFood(id: string, input: CreateFoodInput): Promise<UpdateFoodResult> {
    const payload = {
      name: input.name,
      kcal_100g: input.kcal100g,
      protein_100g: input.proteinG100g,
      carbs_100g: input.carbsG100g,
      fat_100g: input.fatG100g,
      default_portion_g: input.defaultPortionG,
      barcode: input.barcode,
      is_corrected: true,
    };

    const response = await this.supabase.client
      .from('foods')
      .update(payload)
      .eq('id', id)
      .select(FOOD_COLUMNS)
      .single();

    if (response.error || !response.data) {
      return { success: false, message: 'Food konnte nicht aktualisiert werden.' };
    }

    return { success: true, food: toFood(response.data as unknown as RawFoodRow) };
  }

  private async insertFood(input: CreateFoodInput, source: FoodSource): Promise<CreateFoodResult> {
    const payload = {
      name: input.name,
      kcal_100g: input.kcal100g,
      protein_100g: input.proteinG100g,
      carbs_100g: input.carbsG100g,
      fat_100g: input.fatG100g,
      default_portion_g: input.defaultPortionG,
      source,
      barcode: input.barcode,
    };

    const response = await this.supabase.client
      .from('foods')
      .insert(payload)
      .select(FOOD_COLUMNS)
      .single();

    if (response.error || !response.data) {
      return { success: false, message: 'Food konnte nicht angelegt werden.' };
    }

    return { success: true, food: toFood(response.data as unknown as RawFoodRow) };
  }
}
