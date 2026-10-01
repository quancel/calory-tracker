import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../core/supabase.service';
import { FoodSearchOffService } from './food-search.off.service';
import { FoodSearchService } from './food-search.service';

describe('FoodSearchService.createFood', () => {
  let insertResponse: { data: unknown; error: unknown };
  let insert: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    insertResponse = { data: null, error: null };
    insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockImplementation(() => Promise.resolve(insertResponse)),
      }),
    });
    from = vi.fn().mockReturnValue({ insert });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
  });

  it('inserts with source "manual" and no user_id filter, defaultPortionG/barcode null stay null', async () => {
    insertResponse = {
      data: {
        id: 'f2',
        name: 'Birne',
        kcal_100g: 57,
        protein_100g: 0.4,
        carbs_100g: 15,
        fat_100g: 0.1,
        default_portion_g: null,
        source: 'manual',
        barcode: null,
      },
      error: null,
    };

    const service = TestBed.inject(FoodSearchService);
    const result = await service.createFood({
      name: 'Birne',
      kcal100g: 57,
      proteinG100g: 0.4,
      carbsG100g: 15,
      fatG100g: 0.1,
      defaultPortionG: null,
      barcode: null,
    });

    expect(from).toHaveBeenCalledWith('foods');
    const [payload] = insert.mock.calls[0];
    expect(payload).toEqual({
      name: 'Birne',
      kcal_100g: 57,
      protein_100g: 0.4,
      carbs_100g: 15,
      fat_100g: 0.1,
      default_portion_g: null,
      source: 'manual',
      barcode: null,
    });
    expect(payload.user_id).toBeUndefined();
    expect(result).toEqual({
      success: true,
      food: {
        id: 'f2',
        name: 'Birne',
        kcal100g: 57,
        proteinG100g: 0.4,
        carbsG100g: 15,
        fatG100g: 0.1,
        defaultPortionG: null,
        source: 'manual',
        barcode: null,
        offPopularity: 0,
      },
    });
  });

  it('forwards a filled defaultPortionG/barcode unchanged, still source "manual"', async () => {
    insertResponse = {
      data: {
        id: 'f3',
        name: 'Banane',
        kcal_100g: 89,
        protein_100g: 1.1,
        carbs_100g: 23,
        fat_100g: 0.3,
        default_portion_g: 120,
        source: 'manual',
        barcode: '4008400123456',
      },
      error: null,
    };

    const service = TestBed.inject(FoodSearchService);
    await service.createFood({
      name: 'Banane',
      kcal100g: 89,
      proteinG100g: 1.1,
      carbsG100g: 23,
      fatG100g: 0.3,
      defaultPortionG: 120,
      barcode: '4008400123456',
    });

    const [payload] = insert.mock.calls[0];
    expect(payload.default_portion_g).toBe(120);
    expect(payload.barcode).toBe('4008400123456');
    expect(payload.source).toBe('manual');
  });

  it('returns a generic error message when the insert fails', async () => {
    insertResponse = { data: null, error: { message: 'constraint violation' } };

    const service = TestBed.inject(FoodSearchService);
    const result = await service.createFood({
      name: 'Birne',
      kcal100g: 57,
      proteinG100g: 0.4,
      carbsG100g: 15,
      fatG100g: 0.1,
      defaultPortionG: null,
      barcode: null,
    });

    expect(result).toEqual({ success: false, message: 'Food konnte nicht angelegt werden.' });
  });
});

describe('FoodSearchService.createFoodFromOff', () => {
  it('inserts with source "off" (ADR-0010 Punkt 5)', async () => {
    const insertResponse = {
      data: {
        id: 'f4',
        name: 'Müsli',
        kcal_100g: 400,
        protein_100g: 8,
        carbs_100g: 65,
        fat_100g: 10,
        default_portion_g: null,
        source: 'off',
        barcode: '4008400123456',
      },
      error: null,
    };
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(insertResponse) }),
    });
    const from = vi.fn().mockReturnValue({ insert });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.createFoodFromOff({
      name: 'Müsli',
      kcal100g: 400,
      proteinG100g: 8,
      carbsG100g: 65,
      fatG100g: 10,
      defaultPortionG: null,
      barcode: '4008400123456',
    });

    const [payload] = insert.mock.calls[0];
    expect(payload.source).toBe('off');
    expect(result).toEqual({ success: true, food: expect.objectContaining({ source: 'off' }) });
  });
});

describe('FoodSearchService.updateFood (Step C, ADR-0011 Punkt 6)', () => {
  let updateResponse: { data: unknown; error: unknown };
  let eq: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateResponse = { data: null, error: null };
    eq = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockImplementation(() => Promise.resolve(updateResponse)),
      }),
    });
    update = vi.fn().mockReturnValue({ eq });
    from = vi.fn().mockReturnValue({ update });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
  });

  it('writes the new nutrition values AND is_corrected: true in the SAME update statement (ADR-0011 Punkt 6/7)', async () => {
    updateResponse = {
      data: {
        id: 'f1',
        name: 'Apfel (korrigiert)',
        kcal_100g: 55,
        protein_100g: 0.4,
        carbs_100g: 15,
        fat_100g: 0.3,
        default_portion_g: 150,
        source: 'manual',
        barcode: null,
        is_corrected: true,
      },
      error: null,
    };

    const service = TestBed.inject(FoodSearchService);
    const result = await service.updateFood('f1', {
      name: 'Apfel (korrigiert)',
      kcal100g: 55,
      proteinG100g: 0.4,
      carbsG100g: 15,
      fatG100g: 0.3,
      defaultPortionG: 150,
      barcode: null,
    });

    expect(from).toHaveBeenCalledWith('foods');
    const [payload] = update.mock.calls[0];
    expect(payload).toEqual({
      name: 'Apfel (korrigiert)',
      kcal_100g: 55,
      protein_100g: 0.4,
      carbs_100g: 15,
      fat_100g: 0.3,
      default_portion_g: 150,
      barcode: null,
      is_corrected: true,
    });
    expect(eq).toHaveBeenCalledWith('id', 'f1');
    expect(result).toEqual({
      success: true,
      food: {
        id: 'f1',
        name: 'Apfel (korrigiert)',
        kcal100g: 55,
        proteinG100g: 0.4,
        carbsG100g: 15,
        fatG100g: 0.3,
        defaultPortionG: 150,
        source: 'manual',
        barcode: null,
        isCorrected: true,
        offPopularity: 0,
      },
    });
  });

  it('always sets is_corrected: true, unconditionally (Vorrangsperre, ADR-0011 Punkt 7)', async () => {
    updateResponse = {
      data: {
        id: 'f2',
        name: 'Birne',
        kcal_100g: 57,
        protein_100g: 0.4,
        carbs_100g: 15,
        fat_100g: 0.1,
        default_portion_g: null,
        source: 'off',
        barcode: '123',
        is_corrected: true,
      },
      error: null,
    };

    const service = TestBed.inject(FoodSearchService);
    await service.updateFood('f2', {
      name: 'Birne',
      kcal100g: 57,
      proteinG100g: 0.4,
      carbsG100g: 15,
      fatG100g: 0.1,
      defaultPortionG: null,
      barcode: '123',
    });

    const [payload] = update.mock.calls[0];
    expect(payload.is_corrected).toBe(true);
  });

  it('does not touch "source" — a correction does not change the origin of the original values', async () => {
    updateResponse = {
      data: {
        id: 'f3',
        name: 'Müsli',
        kcal_100g: 400,
        protein_100g: 8,
        carbs_100g: 65,
        fat_100g: 10,
        default_portion_g: null,
        source: 'off',
        barcode: '123',
        is_corrected: true,
      },
      error: null,
    };

    const service = TestBed.inject(FoodSearchService);
    await service.updateFood('f3', {
      name: 'Müsli',
      kcal100g: 400,
      proteinG100g: 8,
      carbsG100g: 65,
      fatG100g: 10,
      defaultPortionG: null,
      barcode: '123',
    });

    const [payload] = update.mock.calls[0];
    expect(payload).not.toHaveProperty('source');
  });

  it('returns a generic error message when the update fails', async () => {
    updateResponse = { data: null, error: { message: 'not found' } };

    const service = TestBed.inject(FoodSearchService);
    const result = await service.updateFood('missing', {
      name: 'Apfel',
      kcal100g: 52,
      proteinG100g: 0.3,
      carbsG100g: 14,
      fatG100g: 0.2,
      defaultPortionG: null,
      barcode: null,
    });

    expect(result).toEqual({ success: false, message: 'Food konnte nicht aktualisiert werden.' });
  });
});

function foodRow(id: string, barcode: string | null) {
  return {
    id,
    name: 'Apfel',
    kcal_100g: 52,
    protein_100g: 0.3,
    carbs_100g: 14,
    fat_100g: 0.2,
    default_portion_g: null,
    source: 'manual',
    barcode,
  };
}

/** Supabase-Stub für `.from('foods').select(...).in('barcode', keys)` (ADR-0022 Punkt 4). */
function configureLookupSupabase(rows: unknown[] | null, error: unknown = null) {
  const inFn = vi.fn().mockResolvedValue({ data: rows, error });
  const select = vi.fn().mockReturnValue({ in: inFn });
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { ...foodRow('new-off', '4008400123456'), name: 'Müsli', source: 'off' },
        error: null,
      }),
    }),
  });
  const from = vi.fn().mockReturnValue({ select, insert });

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
  });
  return { from, inFn, insert };
}

describe('FoodSearchService.findByBarcode (ADR-0022 Punkt 4)', () => {
  it('queries by all lookup keys with .in, not the session cache (ADR-0010 Punkt 4)', async () => {
    const { from, inFn } = configureLookupSupabase([foodRow('f1', '4008400123456')]);

    const service = TestBed.inject(FoodSearchService);
    const result = await service.findByBarcode('4008400123456');

    expect(from).toHaveBeenCalledWith('foods');
    expect(inFn).toHaveBeenCalledWith('barcode', ['4008400123456']);
    expect(result).toEqual({
      success: true,
      food: expect.objectContaining({ id: 'f1', barcode: '4008400123456' }),
    });
  });

  it('a 12-digit scan finds the row with the 13-digit canonical form', async () => {
    const { inFn } = configureLookupSupabase([foodRow('f1', '0036000291452')]);

    const result = await TestBed.inject(FoodSearchService).findByBarcode('036000291452');

    expect(inFn).toHaveBeenCalledWith('barcode', ['0036000291452', '036000291452']);
    expect(result).toEqual({ success: true, food: expect.objectContaining({ id: 'f1' }) });
  });

  it('a 13-digit scan finds a legacy row stored with the 12-digit raw value', async () => {
    configureLookupSupabase([foodRow('alt', '036000291452')]);

    const result = await TestBed.inject(FoodSearchService).findByBarcode('0036000291452');

    expect(result).toEqual({ success: true, food: expect.objectContaining({ id: 'alt' }) });
  });

  it('two hits: the row with the canonical barcode wins, regardless of row order', async () => {
    configureLookupSupabase([
      foodRow('alt', '036000291452'),
      foodRow('kanon', '0036000291452'),
    ]);

    const result = await TestBed.inject(FoodSearchService).findByBarcode('036000291452');

    expect(result).toEqual({ success: true, food: expect.objectContaining({ id: 'kanon' }) });
  });

  it('returns food: null without an error when nothing matches', async () => {
    configureLookupSupabase([]);

    const result = await TestBed.inject(FoodSearchService).findByBarcode('unknown');

    expect(result).toEqual({ success: true, food: null });
  });

  it('returns a generic error when the query fails', async () => {
    configureLookupSupabase(null, { message: 'boom' });

    const result = await TestBed.inject(FoodSearchService).findByBarcode('4008400123456');

    expect(result).toEqual({ success: false, message: 'Food konnte nicht geladen werden.' });
  });
});

describe('FoodSearchService.lookupBarcode (ADR-0010 Punkt 4/5, ADR-0022 Punkt 4)', () => {
  const completeOff = {
    status: 'found',
    product: {
      product_name: 'Müsli',
      nutriments: {
        'energy-kcal_100g': 400,
        proteins_100g: 8,
        carbohydrates_100g: 65,
        fat_100g: 10,
      },
    },
  };

  it('returns "found" from the DB without calling Open Food Facts', async () => {
    configureLookupSupabase([foodRow('f1', '4008400123456')]);
    const fetchProductByBarcode = vi.fn();
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('4008400123456');

    expect(fetchProductByBarcode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'found', food: expect.objectContaining({ id: 'f1' }) });
  });

  it('a 12-digit scan finds a stored 13-digit canonical row, no OFF call', async () => {
    configureLookupSupabase([foodRow('f1', '0036000291452')]);
    const fetchProductByBarcode = vi.fn();
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('036000291452');

    expect(fetchProductByBarcode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'found', food: expect.objectContaining({ id: 'f1' }) });
  });

  it('a 13-digit scan finds a legacy 12-digit row, no OFF call', async () => {
    configureLookupSupabase([foodRow('alt', '036000291452')]);
    const fetchProductByBarcode = vi.fn();
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('0036000291452');

    expect(fetchProductByBarcode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'found', food: expect.objectContaining({ id: 'alt' }) });
  });

  it('two hits: the canonical row wins', async () => {
    configureLookupSupabase([foodRow('alt', '036000291452'), foodRow('kanon', '0036000291452')]);

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('036000291452');

    expect(result).toEqual({ status: 'found', food: expect.objectContaining({ id: 'kanon' }) });
  });

  it('saves a new complete OFF hit with the canonical barcode; OFF is asked with it too', async () => {
    const { insert } = configureLookupSupabase([]);
    const fetchProductByBarcode = vi.fn().mockResolvedValue(completeOff);
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('036000291452');

    expect(fetchProductByBarcode).toHaveBeenCalledWith('0036000291452');
    expect(insert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ source: 'off', barcode: '0036000291452' }),
    );
    expect(result).toEqual({
      status: 'off-complete',
      food: expect.objectContaining({ id: 'new-off' }),
    });
  });

  it('does NOT save an incomplete OFF hit — prefill carries the canonical barcode', async () => {
    const { insert } = configureLookupSupabase([]);
    const fetchProductByBarcode = vi.fn().mockResolvedValue({
      status: 'found',
      product: { product_name: 'Unvollständig', nutriments: { proteins_100g: 5 } },
    });
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode(' 036000291452 ');

    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'off-incomplete',
      prefill: {
        name: 'Unvollständig',
        kcal100g: '',
        proteinG100g: '5',
        carbsG100g: '',
        fatG100g: '',
        defaultPortionG: '',
        barcode: '0036000291452',
      },
    });
  });

  it('non-numeric code (code_128) behaves as before: trimmed raw value for lookup, OFF and insert', async () => {
    const { inFn, insert } = configureLookupSupabase([]);
    const fetchProductByBarcode = vi.fn().mockResolvedValue(completeOff);
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    await TestBed.inject(FoodSearchService).lookupBarcode(' AB-123 ');

    expect(inFn).toHaveBeenCalledWith('barcode', ['AB-123']);
    expect(fetchProductByBarcode).toHaveBeenCalledWith('AB-123');
    expect(insert.mock.calls[0][0]).toEqual(expect.objectContaining({ barcode: 'AB-123' }));
  });

  it('distinguishes "not-found" from "error"', async () => {
    configureLookupSupabase([]);
    const fetchProductByBarcode = vi.fn().mockResolvedValue({ status: 'not-found' });
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('4008400123456');

    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns "error" with a message when Open Food Facts is unreachable', async () => {
    configureLookupSupabase([]);
    const fetchProductByBarcode = vi.fn().mockResolvedValue({
      status: 'error',
      message: 'Open Food Facts ist gerade nicht erreichbar.',
    });
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('4008400123456');

    expect(result).toEqual({
      status: 'error',
      message: 'Open Food Facts ist gerade nicht erreichbar.',
    });
  });

  it('returns "error" when the local lookup fails, without calling OFF', async () => {
    configureLookupSupabase(null, { message: 'boom' });
    const fetchProductByBarcode = vi.fn();
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const result = await TestBed.inject(FoodSearchService).lookupBarcode('4008400123456');

    expect(fetchProductByBarcode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', message: 'Food konnte nicht geladen werden.' });
  });
});
