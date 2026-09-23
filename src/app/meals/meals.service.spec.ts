import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../core/supabase.service';
import { MealsService } from './meals.service';

function makeSupabaseStub(overrides: {
  from?: ReturnType<typeof vi.fn>;
  userId?: () => string | null;
}) {
  return {
    provide: SupabaseService,
    useValue: {
      client: { from: overrides.from ?? vi.fn() },
      userId: overrides.userId ?? (() => 'u1'),
    },
  };
}

describe('MealsService.createMeal (ADR-0012 Punkt 7 — Zwei-Schritt mit Kompensation)', () => {
  it('inserts the meal, then the items, returns the new mealId', async () => {
    const mealSingle = vi.fn().mockResolvedValue({ data: { id: 'm1' }, error: null });
    const mealInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: mealSingle }),
    });
    const itemsInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'meals') return { insert: mealInsert };
      if (table === 'meal_items') return { insert: itemsInsert };
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from, userId: () => 'u1' })] });
    const service = TestBed.inject(MealsService);

    const result = await service.createMeal({
      name: 'Frühstück-Bowl',
      items: [
        { foodId: 'f1', amountG: 150 },
        { foodId: 'f2', amountG: 30 },
      ],
    });

    expect(result).toEqual({ success: true, mealId: 'm1' });
    expect(mealInsert).toHaveBeenCalledWith({ name: 'Frühstück-Bowl', user_id: 'u1' });
    expect(itemsInsert).toHaveBeenCalledWith([
      { meal_id: 'm1', food_id: 'f1', amount_g: 150 },
      { meal_id: 'm1', food_id: 'f2', amount_g: 30 },
    ]);
  });

  it('returns a domain error without inserting when no user is signed in', async () => {
    const from = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from, userId: () => null })] });
    const service = TestBed.inject(MealsService);

    const result = await service.createMeal({ name: 'X', items: [] });

    expect(result).toEqual({ success: false, message: 'Nicht angemeldet.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('compensates by deleting the just-created meal when inserting items fails', async () => {
    const mealSingle = vi.fn().mockResolvedValue({ data: { id: 'm1' }, error: null });
    const mealInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: mealSingle }),
    });
    const itemsInsert = vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } });
    const mealDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const mealDelete = vi.fn().mockReturnValue({ eq: mealDeleteEq });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'meals') return { insert: mealInsert, delete: mealDelete };
      if (table === 'meal_items') return { insert: itemsInsert };
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.createMeal({
      name: 'Frühstück-Bowl',
      items: [{ foodId: 'f1', amountG: 150 }],
    });

    expect(result).toEqual({ success: false, message: 'Mahlzeit konnte nicht gespeichert werden.' });
    expect(mealDelete).toHaveBeenCalled();
    expect(mealDeleteEq).toHaveBeenCalledWith('id', 'm1');
  });

  it('does not call meal_items insert for an empty item list', async () => {
    const mealSingle = vi.fn().mockResolvedValue({ data: { id: 'm1' }, error: null });
    const mealInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: mealSingle }),
    });
    const itemsInsert = vi.fn();
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'meals') return { insert: mealInsert };
      if (table === 'meal_items') return { insert: itemsInsert };
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.createMeal({ name: 'Leer', items: [] });

    expect(result).toEqual({ success: true, mealId: 'm1' });
    expect(itemsInsert).not.toHaveBeenCalled();
  });

  it('returns a generic error when the meal insert itself fails', async () => {
    const mealSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'oops' } });
    const mealInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: mealSingle }),
    });
    const from = vi.fn().mockReturnValue({ insert: mealInsert });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.createMeal({ name: 'X', items: [] });

    expect(result).toEqual({ success: false, message: 'Mahlzeit konnte nicht angelegt werden.' });
  });
});

describe('MealsService.updateMeal (Positionen werden ERSETZT, kein Abgleich)', () => {
  it('updates the name, deletes all existing items, then inserts the new ones', async () => {
    const nameUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const nameUpdate = vi.fn().mockReturnValue({ eq: nameUpdateEq });
    const itemsDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const itemsDelete = vi.fn().mockReturnValue({ eq: itemsDeleteEq });
    const itemsInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'meals') return { update: nameUpdate };
      if (table === 'meal_items') return { delete: itemsDelete, insert: itemsInsert };
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.updateMeal('m1', {
      name: 'Neuer Name',
      items: [{ foodId: 'f9', amountG: 80 }],
    });

    expect(result).toEqual({ success: true });
    expect(nameUpdate).toHaveBeenCalledWith({ name: 'Neuer Name' });
    expect(nameUpdateEq).toHaveBeenCalledWith('id', 'm1');
    expect(itemsDeleteEq).toHaveBeenCalledWith('meal_id', 'm1');
    expect(itemsInsert).toHaveBeenCalledWith([{ meal_id: 'm1', food_id: 'f9', amount_g: 80 }]);
  });

  it('deletes existing items but does not insert when the new list is empty', async () => {
    const nameUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const itemsDelete = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const itemsInsert = vi.fn();
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'meals') return { update: nameUpdate };
      if (table === 'meal_items') return { delete: itemsDelete, insert: itemsInsert };
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.updateMeal('m1', { name: 'Ohne Positionen', items: [] });

    expect(result).toEqual({ success: true });
    expect(itemsInsert).not.toHaveBeenCalled();
  });

  it('returns a generic error and does not touch items when the name update fails', async () => {
    const nameUpdate = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: 'oops' } }) });
    const itemsDelete = vi.fn();
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'meals') return { update: nameUpdate };
      if (table === 'meal_items') return { delete: itemsDelete };
      throw new Error(`unexpected table ${table}`);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.updateMeal('m1', { name: 'X', items: [] });

    expect(result).toEqual({ success: false, message: 'Mahlzeit konnte nicht gespeichert werden.' });
    expect(itemsDelete).not.toHaveBeenCalled();
  });
});

describe('MealsService.deleteMeal', () => {
  it('deletes the meal (meal_items cascade via the DB)', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.deleteMeal('m1');

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('meals');
    expect(eq).toHaveBeenCalledWith('id', 'm1');
  });

  it('returns a generic error when the delete fails', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'oops' } });
    const from = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq }) });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [makeSupabaseStub({ from })] });
    const service = TestBed.inject(MealsService);

    const result = await service.deleteMeal('m1');

    expect(result).toEqual({ success: false, message: 'Mahlzeit konnte nicht gelöscht werden.' });
  });
});
