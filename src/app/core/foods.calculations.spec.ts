import {
  computeKcalFromMacros,
  dedupeServerHits,
  foodTextTier,
  isSearchStatusReserved,
  mergeLocalAndServer,
  rankLocalFoods,
  resolveSearchEmptyState,
  resolveSearchStatus,
  searchAnnouncement,
  selectRecentFoods,
  computeLiveNutrition,
  filterFoodsByQuery,
  findPlausibilityFindings,
  isNutritionIncomplete,
  parseDecimal,
  plausibilityMarkerStatusText,
  resolveDefaultAmount,
  resolvePlausibilityMarker,
  validateAmountField,
  validateNameField,
} from './foods.calculations';
import { SERVER_RESULT_LIMIT } from './food-search.constants';
import type { Food } from './foods.service';

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 'f1',
    name: 'Apfel',
    kcal100g: 52,
    proteinG100g: 0.3,
    carbsG100g: 14,
    fatG100g: 0.2,
    defaultPortionG: 150,
    source: 'manual',
    barcode: null,
    isCorrected: false,
    offPopularity: 0,
    ...overrides,
  };
}

describe('filterFoodsByQuery', () => {
  const foods = [
    makeFood({ id: '1', name: 'Apfel' }),
    makeFood({ id: '2', name: 'Banane' }),
    makeFood({ id: '3', name: 'Apfelmus' }),
  ];

  it('returns all foods for an empty/whitespace query', () => {
    expect(filterFoodsByQuery(foods, '')).toHaveLength(3);
    expect(filterFoodsByQuery(foods, '   ')).toHaveLength(3);
  });

  it('filters by case-insensitive substring match', () => {
    const result = filterFoodsByQuery(foods, 'apf');
    expect(result.map((f) => f.id)).toEqual(['1', '3']);
  });

  it('matches independent of case', () => {
    const result = filterFoodsByQuery(foods, 'BANANE');
    expect(result.map((f) => f.id)).toEqual(['2']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterFoodsByQuery(foods, 'Zzz')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const result = filterFoodsByQuery(foods, '');
    expect(result).not.toBe(foods);
  });
});

describe('parseDecimal', () => {
  it('parses a plain integer', () => {
    expect(parseDecimal('52')).toBe(52);
  });

  it('parses a decimal with dot', () => {
    expect(parseDecimal('52.5')).toBe(52.5);
  });

  it('parses a decimal with German comma', () => {
    expect(parseDecimal('52,5')).toBe(52.5);
  });

  it('returns null for empty/non-numeric input', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('12kcal')).toBeNull();
  });
});

describe('validateNameField', () => {
  it('rejects an empty/whitespace-only name', () => {
    expect(validateNameField('').valid).toBe(false);
    expect(validateNameField('   ').valid).toBe(false);
  });

  it('accepts and trims a valid name', () => {
    expect(validateNameField('  Apfel  ')).toEqual({ valid: true, value: 'Apfel' });
  });
});

describe('validateAmountField (Step B / M3, ADR-0009 Punkt 8)', () => {
  it('rejects an empty/whitespace-only value', () => {
    expect(validateAmountField('').valid).toBe(false);
    expect(validateAmountField('   ').valid).toBe(false);
  });

  it('rejects a non-numeric value', () => {
    expect(validateAmountField('abc').valid).toBe(false);
  });

  it('rejects 0', () => {
    expect(validateAmountField('0').valid).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(validateAmountField('-5').valid).toBe(false);
  });

  it('accepts a valid positive value with dot or comma', () => {
    expect(validateAmountField('150')).toEqual({ valid: true, value: 150 });
    expect(validateAmountField('150,5')).toEqual({ valid: true, value: 150.5 });
  });

  it('has no upper bound (Nutzer-bestätigt)', () => {
    expect(validateAmountField('100000')).toEqual({ valid: true, value: 100000 });
  });
});

describe('resolveDefaultAmount', () => {
  it('uses defaultPortionG when set', () => {
    expect(resolveDefaultAmount({ defaultPortionG: 150 })).toBe('150');
  });

  it('falls back to 100 when defaultPortionG is null (reine UI-Vorbelegung)', () => {
    expect(resolveDefaultAmount({ defaultPortionG: null })).toBe('100');
  });
});

describe('computeLiveNutrition', () => {
  const food = { kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 };

  it('scales all four values by amountG / 100', () => {
    expect(computeLiveNutrition(food, 200)).toEqual({
      kcal: 104,
      proteinG: 0.6,
      carbsG: 28,
      fatG: 0.4,
    });
  });

  it('handles amounts below 100g', () => {
    expect(computeLiveNutrition(food, 50)).toEqual({
      kcal: 26,
      proteinG: 0.15,
      carbsG: 7,
      fatG: 0.1,
    });
  });
});

describe('isNutritionIncomplete', () => {
  it('is false when all four values are present', () => {
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 }),
    ).toBe(false);
  });

  it('is true when any single value is null', () => {
    expect(
      isNutritionIncomplete({ kcal100g: null, proteinG100g: 0.3, carbsG100g: 14, fatG100g: 0.2 }),
    ).toBe(true);
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: null, carbsG100g: 14, fatG100g: 0.2 }),
    ).toBe(true);
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: 0.3, carbsG100g: null, fatG100g: 0.2 }),
    ).toBe(true);
    expect(
      isNutritionIncomplete({ kcal100g: 52, proteinG100g: 0.3, carbsG100g: 14, fatG100g: null }),
    ).toBe(true);
  });
});

describe('findPlausibilityFindings (ADR-0011 Punkt 3/4)', () => {
  it('returns no findings for fully plausible, complete nutrition', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 200,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings).toEqual([]);
  });

  it('flags "incomplete" when at least one required value is missing', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 200,
      proteinG100g: 50,
      carbsG100g: null,
      fatG100g: 0,
    });

    expect(findings).toEqual([expect.objectContaining({ kind: 'incomplete' })]);
  });

  it('flags "macro-sum-exceeded" using only the present macro values, even with one missing (ADR-0011 Punkt 4)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 200,
      proteinG100g: 60,
      carbsG100g: 50,
      fatG100g: null,
    });

    expect(findings).toEqual([
      expect.objectContaining({ kind: 'incomplete' }),
      expect.objectContaining({ kind: 'macro-sum-exceeded', message: expect.stringContaining('110') }),
    ]);
  });

  it('does NOT run the kcal-deviation check when any of the four values is missing (no false positive from a 0-assumption)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 500,
      proteinG100g: 10,
      carbsG100g: 10,
      fatG100g: null,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });

  it('does not flag a 9% kcal deviation (below the 10% threshold)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 218,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });

  it('does not flag exactly 10% kcal deviation (boundary is inclusive of tolerance, ">10%" not ">=10%")', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 220,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });

  it('flags an 11% kcal deviation and names the direction (mehr) when the stated value is too high', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 222,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'kcal-deviation',
        message: expect.stringMatching(/11%.*mehr/),
      }),
    ]);
  });

  it('names the direction (weniger) when the stated value is too low', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 178,
      proteinG100g: 50,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'kcal-deviation',
        message: expect.stringMatching(/11%.*weniger/),
      }),
    ]);
  });

  it('can report BOTH macro-sum-exceeded and kcal-deviation at the same time', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 1000,
      proteinG100g: 60,
      carbsG100g: 50,
      fatG100g: 0,
    });

    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(['macro-sum-exceeded', 'kcal-deviation']),
    );
  });

  it('does not divide by zero when all macros are 0 kcal (no kcal-deviation finding)', () => {
    const findings = findPlausibilityFindings({
      kcal100g: 50,
      proteinG100g: 0,
      carbsG100g: 0,
      fatG100g: 0,
    });

    expect(findings.some((finding) => finding.kind === 'kcal-deviation')).toBe(false);
  });
});

describe('resolvePlausibilityMarker (Einzel-Slot-Priorisierung, design-conventions.md)', () => {
  it('returns null when nothing is wrong', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 50, carbsG100g: 0, fatG100g: 0 }),
    ).toBeNull();
  });

  it('returns "incomplete" when only a value is missing', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 50, carbsG100g: 0, fatG100g: null }),
    ).toEqual({ kind: 'incomplete' });
  });

  it('returns "implausible" when only the macro sum is exceeded', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 60, carbsG100g: 50, fatG100g: 0 }),
    ).toEqual({ kind: 'implausible' });
  });

  it('prioritizes "implausible" over "incomplete" when both findings apply (ADR-0011/design-conventions.md)', () => {
    expect(
      resolvePlausibilityMarker({ kcal100g: 200, proteinG100g: 60, carbsG100g: 50, fatG100g: null }),
    ).toEqual({ kind: 'implausible' });
  });
});

describe('plausibilityMarkerStatusText', () => {
  it('names the priorized status only', () => {
    expect(plausibilityMarkerStatusText({ kind: 'implausible' })).toBe('Nährwerte unplausibel');
    expect(plausibilityMarkerStatusText({ kind: 'incomplete' })).toBe('Nährwerte unvollständig');
  });
});

describe('computeKcalFromMacros (Eingabehilfe für Anlege-/Korrekturformular)', () => {
  it('computes the Atwater energy from the three macros', () => {
    expect(
      computeKcalFromMacros({ proteinG100g: 10, carbsG100g: 20, fatG100g: 5 }),
    ).toBeCloseTo(10 * 4 + 20 * 4 + 5 * 9, 5);
  });

  it('returns null when any of the three macros is missing', () => {
    expect(computeKcalFromMacros({ proteinG100g: null, carbsG100g: 20, fatG100g: 5 })).toBeNull();
    expect(computeKcalFromMacros({ proteinG100g: 10, carbsG100g: null, fatG100g: 5 })).toBeNull();
    expect(computeKcalFromMacros({ proteinG100g: 10, carbsG100g: 20, fatG100g: null })).toBeNull();
  });

  it('does not depend on kcal100g at all (pure macro→energy conversion)', () => {
    expect(computeKcalFromMacros({ proteinG100g: 0, carbsG100g: 0, fatG100g: 0 })).toBe(0);
  });
});

describe('selectRecentFoods', () => {
  const foods = [makeFood({ id: '1' }), makeFood({ id: '2' }), makeFood({ id: '3' })];

  it('keeps the order of the ids and skips unknown ones', () => {
    expect(selectRecentFoods(foods, ['3', 'gone', '1']).map((f) => f.id)).toEqual(['3', '1']);
  });
});

describe('foodTextTier (Textstufen wie search_foods, ADR-0020 Punkt 4)', () => {
  it.each([
    ['Joghurt', 'joghurt', 0],
    ['Joghurt Natur', 'joghurt', 1],
    ['Bio Joghurt', 'joghurt', 2],
    ['Salat (Joghurt)', 'joghurt', 2],
    ['Frucht-Joghurt', 'joghurt', 2],
    ['Naturjoghurt', 'joghurt', 3],
  ])('%s for "%s" is tier %i', (name, query, tier) => {
    expect(foodTextTier(name, query)).toBe(tier);
  });
});

describe('rankLocalFoods (ADR-0021 Punkt 11, eine Funktion für Step A und M2)', () => {
  const none = new Map<string, number>();

  it('returns nothing for an empty query', () => {
    expect(rankLocalFoods([makeFood()], '   ', none)).toEqual([]);
  });

  it('puts manual/corrected foods before OFF foods, whatever the text tier', () => {
    const foods = [
      makeFood({ id: 'off-exact', name: 'Joghurt', source: 'off', offPopularity: 999 }),
      makeFood({ id: 'manual-part', name: 'Naturjoghurt', source: 'manual' }),
      makeFood({ id: 'corrected', name: 'Mein Joghurt', source: 'off', isCorrected: true }),
    ];

    expect(rankLocalFoods(foods, 'joghurt', none).map((f) => f.id)).toEqual([
      'corrected',
      'manual-part',
      'off-exact',
    ]);
  });

  it('then ranks by text tier, own use (descending), OFF popularity (descending), name, id', () => {
    const foods = [
      makeFood({ id: 'part', name: 'Naturjoghurt', source: 'off' }),
      makeFood({ id: 'word', name: 'Bio Joghurt', source: 'off' }),
      makeFood({ id: 'starts', name: 'Joghurt Natur', source: 'off' }),
      makeFood({ id: 'used', name: 'Joghurt A', source: 'off' }),
      makeFood({ id: 'popular', name: 'Joghurt B', source: 'off', offPopularity: 50 }),
      makeFood({ id: 'plain-b', name: 'Joghurt C', source: 'off', offPopularity: 50 }),
      makeFood({ id: 'plain-a', name: 'Joghurt C', source: 'off', offPopularity: 50 }),
    ];

    const ranked = rankLocalFoods(foods, 'joghurt', new Map([['used', 3]]));

    expect(ranked.map((f) => f.id)).toEqual([
      // Textstufe 1 (beginnt mit): erst eigene Nutzung, dann Beliebtheit, dann Name, dann id
      'used',
      'popular',
      'plain-a',
      'plain-b',
      'starts',
      // Stufe 2, Stufe 3
      'word',
      'part',
    ]);
  });

  it('only returns foods that contain the query, case-insensitively', () => {
    const foods = [makeFood({ id: '1', name: 'Apfel' }), makeFood({ id: '2', name: 'Banane' })];

    expect(rankLocalFoods(foods, ' APF ', none).map((f) => f.id)).toEqual(['1']);
  });
});

describe('dedupeServerHits / mergeLocalAndServer (ADR-0021 Punkt 11)', () => {
  const hit = (food: Food) => ({ food, ownUseCount: 0 });

  it('keeps the server order and drops hits whose id is already local', () => {
    const local = [makeFood({ id: 'a' })];
    const server = [hit(makeFood({ id: 'x' })), hit(makeFood({ id: 'a' })), hit(makeFood({ id: 'y' }))];

    expect(dedupeServerHits(local, server).map((f) => f.id)).toEqual(['x', 'y']);
  });

  it('drops hits whose non-null barcode is already local, but never compares null barcodes', () => {
    const local = [makeFood({ id: 'a', barcode: '4001' }), makeFood({ id: 'b', barcode: null })];
    const server = [
      hit(makeFood({ id: 'x', barcode: '4001' })),
      hit(makeFood({ id: 'y', barcode: null })),
    ];

    expect(dedupeServerHits(local, server).map((f) => f.id)).toEqual(['y']);
  });

  it('applies the limit AFTER removing duplicates', () => {
    const local = [makeFood({ id: 'dup' })];
    const server = [
      hit(makeFood({ id: 'dup' })),
      ...Array.from({ length: 40 }, (_, i) => hit(makeFood({ id: `s${i}` }))),
    ];

    const result = dedupeServerHits(local, server);

    expect(result).toHaveLength(SERVER_RESULT_LIMIT);
    expect(result[0].id).toBe('s0');
  });

  it('merge puts local first and leaves their order untouched', () => {
    const merged = mergeLocalAndServer([makeFood({ id: 'l1' }), makeFood({ id: 'l2' })], [makeFood({ id: 's1' })]);

    expect(merged.map((f) => f.id)).toEqual(['l1', 'l2', 's1']);
  });
});

describe('resolveSearchStatus (Priorität der Statuszeile)', () => {
  it('1. local stock unavailable wins over everything — even for an empty query', () => {
    expect(resolveSearchStatus({ localState: 'unavailable', queryLength: 0, serverPhase: 'idle' })).toEqual({
      kind: 'local-unavailable',
    });
    expect(resolveSearchStatus({ localState: 'unavailable', queryLength: 5, serverPhase: 'offline' })).toEqual({
      kind: 'local-unavailable',
    });
  });

  it('2. offline, 3. server failed, 4. searching — one at a time', () => {
    const base = { localState: 'ready' as const, queryLength: 3 };

    expect(resolveSearchStatus({ ...base, serverPhase: 'offline' })).toEqual({ kind: 'offline' });
    expect(resolveSearchStatus({ ...base, serverPhase: 'error' })).toEqual({ kind: 'server-failed' });
    expect(resolveSearchStatus({ ...base, serverPhase: 'pending' })).toEqual({ kind: 'searching' });
    expect(resolveSearchStatus({ ...base, serverPhase: 'success' })).toEqual({ kind: 'none' });
  });

  it('shows nothing below the minimum query length', () => {
    expect(resolveSearchStatus({ localState: 'ready', queryLength: 1, serverPhase: 'offline' })).toEqual({
      kind: 'none',
    });
  });

  it('reserves the line from 2 characters or with an unavailable local stock', () => {
    expect(isSearchStatusReserved({ localState: 'ready', queryLength: 1 })).toBe(false);
    expect(isSearchStatusReserved({ localState: 'ready', queryLength: 2 })).toBe(true);
    expect(isSearchStatusReserved({ localState: 'unavailable', queryLength: 0 })).toBe(true);
  });
});

describe('searchAnnouncement', () => {
  it('announces the count after a successful server search only', () => {
    expect(searchAnnouncement('success', 4)).toBe('4 Treffer online');
    expect(searchAnnouncement('success', 0)).toBe('Keine weiteren Treffer online');
    expect(searchAnnouncement('pending', 4)).toBeNull();
    expect(searchAnnouncement('error', 0)).toBeNull();
  });
});

describe('resolveSearchEmptyState', () => {
  const base = { localState: 'ready' as const, queryLength: 4, resultCount: 0 };

  it('is null for an empty query and whenever rows exist', () => {
    expect(resolveSearchEmptyState({ ...base, queryLength: 0, serverPhase: 'idle' })).toBeNull();
    expect(resolveSearchEmptyState({ ...base, resultCount: 1, serverPhase: 'success' })).toBeNull();
  });

  it('waits for the server search to end (skeleton instead)', () => {
    expect(resolveSearchEmptyState({ ...base, serverPhase: 'pending' })).toBeNull();
  });

  it('"Kein Treffer" after a successful server search', () => {
    expect(resolveSearchEmptyState({ ...base, serverPhase: 'success' })).toEqual({
      kind: 'no-hit',
      minCharsHint: false,
    });
  });

  it('"Keine lokalen Treffer" after a failed or skipped server search', () => {
    expect(resolveSearchEmptyState({ ...base, serverPhase: 'error' })?.kind).toBe('no-local-hit');
    expect(resolveSearchEmptyState({ ...base, serverPhase: 'offline' })?.kind).toBe('no-local-hit');
  });

  it('"Keine Treffer online" when the local stock is not loaded', () => {
    expect(resolveSearchEmptyState({ ...base, localState: 'unavailable', serverPhase: 'error' })?.kind).toBe(
      'no-online-hit',
    );
  });

  it('adds the minimum-length hint for a single character without a local hit', () => {
    expect(resolveSearchEmptyState({ ...base, queryLength: 1, serverPhase: 'idle' })).toEqual({
      kind: 'no-hit',
      minCharsHint: true,
    });
  });
});
