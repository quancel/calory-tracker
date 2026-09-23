import { Injectable } from '@angular/core';

/**
 * Zweite Katalogquelle: Open Food Facts (ADR-0010 Punkt 3). Natives `fetch`
 * mit `AbortSignal.timeout(…)`, kein `HttpClient` (code-conventions.md
 * „Externe HTTP-APIs"). Wird ausschließlich von `food-search.service.ts`
 * aufgerufen — Store und Komponenten sprechen nie direkt mit dieser Datei
 * (Context-Map). Liefert die Rohantwort; die reine Umrechnung auf
 * 100g-Werte liegt in `food-search.calculations.ts`.
 */

/**
 * Technischer Betriebswert dieses Dienstes (kein fachlicher Grenzwert),
 * deshalb hier und nicht in `food-search.calculations.ts` oder
 * `core/*.constants.ts` (code-conventions.md „Wo was hingehört").
 */
export const OFF_REQUEST_TIMEOUT_MS = 8_000;

const OFF_API_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,nutriments';

export interface OffRawNutriments {
  'energy-kcal_100g'?: number;
  energy_100g?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
}

export interface OffRawProduct {
  product_name?: string;
  nutriments?: OffRawNutriments;
}

interface OffApiResponse {
  status?: number;
  product?: OffRawProduct;
}

export type OffLookupResult =
  | { status: 'found'; product: OffRawProduct }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

const OFF_UNREACHABLE_MESSAGE = 'Open Food Facts ist gerade nicht erreichbar.';

@Injectable({ providedIn: 'root' })
export class FoodSearchOffService {
  /**
   * Fragt genau ein Produkt per Barcode ab. `status: 'not-found'` deckt
   * sowohl einen HTTP-404 als auch eine OFF-Antwort ohne Produkt ab
   * (`body.status !== 1`) — beides bedeutet „kein OFF-Treffer", nicht
   * „Fehler" (ADR-0010 Punkt 5, Akzeptanz: kein Treffer/API-Fehler werden
   * unterschieden).
   */
  async fetchProductByBarcode(barcode: string): Promise<OffLookupResult> {
    let response: Response;
    try {
      response = await fetch(
        `${OFF_API_BASE_URL}/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`,
        { signal: AbortSignal.timeout(OFF_REQUEST_TIMEOUT_MS) },
      );
    } catch {
      return { status: 'error', message: OFF_UNREACHABLE_MESSAGE };
    }

    if (response.status === 404) {
      return { status: 'not-found' };
    }
    if (!response.ok) {
      return { status: 'error', message: OFF_UNREACHABLE_MESSAGE };
    }

    let body: OffApiResponse;
    try {
      body = (await response.json()) as OffApiResponse;
    } catch {
      return { status: 'error', message: OFF_UNREACHABLE_MESSAGE };
    }

    if (body.status !== 1 || !body.product) {
      return { status: 'not-found' };
    }
    return { status: 'found', product: body.product };
  }
}
