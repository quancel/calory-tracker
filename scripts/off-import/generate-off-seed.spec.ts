import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { parseArgs, run } from './generate-off-seed.ts';

const FIXTURE = new URL('./fixtures/off-sample.jsonl', import.meta.url);

let workDir = '';
let gzPath = '';

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'off-import-'));
  gzPath = join(workDir, 'off-sample.jsonl.gz');
  await writeFile(gzPath, gzipSync(await readFile(FIXTURE)));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function generate(outName: string): Promise<{ dir: string; stdout: string[] }> {
  const dir = join(workDir, outName);
  const stdout: string[] = [];
  await run(['--input', gzPath, '--out', dir], (line) => stdout.push(line));
  return { dir, stdout };
}

describe('parseArgs', () => {
  it('requires --input and rejects unknown arguments', () => {
    expect(() => parseArgs([])).toThrow('--input');
    expect(() => parseArgs(['--input', 'a', '--foo'])).toThrow('Unbekanntes Argument');
    expect(parseArgs(['--input', 'a'])).toEqual({
      input: 'a',
      out: 'supabase/data/off-dach',
      tolerateTruncated: false,
    });
  });
});

describe('generate-off-seed (fixture .jsonl.gz, no network)', () => {
  it('imports offline: a throwing fetch stub is never called', async () => {
    const fetchStub = vi.fn(() => {
      throw new Error('Netzzugriff im Import nicht erlaubt');
    });
    vi.stubGlobal('fetch', fetchStub);
    const { dir } = await generate('offline');
    expect(fetchStub).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual(['off-dach-0001.sql']);
  });

  it('writes accepted products, deduplicated and ordered by popularity then barcode', async () => {
    const { dir } = await generate('content');
    const sql = await readFile(join(dir, 'off-dach-0001.sql'), 'utf8');
    const rowLines = sql.split('\n').filter((line) => line.startsWith("('"));
    const barcodes = rowLines.map((line) => /^\('(?:[^']|'')*', '(\d+)'/.exec(line)?.[1]);

    // 99999999999 scans (capped) > 500 (Dublette ersetzt) > 7 > 9 ... siehe Sortierung unten
    expect(barcodes).toEqual([
      '4000000000079', // 2147483647
      '4006381333931', // 500 (Dublette mit mehr Scans ersetzt die erste)
      '4000000000017', // 9 (Gleichstand: zuerst gelesene bleibt)
      '7612345678901', // 7
      '4000000000130', // 4 (Nährwerte aus nutrition.aggregated_set, per 100g)
      '0012345678905', // 0 (kJ-Produkt, 12-stelliger Rohcode -> kanonisch 13)
      '4000000000086', // 0 (Scans negativ)
      '4000000000093', // 0 (Scans gebrochen)
      '4000000000109', // 0 (Scans Text)
      '4000000000116', // 0 (kcal-Text -> kJ-Rückfall)
      '4000000000147', // 0 (aggregated_set per 100ml, wie 100g behandelt)
      '4000000000154', // 0 (aggregated_set nur kJ)
    ]);
    expect(sql).toContain('2147483647::integer');
    expect(sql).toContain("'Naturjoghurt Dublette'");
    expect(sql).not.toContain('Molkerei Alpenhof');
    expect(sql).toContain("'Gleichstand erste'");
    expect(sql).toContain("'L''Eau Zeile (d''Alsace)'");
    expect(sql).not.toContain('Gleichstand zweite');
    expect(sql).toContain('Charge 1/1, 12 Zeilen');
  });

  it('reports statistics with every rejection reason', async () => {
    const { stdout } = await generate('stats');
    const text = stdout.join('\n');
    expect(text).toMatch(/Zeilen gelesen:\s+24\b/);
    expect(text).toMatch(/nicht lesbar \(parse-error\):\s+1\b/);
    expect(text).toMatch(/kein DACH-Land:\s+1\b/);
    expect(text).toMatch(/kein Barcode:\s+1\b/);
    expect(text).toMatch(/kein Name:\s+1\b/);
    expect(text).toMatch(/unvollständig:\s+2\b/);
    expect(text).toMatch(
      /davon Nährwerte aus nutrition:\s+3 \(je 100 ml, wie 100 g behandelt: 1\)/,
    );
    expect(text).toMatch(/unplausibel:\s+3\b/);
    expect(text).toMatch(/Treffer je Land \(Produkt kann in mehreren zählen\): DE 7, AT 4, CH 1/);
    expect(text).toMatch(/davon ohne deutschen Namen:\s+10 /);
    expect(text).toMatch(/Geschrieben:\s+12 Produkte in 1 Chargen/);
  });

  it('is deterministic: same input gives byte-identical output', async () => {
    const first = await generate('det-a');
    const second = await generate('det-b');
    const a = await readFile(join(first.dir, 'off-dach-0001.sql'));
    const b = await readFile(join(second.dir, 'off-dach-0001.sql'));
    expect(a.equals(b)).toBe(true);
  });

  it('removes stale chunk files of an earlier run but leaves other files alone', async () => {
    const dir = join(workDir, 'stale');
    await run(['--input', gzPath, '--out', dir], () => undefined);
    await writeFile(join(dir, 'off-dach-0009.sql'), '-- alt');
    await writeFile(join(dir, 'notiz.txt'), 'bleibt');
    await run(['--input', gzPath, '--out', dir], () => undefined);
    expect((await readdir(dir)).sort()).toEqual(['notiz.txt', 'off-dach-0001.sql']);
  });
});
