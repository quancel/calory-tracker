import { describe, expect, it } from 'vitest';

import {
  OFF_MAX_POPULARITY,
  addProduct,
  buildChunkSql,
  chunkFileName,
  classifyOffRecord,
  composeName,
  extractNutrientsPer100g,
  mightBeDach,
  planChunks,
  renderValueRow,
  sortProducts,
  toFiniteNumber,
  toPopularity,
  type ImportProduct,
} from './off-import.calculations.ts';

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: '4006381333931',
    product_name: 'Joghurt',
    countries_tags: ['en:germany'],
    unique_scans_n: 10,
    nutriments: {
      'energy-kcal_100g': 110,
      proteins_100g: 5,
      carbohydrates_100g: 10,
      fat_100g: 5.5,
    },
    ...overrides,
  };
}

function product(overrides: Partial<ImportProduct> = {}): ImportProduct {
  return {
    barcode: '4006381333931',
    name: 'Joghurt',
    kcal100g: 110,
    proteinG100g: 5,
    carbsG100g: 10,
    fatG100g: 5.5,
    popularity: 10,
    ...overrides,
  };
}

describe('mightBeDach', () => {
  it('passes lines containing a DACH country tag and drops others', () => {
    expect(mightBeDach('{"countries_tags":["en:austria"]}')).toBe(true);
    expect(mightBeDach('{"countries_tags":["en:france"]}')).toBe(false);
  });
});

describe('toFiniteNumber / toPopularity', () => {
  it('accepts finite numbers and numeric strings only', () => {
    expect(toFiniteNumber(5)).toBe(5);
    expect(toFiniteNumber(' 5.5 ')).toBe(5.5);
    expect(toFiniteNumber('')).toBeUndefined();
    expect(toFiniteNumber('abc')).toBeUndefined();
    expect(toFiniteNumber(Number.NaN)).toBeUndefined();
    expect(toFiniteNumber(Infinity)).toBeUndefined();
    expect(toFiniteNumber(null)).toBeUndefined();
  });

  it('uses the real unique_scans_n, 0 when missing or invalid, capped at int max', () => {
    expect(toPopularity(120)).toBe(120);
    expect(toPopularity('7')).toBe(7);
    expect(toPopularity(undefined)).toBe(0);
    expect(toPopularity(-5)).toBe(0);
    expect(toPopularity(3.5)).toBe(0);
    expect(toPopularity('abc')).toBe(0);
    expect(toPopularity(99999999999)).toBe(OFF_MAX_POPULARITY);
  });
});

describe('composeName', () => {
  it('prefers the German name and appends the first brand', () => {
    expect(
      composeName({ product_name_de: 'Joghurt', product_name: 'Yogurt', brands: 'A, B' }),
    ).toBe('Joghurt (A)');
  });

  it('falls back to the generic name and omits an empty brand', () => {
    expect(composeName({ product_name_de: '  ', product_name: 'Yogurt', brands: '' })).toBe(
      'Yogurt',
    );
  });

  it('collapses whitespace and control characters', () => {
    expect(composeName({ product_name: "L'Eau\n\tKlar\u0000" })).toBe("L'Eau Klar");
  });

  it('returns an empty string without any name', () => {
    expect(composeName({ brands: 'Marke' })).toBe('');
  });
});

describe('classifyOffRecord', () => {
  it('accepts a complete, plausible DACH product with canonical barcode', () => {
    const result = classifyOffRecord(record({ code: '012345678905' }));
    expect(result).toEqual({
      kind: 'accepted',
      product: product({ barcode: '0012345678905', popularity: 10 }),
      nutritionSource: 'nutriments',
    });
  });

  it('converts kJ to kcal through the shared normalization', () => {
    const result = classifyOffRecord(
      record({
        nutriments: { energy_100g: 184, proteins_100g: 1, carbohydrates_100g: 6.5, fat_100g: 1.5 },
      }),
    );
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') expect(result.product.kcal100g).toBe(43.98);
  });

  it('reads numeric strings and treats non-numeric energy as missing (kJ fallback)', () => {
    const result = classifyOffRecord(
      record({
        nutriments: {
          'energy-kcal_100g': 'viel',
          energy_100g: 184,
          proteins_100g: '1',
          carbohydrates_100g: '6.5',
          fat_100g: '1.5',
        },
      }),
    );
    expect(result.kind).toBe('accepted');
  });

  it('rejects in the documented order', () => {
    expect(classifyOffRecord('x')).toEqual({ kind: 'rejected', reason: 'parse-error' });
    // kein DACH-Land gewinnt vor kein Barcode / kein Name
    expect(classifyOffRecord(record({ countries_tags: ['en:france'], code: 'ABC' }))).toEqual({
      kind: 'rejected',
      reason: 'not-dach',
    });
    // kein Barcode gewinnt vor kein Name
    expect(classifyOffRecord(record({ code: 'ABC', product_name: '' }))).toEqual({
      kind: 'rejected',
      reason: 'no-barcode',
    });
    // kein Name gewinnt vor unvollständig
    expect(classifyOffRecord(record({ product_name: ' ', nutriments: {} }))).toEqual({
      kind: 'rejected',
      reason: 'no-name',
    });
    expect(classifyOffRecord(record({ nutriments: { 'energy-kcal_100g': 100 } }))).toEqual({
      kind: 'rejected',
      reason: 'incomplete',
    });
  });

  it('classifies a negative raw value as implausible, not as missing', () => {
    const result = classifyOffRecord(
      record({
        nutriments: {
          'energy-kcal_100g': 100,
          proteins_100g: -5,
          carbohydrates_100g: 10,
          fat_100g: 5,
        },
      }),
    );
    expect(result).toEqual({ kind: 'rejected', reason: 'implausible' });
  });

  it('classifies a negative energy value that would be used as implausible', () => {
    const result = classifyOffRecord(
      record({
        nutriments: { energy_100g: -184, proteins_100g: 1, carbohydrates_100g: 6, fat_100g: 1 },
      }),
    );
    expect(result).toEqual({ kind: 'rejected', reason: 'implausible' });
  });

  it('rejects kcal deviating more than the shared threshold and macro sums over 100 g', () => {
    const deviating = record({
      nutriments: {
        'energy-kcal_100g': 900,
        proteins_100g: 5,
        carbohydrates_100g: 10,
        fat_100g: 5,
      },
    });
    const overfull = record({
      nutriments: {
        'energy-kcal_100g': 900,
        proteins_100g: 60,
        carbohydrates_100g: 60,
        fat_100g: 10,
      },
    });
    expect(classifyOffRecord(deviating)).toEqual({ kind: 'rejected', reason: 'implausible' });
    expect(classifyOffRecord(overfull)).toEqual({ kind: 'rejected', reason: 'implausible' });
  });

  it('falls back to _id when code is missing and caps popularity', () => {
    const result = classifyOffRecord(
      record({ code: undefined, _id: '4006381333931', unique_scans_n: 99999999999 }),
    );
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') expect(result.product.popularity).toBe(OFF_MAX_POPULARITY);
  });

  it('never makes popularity constant: different scans give different values', () => {
    const a = classifyOffRecord(record({ unique_scans_n: 3 }));
    const b = classifyOffRecord(record({ unique_scans_n: 4000 }));
    const c = classifyOffRecord(record({ unique_scans_n: undefined }));
    const values = [a, b, c].map((r) => (r.kind === 'accepted' ? r.product.popularity : -1));
    expect(values).toEqual([3, 4000, 0]);
  });
});

describe('addProduct / sortProducts', () => {
  it('keeps the higher popularity and, on a tie, the first read', () => {
    const collected = new Map<string, ImportProduct>();
    expect(addProduct(collected, product({ name: 'erste', popularity: 5 }))).toBe('added');
    expect(addProduct(collected, product({ name: 'zweite', popularity: 5 }))).toBe('duplicate');
    expect(addProduct(collected, product({ name: 'dritte', popularity: 9 }))).toBe('replaced');
    expect(addProduct(collected, product({ name: 'vierte', popularity: 1 }))).toBe('duplicate');
    expect(collected.get('4006381333931')?.name).toBe('dritte');
  });

  it('sorts by popularity descending, then barcode ascending', () => {
    const sorted = sortProducts([
      product({ barcode: '0000000000002', popularity: 1 }),
      product({ barcode: '0000000000009', popularity: 5 }),
      product({ barcode: '0000000000001', popularity: 5 }),
      product({ barcode: '0000000000003', popularity: 0 }),
    ]);
    expect(sorted.map((p) => p.barcode)).toEqual([
      '0000000000001',
      '0000000000009',
      '0000000000002',
      '0000000000003',
    ]);
  });
});

describe('SQL rendering', () => {
  it('escapes quotes and lists the lookup keys of the row', () => {
    const row = renderValueRow(product({ barcode: '0012345678905', name: "L'Eau (d'Alsace)" }));
    expect(row).toContain("'L''Eau (d''Alsace)'");
    expect(row).toContain("array['0012345678905', '012345678905']::text[]");
    expect(row).toContain('110::numeric');
  });

  it('plans chunks by row count', () => {
    const rows = Array.from({ length: 11 }, (_, i) => `(${i})`);
    expect(planChunks(rows, 5, 1_000_000).map((chunk) => chunk.length)).toEqual([5, 5, 1]);
    expect(planChunks([], 5, 1_000_000)).toEqual([]);
  });

  it('plans chunks by byte limit even below the row limit', () => {
    const rows = Array.from({ length: 4 }, () => 'x'.repeat(3000));
    const chunks = planChunks(rows, 5000, 4096 + 2 * 3002);
    expect(chunks.map((chunk) => chunk.length)).toEqual([2, 2]);
  });

  it('builds one DML statement in one transaction without DDL', () => {
    const sql = buildChunkSql([renderValueRow(product())], 2, 7);
    expect(sql).toContain('Charge 2/7, 1 Zeilen');
    expect(sql).toContain('20260930090000');
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(sql).toContain("set local statement_timeout = '10min';");
    expect(sql).toContain(
      'where not exists (select 1 from public.foods f where f.barcode = any(v.keys))',
    );
    expect(sql).toContain('on conflict (barcode) do nothing');
    expect(sql).toContain(
      'where f.barcode = any(v.keys) and f.off_popularity <> v.off_popularity;',
    );
    expect(sql.match(/\binsert into\b/g)).toHaveLength(1);
    expect(sql.match(/\bupdate public\.foods\b/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(create|drop|alter|truncate)\b/i);
  });

  it('names chunk files with four digits', () => {
    expect(chunkFileName(1)).toBe('off-dach-0001.sql');
    expect(chunkFileName(123)).toBe('off-dach-0123.sql');
  });
});

describe('extractNutrientsPer100g', () => {
  const aggregated = (per: string, nutrients: Record<string, unknown>) => ({
    nutriments: {},
    nutrition: { aggregated_set: { per, nutrients } },
  });
  const full = {
    'energy-kcal': { value: 110, unit: 'kcal' },
    proteins: { value: 5, unit: 'g' },
    carbohydrates: { value: 10, unit: 'g' },
    fat: { value: 5.5, unit: 'g' },
  };

  it('prefers legacy nutriments when they carry any value', () => {
    const raw = { ...aggregated('100g', full), nutriments: { proteins_100g: 7 } };
    const { values, source } = extractNutrientsPer100g(raw);
    expect(source).toBe('nutriments');
    expect(values.protein).toBe(7);
    expect(values.carbs).toBeUndefined();
  });

  it('falls back to nutrition.aggregated_set per 100g when nutriments is empty', () => {
    const { values, source } = extractNutrientsPer100g(aggregated('100g', full));
    expect(source).toBe('nutrition');
    expect(values).toEqual({ kcal: 110, kj: undefined, protein: 5, carbs: 10, fat: 5.5 });
  });

  it('reads kJ from energy-kj or energy only with unit kJ', () => {
    expect(
      extractNutrientsPer100g(aggregated('100g', { 'energy-kj': { value: 184, unit: 'kJ' } }))
        .values.kj,
    ).toBe(184);
    expect(
      extractNutrientsPer100g(aggregated('100g', { energy: { value: 184, unit: 'kcal' } })).values
        .kj,
    ).toBeUndefined();
  });

  it('reads per 100ml like per 100g but reports its own source', () => {
    const { values, source } = extractNutrientsPer100g(aggregated('100ml', full));
    expect(source).toBe('nutrition-100ml');
    expect(values).toEqual({ kcal: 110, kj: undefined, protein: 5, carbs: 10, fat: 5.5 });
  });

  it('prefers legacy 100g values over a 100ml aggregated set', () => {
    const raw = { ...aggregated('100ml', full), nutriments: { proteins_100g: 7 } };
    expect(extractNutrientsPer100g(raw).source).toBe('nutriments');
  });

  it('ignores other per values, wrong units and a missing nutrition object', () => {
    expect(extractNutrientsPer100g(aggregated('serving', full)).values.kcal).toBeUndefined();
    expect(
      extractNutrientsPer100g(aggregated('100g', { proteins: { value: 5000, unit: 'mg' } })).values
        .protein,
    ).toBeUndefined();
    expect(extractNutrientsPer100g({ nutriments: {} }).values.fat).toBeUndefined();
  });

  it('classifies an aggregated-set product as accepted with source nutrition', () => {
    const result = classifyOffRecord({
      code: '4006381333931',
      product_name: 'Joghurt',
      countries_tags: ['en:germany'],
      ...aggregated('100g', { ...full, 'energy-kcal': { value: 110, unit: 'kcal' } }),
    });
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') expect(result.nutritionSource).toBe('nutrition');
  });
});
