import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../core/supabase.service';
import { FoodSearchOffService } from './food-search.off.service';
import { FoodSearchService } from './food-search.service';

const FOOD_COLUMNS =
  'id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, default_portion_g, source, barcode, is_corrected';

function makeSelectQuery(response: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(response),
    }),
  };
}

describe('FoodSearchService.search', () => {
  let response: { data: unknown; error: unknown };
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    response = { data: [], error: null };
    from = vi.fn().mockImplementation((table: string) => {
      if (table === 'foods') return makeSelectQuery(response);
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
  });

  it('maps snake_case rows to the domain model, including a null default portion and barcode', async () => {
    response.data = [
      {
        id: 'f1',
        name: 'Apfel',
        kcal_100g: 52,
        protein_100g: 0.3,
        carbs_100g: 14,
        fat_100g: 0.2,
        default_portion_g: null,
        source: 'manual',
        barcode: null,
        is_corrected: false,
      },
    ];

    const service = TestBed.inject(FoodSearchService);
    const result = await service.search('');

    expect(result).toEqual({
      success: true,
      foods: [
        {
          id: 'f1',
          name: 'Apfel',
          kcal100g: 52,
          proteinG100g: 0.3,
          carbsG100g: 14,
          fatG100g: 0.2,
          defaultPortionG: null,
          source: 'manual',
          barcode: null,
          isCorrected: false,
        },
      ],
    });
  });

  it('does not filter server-side — query is not sent as an ilike condition', async () => {
    const service = TestBed.inject(FoodSearchService);
    await service.search('apfel');

    const selectQuery = from.mock.results[0].value;
    expect(selectQuery.select).toHaveBeenCalledWith(FOOD_COLUMNS);
  });

  it('returns an empty list when there are no rows yet', async () => {
    const service = TestBed.inject(FoodSearchService);
    const result = await service.search('');

    expect(result).toEqual({ success: true, foods: [] });
  });

  it('returns a generic error message when the query fails', async () => {
    response = { data: null, error: { message: 'network down' } };
    from.mockImplementation(() => makeSelectQuery(response));

    const service = TestBed.inject(FoodSearchService);
    const result = await service.search('');

    expect(result).toEqual({ success: false, message: 'Foods konnten nicht geladen werden.' });
  });
});

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

describe('FoodSearchService.findByBarcode', () => {
  it('queries by barcode, not the session cache (ADR-0010 Punkt 4)', async () => {
    const response = {
      data: {
        id: 'f1',
        name: 'Apfel',
        kcal_100g: 52,
        protein_100g: 0.3,
        carbs_100g: 14,
        fat_100g: 0.2,
        default_portion_g: null,
        source: 'manual',
        barcode: '4008400123456',
      },
      error: null,
    };
    const eq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(response) });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.findByBarcode('4008400123456');

    expect(from).toHaveBeenCalledWith('foods');
    expect(eq).toHaveBeenCalledWith('barcode', '4008400123456');
    expect(result).toEqual({
      success: true,
      food: expect.objectContaining({ id: 'f1', barcode: '4008400123456' }),
    });
  });

  it('returns food: null without an error when nothing matches', async () => {
    const eq = vi
      .fn()
      .mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.findByBarcode('unknown');

    expect(result).toEqual({ success: true, food: null });
  });
});

describe('FoodSearchService.lookupBarcode (ADR-0010 Punkt 4/5)', () => {
  function configureSupabase(localFood: unknown) {
    const eq = vi
      .fn()
      .mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: localFood, error: null }),
      });
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'new-off',
            name: 'Müsli',
            kcal_100g: 400,
            protein_100g: 8,
            carbs_100g: 65,
            fat_100g: 10,
            default_portion_g: null,
            source: 'off',
            barcode: '123',
          },
          error: null,
        }),
      }),
    });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }), insert });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
    return { from, insert };
  }

  it('returns "found" from the DB without calling Open Food Facts', async () => {
    configureSupabase({
      id: 'f1',
      name: 'Apfel',
      kcal_100g: 52,
      protein_100g: 0.3,
      carbs_100g: 14,
      fat_100g: 0.2,
      default_portion_g: null,
      source: 'manual',
      barcode: '123',
    });
    const fetchProductByBarcode = vi.fn();
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.lookupBarcode('123');

    expect(fetchProductByBarcode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'found', food: expect.objectContaining({ id: 'f1' }) });
  });

  it('saves a complete OFF hit with source "off" and returns "off-complete"', async () => {
    const { insert } = configureSupabase(null);
    const fetchProductByBarcode = vi.fn().mockResolvedValue({
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
    });
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.lookupBarcode('123');

    expect(insert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ source: 'off', barcode: '123' }),
    );
    expect(result).toEqual({
      status: 'off-complete',
      food: expect.objectContaining({ id: 'new-off' }),
    });
  });

  it('does NOT save an incomplete OFF hit — returns "off-incomplete" with a prefill instead', async () => {
    const { insert } = configureSupabase(null);
    const fetchProductByBarcode = vi.fn().mockResolvedValue({
      status: 'found',
      product: { product_name: 'Unvollständig', nutriments: { proteins_100g: 5 } },
    });
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.lookupBarcode('123');

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
        barcode: '123',
      },
    });
  });

  it('distinguishes "not-found" from "error"', async () => {
    configureSupabase(null);
    const fetchProductByBarcode = vi.fn().mockResolvedValue({ status: 'not-found' });
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.lookupBarcode('123');

    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns "error" with a message when Open Food Facts is unreachable', async () => {
    configureSupabase(null);
    const fetchProductByBarcode = vi
      .fn()
      .mockResolvedValue({
        status: 'error',
        message: 'Open Food Facts ist gerade nicht erreichbar.',
      });
    TestBed.overrideProvider(FoodSearchOffService, { useValue: { fetchProductByBarcode } });

    const service = TestBed.inject(FoodSearchService);
    const result = await service.lookupBarcode('123');

    expect(result).toEqual({
      status: 'error',
      message: 'Open Food Facts ist gerade nicht erreichbar.',
    });
  });
});
