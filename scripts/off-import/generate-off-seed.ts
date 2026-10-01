/**
 * OFF-DACH-Import: liest den Open-Food-Facts-Bulk-Export
 * (`openfoodfacts-products.jsonl.gz`), gestreamt (Datei → gunzip → Zeilen),
 * und schreibt Chargen-SQL nach `supabase/data/off-dach/` (gitignored,
 * ADR-0022). Nur I/O — alle Regeln in `off-import.calculations.ts`.
 *
 * Aufruf (siehe README „Lebensmittel-Import"):
 *   npm run off-import:generate -- --input <pfad>/openfoodfacts-products.jsonl.gz
 * Optionen: --out <verzeichnis>, --tolerate-truncated (abgeschnittene .gz-Datei,
 *   z. B. Teilabruf für einen Stichprobenlauf, nicht für den echten Import).
 * Kein Netzzugriff, keine Zugangsdaten.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { constants as zlibConstants, createGunzip } from 'node:zlib';

import {
  OFF_OUTPUT_DIR,
  addProduct,
  buildChunkSql,
  chunkFileName,
  classifyOffRecord,
  createStats,
  formatStats,
  mightBeDach,
  planChunks,
  renderValueRow,
  sortProducts,
  utf8ByteLength,
  type ImportProduct,
  type ImportStats,
} from './off-import.calculations.ts';

export interface CliOptions {
  readonly input: string;
  readonly out: string;
  readonly tolerateTruncated: boolean;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  let input = '';
  let out = OFF_OUTPUT_DIR;
  let tolerateTruncated = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') input = argv[++i] ?? '';
    else if (arg === '--out') out = argv[++i] ?? '';
    else if (arg === '--tolerate-truncated') tolerateTruncated = true;
    else throw new Error(`Unbekanntes Argument: ${arg}`);
  }
  if (input === '') {
    throw new Error('Pflichtargument fehlt: --input <pfad>/openfoodfacts-products.jsonl.gz');
  }
  if (out === '') throw new Error('--out braucht ein Verzeichnis.');
  return { input, out, tolerateTruncated };
}

async function readProducts(
  options: CliOptions,
): Promise<{ products: Map<string, ImportProduct>; stats: ImportStats }> {
  const stats = createStats();
  const collected = new Map<string, ImportProduct>();

  const gunzip = createGunzip(
    options.tolerateTruncated ? { finishFlush: zlibConstants.Z_SYNC_FLUSH } : {},
  );
  const source = createReadStream(options.input);
  source.on('error', (error) => gunzip.destroy(error));
  const lines = createInterface({ input: source.pipe(gunzip), crlfDelay: Infinity });

  for await (const line of lines) {
    if (line.trim() === '') continue;
    stats.linesRead++;
    if (!mightBeDach(line)) {
      stats.prefiltered++;
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      stats.rejected['parse-error']++;
      continue;
    }
    const result = classifyOffRecord(raw);
    if (result.kind === 'rejected') {
      stats.rejected[result.reason]++;
      continue;
    }
    stats.accepted++;
    if (result.nutritionSource === 'nutrition') stats.acceptedFromNutrition++;
    const outcome = addProduct(collected, result.product);
    if (outcome === 'replaced') stats.replacedDuplicates++;
    else if (outcome === 'duplicate') stats.droppedDuplicates++;
  }
  return { products: collected, stats };
}

/** Entfernt nur frühere Chargen-Dateien (`off-dach-NNNN.sql`), nie fremde Dateien im Verzeichnis. */
async function removeOldChunks(dir: string): Promise<void> {
  for (const name of await readdir(dir)) {
    if (/^off-dach-\d{4}\.sql$/.test(name)) await rm(resolve(dir, name));
  }
}

export async function run(argv: readonly string[], print: (line: string) => void): Promise<void> {
  const options = parseArgs(argv);
  const { products, stats } = await readProducts(options);

  const sorted = sortProducts(products.values());
  const chunks = planChunks(sorted.map(renderValueRow));

  const dir = resolve(options.out);
  await mkdir(dir, { recursive: true });
  await removeOldChunks(dir);

  let largestChunkBytes = 0;
  for (const [i, rows] of chunks.entries()) {
    const sql = buildChunkSql(rows, i + 1, chunks.length);
    largestChunkBytes = Math.max(largestChunkBytes, utf8ByteLength(sql));
    await writeFile(resolve(dir, chunkFileName(i + 1)), sql, 'utf8');
  }

  for (const line of formatStats(stats, {
    products: sorted,
    chunkCount: chunks.length,
    largestChunkBytes,
  })) {
    print(line);
  }
  print(`Ausgabe: ${dir}`);
}

// Nur als Skript starten, nicht beim Import aus einer Spec.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2), (line) => console.log(line)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
