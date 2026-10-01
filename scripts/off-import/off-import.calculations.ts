/**
 * Reine Logik des OFF-DACH-Imports (ADR-0022) — kein `node:`-Import, kein I/O.
 * Ein-/Ausgabe (Dateien, gzip, Argumente, Statistik-Ausgabe) liegt in
 * `generate-off-seed.ts`.
 *
 * Die fachlichen Regeln werden IMPORTIERT, nie kopiert (ADR-0022 Punkt 3):
 * kJ→kcal/100g-Werte/Vollständigkeit aus `food-search.calculations.ts`,
 * Plausibilität aus `core/foods.calculations.ts`, Barcode-Form wie im Scan.
 */

import {
  barcodeLookupKeys,
  isOffProductComplete,
  normalizeBarcode,
  normalizeOffProduct,
  type OffProductRaw,
} from '../../src/app/food-search/food-search.calculations.ts';
import { findPlausibilityFindings } from '../../src/app/core/foods.calculations.ts';

/** Zeilen je Charge (ADR-0022 Punkt 6). */
export const OFF_ROWS_PER_CHUNK = 5000;
/** Harte Obergrenze je Chargen-Datei in Bytes (weit unter dem GitHub-Grenzwert, ADR-0022 Punkt 5). */
export const OFF_MAX_CHUNK_BYTES = 50 * 1024 * 1024;
/** Ausgabeort der Chargen (gitignored, ADR-0022 Punkt 7). */
export const OFF_OUTPUT_DIR = 'supabase/data/off-dach';
/** Obergrenze für `off_popularity` (Postgres `integer`). */
export const OFF_MAX_POPULARITY = 2147483647;
/** Migration, die die Charge voraussetzt (Spalte `off_popularity`, ADR-0020). */
export const OFF_REQUIRED_MIGRATION = '20260930090000';
/** `statement_timeout` je Charge. */
export const OFF_STATEMENT_TIMEOUT = '10min';

/** Länder des DACH-Imports als OFF-`countries_tags`. */
export const DACH_COUNTRY_TAGS: readonly string[] = ['en:germany', 'en:austria', 'en:switzerland'];

/** Ablehnungsgründe in Prüfreihenfolge (erste zutreffende Stufe gewinnt). */
export const REJECT_REASONS = [
  'parse-error',
  'not-dach',
  'no-barcode',
  'no-name',
  'incomplete',
  'implausible',
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export interface ImportProduct {
  /** Kanonische Barcode-Form (`normalizeBarcode`) — die einzige Form, die der Import schreibt. */
  readonly barcode: string;
  /** „Produktname (Marke)". */
  readonly name: string;
  readonly kcal100g: number;
  readonly proteinG100g: number;
  readonly carbsG100g: number;
  readonly fatG100g: number;
  /** OFF `unique_scans_n`; fehlt es → 0, nie konstant (ADR-0020 Punkt 2). */
  readonly popularity: number;
}

export type Classification =
  | { readonly kind: 'accepted'; readonly product: ImportProduct }
  | { readonly kind: 'rejected'; readonly reason: RejectReason };

/** Substring-Vorfilter: Zeilen ohne eines der Länder-Tags brauchen kein `JSON.parse` (ADR-0022 Punkt 2). */
export function mightBeDach(line: string): boolean {
  return DACH_COUNTRY_TAGS.some((tag) => line.includes(tag));
}

/** Endliche Zahl oder `undefined` — OFF-JSONL führt Werte teils als Zeichenkette; nicht-numerisch = fehlend, nie 0. */
export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** `unique_scans_n` als endliche ganze Zahl ≥ 0, auf `OFF_MAX_POPULARITY` begrenzt; sonst 0. */
export function toPopularity(value: unknown): number {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, OFF_MAX_POPULARITY);
}

/** Leerraum und Steuerzeichen (inkl. NUL, das Postgres-Text nicht kennt) zu einem Leerzeichen. */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
}

/** „Produktname (Marke)"; deutscher Name bevorzugt, sonst allgemeiner; Marke = erste aus `brands`; ohne Name → ''. */
export function composeName(raw: Record<string, unknown>): string {
  const name = cleanText(raw['product_name_de']) || cleanText(raw['product_name']);
  if (name === '') return '';
  const brandSource = typeof raw['brands'] === 'string' ? raw['brands'].split(',')[0] : '';
  const brand = cleanText(brandSource);
  return brand === '' ? name : `${name} (${brand})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDach(raw: Record<string, unknown>): boolean {
  const tags = raw['countries_tags'];
  return Array.isArray(tags) && tags.some((tag) => DACH_COUNTRY_TAGS.includes(tag as string));
}

/**
 * Klassifiziert ein geparstes OFF-Produkt (Reihenfolge = `REJECT_REASONS`):
 * kein DACH-Land → kein kanonischer Barcode → kein Name → ein Nährwert fehlt →
 * unplausibel (negativer Rohwert VOR der Normalisierung, sonst
 * `findPlausibilityFindings`). Alles andere wird übernommen.
 */
export function classifyOffRecord(raw: unknown): Classification {
  if (!isRecord(raw)) return { kind: 'rejected', reason: 'parse-error' };
  if (!isDach(raw)) return { kind: 'rejected', reason: 'not-dach' };

  const rawCode = typeof raw['code'] === 'string' ? raw['code'] : raw['_id'];
  const barcode = typeof rawCode === 'string' ? normalizeBarcode(rawCode) : null;
  if (barcode === null) return { kind: 'rejected', reason: 'no-barcode' };

  const name = composeName(raw);
  if (name === '') return { kind: 'rejected', reason: 'no-name' };

  const nutriments = isRecord(raw['nutriments']) ? raw['nutriments'] : {};
  const kcal = toFiniteNumber(nutriments['energy-kcal_100g']);
  const kj = toFiniteNumber(nutriments['energy_100g']);
  const protein = toFiniteNumber(nutriments['proteins_100g']);
  const carbs = toFiniteNumber(nutriments['carbohydrates_100g']);
  const fat = toFiniteNumber(nutriments['fat_100g']);

  // Der Energiewert, den die Normalisierung verwenden würde: kcal, sonst kJ.
  const usedEnergy = kcal ?? kj;
  const hasNegative = [usedEnergy, protein, carbs, fat].some(
    (value) => value !== undefined && value < 0,
  );

  const rawProduct: OffProductRaw = {
    product_name: name,
    nutriments: {
      ...(kcal !== undefined ? { 'energy-kcal_100g': kcal } : {}),
      ...(kj !== undefined ? { energy_100g: kj } : {}),
      ...(protein !== undefined ? { proteins_100g: protein } : {}),
      ...(carbs !== undefined ? { carbohydrates_100g: carbs } : {}),
      ...(fat !== undefined ? { fat_100g: fat } : {}),
    },
  };
  const product = normalizeOffProduct(rawProduct, barcode);

  // Ein negativer Rohwert würde zu `null` normalisiert und als „fehlend"
  // erscheinen — er ist aber unplausibel (ADR-0022 Punkt 3).
  if (hasNegative) return { kind: 'rejected', reason: 'implausible' };
  if (!isOffProductComplete(product)) return { kind: 'rejected', reason: 'incomplete' };

  const findings = findPlausibilityFindings({
    kcal100g: product.kcal100g,
    proteinG100g: product.proteinG100g,
    carbsG100g: product.carbsG100g,
    fatG100g: product.fatG100g,
  });
  if (findings.length > 0) return { kind: 'rejected', reason: 'implausible' };

  return {
    kind: 'accepted',
    product: {
      barcode: product.barcode,
      name: product.name,
      kcal100g: product.kcal100g,
      proteinG100g: product.proteinG100g,
      carbsG100g: product.carbsG100g,
      fatG100g: product.fatG100g,
      popularity: toPopularity(raw['unique_scans_n']),
    },
  };
}

/**
 * Behält je kanonischem Barcode genau ein Produkt: höheres `popularity`,
 * bei Gleichstand das zuerst gelesene (ADR-0022 Punkt 6). Rückgabe: ob der
 * Kandidat aufgenommen wurde (neu oder als Ersatz) und ob er einen Vorgänger
 * verdrängt hat.
 */
export function addProduct(
  collected: Map<string, ImportProduct>,
  candidate: ImportProduct,
): 'added' | 'replaced' | 'duplicate' {
  const existing = collected.get(candidate.barcode);
  if (existing === undefined) {
    collected.set(candidate.barcode, candidate);
    return 'added';
  }
  if (candidate.popularity > existing.popularity) {
    collected.set(candidate.barcode, candidate);
    return 'replaced';
  }
  return 'duplicate';
}

/** off_popularity absteigend, Barcode aufsteigend (Codepoint-Vergleich, kein Locale) — deterministisch. */
export function sortProducts(products: Iterable<ImportProduct>): ImportProduct[] {
  return [...products].sort((a, b) => {
    if (a.popularity !== b.popularity) return b.popularity - a.popularity;
    return a.barcode < b.barcode ? -1 : a.barcode > b.barcode ? 1 : 0;
  });
}

// --- SQL --------------------------------------------------------------------

export function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Nicht endlicher Zahlenwert: ${value}`);
  return String(value);
}

/** Eine `values`-Zeile: (name, barcode, keys, kcal, protein, carbs, fat, popularity). */
export function renderValueRow(product: ImportProduct): string {
  const keys = barcodeLookupKeys(product.barcode).map(sqlText).join(', ');
  return (
    `(${sqlText(product.name)}, ${sqlText(product.barcode)}, array[${keys}]::text[], ` +
    `${sqlNumber(product.kcal100g)}::numeric, ${sqlNumber(product.proteinG100g)}::numeric, ` +
    `${sqlNumber(product.carbsG100g)}::numeric, ${sqlNumber(product.fatG100g)}::numeric, ` +
    `${sqlNumber(product.popularity)}::integer)`
  );
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Teilt gerenderte Zeilen in Chargen: höchstens `maxRows` Zeilen UND höchstens
 * `maxBytes` Bytes (Zeilen + Kommafugen; der feste Kopf/Fuß ist klein gegen die
 * Grenze und mit `CHUNK_OVERHEAD_BYTES` reserviert).
 */
export const CHUNK_OVERHEAD_BYTES = 4096;
export function planChunks(
  rows: readonly string[],
  maxRows: number = OFF_ROWS_PER_CHUNK,
  maxBytes: number = OFF_MAX_CHUNK_BYTES,
): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let bytes = CHUNK_OVERHEAD_BYTES;
  for (const row of rows) {
    const rowBytes = utf8ByteLength(row) + 2; // ",\n"
    if (current.length > 0 && (current.length >= maxRows || bytes + rowBytes > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = CHUNK_OVERHEAD_BYTES;
    }
    current.push(row);
    bytes += rowBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Dateiname `off-dach-<NNNN>.sql` (1-basiert, vierstellig). */
export function chunkFileName(index: number): string {
  return `off-dach-${String(index).padStart(4, '0')}.sql`;
}

/**
 * Eine Chargen-Datei (ADR-0022 Punkt 5): reine DML in EINER Transaktion mit
 * EINEM Statement. Einfügen nur, wo kein Food mit einem der Lookup-Schlüssel
 * existiert; danach ausschließlich `off_popularity` bestehender Foods. Kein
 * DDL, kein Zeitstempel (byte-gleiche Ausgabe bei gleicher Eingabe).
 */
export function buildChunkSql(rows: readonly string[], index: number, total: number): string {
  return [
    '-- Open Food Facts, DACH-Produkte (Deutschland, Österreich, Schweiz)',
    '-- Quelle: Open Food Facts (https://world.openfoodfacts.org), Lizenz ODbL 1.0 / DbCL 1.0',
    `-- Charge ${index}/${total}, ${rows.length} Zeilen`,
    `-- Voraussetzung: Migration ${OFF_REQUIRED_MIGRATION} (foods.off_popularity)`,
    '-- Erzeugt von scripts/off-import (npm run off-import:generate); nicht von Hand editieren.',
    '-- Wiederholt einspielbar: bestehende Foods bleiben bis auf off_popularity unberührt.',
    'begin;',
    `set local statement_timeout = '${OFF_STATEMENT_TIMEOUT}';`,
    'with v(name, barcode, keys, kcal_100g, protein_100g, carbs_100g, fat_100g, off_popularity) as (',
    'values',
    rows.join(',\n'),
    '),',
    'ins as (',
    '  insert into public.foods (name, barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, source, off_popularity)',
    "  select v.name, v.barcode, v.kcal_100g, v.protein_100g, v.carbs_100g, v.fat_100g, 'off', v.off_popularity",
    '  from v',
    '  where not exists (select 1 from public.foods f where f.barcode = any(v.keys))',
    '  on conflict (barcode) do nothing',
    '  returning barcode',
    ')',
    'update public.foods f set off_popularity = v.off_popularity',
    'from v',
    'where f.barcode = any(v.keys) and f.off_popularity <> v.off_popularity;',
    'commit;',
    '',
  ].join('\n');
}

// --- Statistik ---------------------------------------------------------------

export interface ImportStats {
  linesRead: number;
  /** Per Substring-Vorfilter ohne `JSON.parse` übersprungen. */
  prefiltered: number;
  accepted: number;
  rejected: Record<RejectReason, number>;
  /** Kandidat verdrängte einen Vorgänger mit gleichem kanonischem Barcode. */
  replacedDuplicates: number;
  /** Kandidat verworfen, Vorgänger blieb. */
  droppedDuplicates: number;
}

export function createStats(): ImportStats {
  return {
    linesRead: 0,
    prefiltered: 0,
    accepted: 0,
    rejected: Object.fromEntries(REJECT_REASONS.map((reason) => [reason, 0])) as Record<
      RejectReason,
      number
    >,
    replacedDuplicates: 0,
    droppedDuplicates: 0,
  };
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '-' : `${((part / whole) * 100).toFixed(1)} %`;
}

export interface OutputSummary {
  readonly products: readonly ImportProduct[];
  readonly chunkCount: number;
  readonly largestChunkBytes: number;
}

/** Statistik als Textzeilen für stdout. */
export function formatStats(stats: ImportStats, output: OutputSummary): string[] {
  const dachParsed = stats.linesRead - stats.prefiltered - stats.rejected['parse-error'] - stats.rejected['not-dach'];
  const dachRejected =
    stats.rejected['no-barcode'] +
    stats.rejected['no-name'] +
    stats.rejected['incomplete'] +
    stats.rejected['implausible'];
  const withScans = output.products.filter((product) => product.popularity > 0).length;
  const lines = [
    `Zeilen gelesen:                 ${stats.linesRead}`,
    `  per Vorfilter übersprungen:   ${stats.prefiltered}`,
    `  nicht lesbar (parse-error):   ${stats.rejected['parse-error']}`,
    `  kein DACH-Land:               ${stats.rejected['not-dach']}`,
    `DACH-Produkte geprüft:          ${dachParsed}`,
    `  verworfen, kein Barcode:      ${stats.rejected['no-barcode']}`,
    `  verworfen, kein Name:         ${stats.rejected['no-name']}`,
    `  verworfen, unvollständig:     ${stats.rejected['incomplete']}`,
    `  verworfen, unplausibel:       ${stats.rejected['implausible']} (${percent(stats.rejected['implausible'], dachParsed)} der DACH-Produkte, ${percent(stats.rejected['implausible'], dachParsed - stats.rejected['no-barcode'] - stats.rejected['no-name'] - stats.rejected['incomplete'])} der vollständigen)`,
    `  übernommen:                   ${stats.accepted} (${percent(stats.accepted, dachParsed)}; verworfen gesamt ${dachRejected})`,
    `  Dubletten (gleicher Barcode): ${stats.replacedDuplicates + stats.droppedDuplicates} (${stats.replacedDuplicates} ersetzt, ${stats.droppedDuplicates} verworfen)`,
    `Geschrieben:                    ${output.products.length} Produkte in ${output.chunkCount} Chargen`,
    `  mit unique_scans_n > 0:       ${withScans} (${percent(withScans, output.products.length)})`,
    `  höchste Beliebtheit:          ${output.products[0]?.popularity ?? '-'}`,
    `  größte Charge:                ${(output.largestChunkBytes / 1024 / 1024).toFixed(2)} MB`,
  ];
  return lines;
}
