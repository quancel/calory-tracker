import { Injectable, inject } from '@angular/core';
import { DAY_SNAPSHOT_STORE, LocalDbService } from '../core/local-db.service';
import { SupabaseService } from '../core/supabase.service';
import type { MealType } from '../core/meal-type.constants';
import type { CopySourceEntry, DiaryEntry, DiaryGoal } from './models/diary.model';

/** Domain-Ergebnis eines Tages-Ladevorgangs — kein Supabase-Typ nach außen. */
export type LoadDayResult =
  | { success: true; entries: DiaryEntry[]; goal: DiaryGoal | null }
  | { success: false; message: string };

/** Domain-Ergebnis eines eigenständigen Ziel-Nachladevorgangs (ADR-0007 Punkt 5). */
export type LoadGoalResult =
  { success: true; goal: DiaryGoal | null } | { success: false; message: string };

/** Domain-Ergebnis der schlanken Kopiervorlagen-Abfrage (ADR-0013 Punkt 6). */
export type LoadCopySourceResult =
  { success: true; entries: CopySourceEntry[] } | { success: false; message: string };

interface RawFood {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

interface RawEntry {
  id: string;
  meal_type: MealType;
  amount_g: number;
  created_at: string;
  // PostgREST liefert die eingebettete 1:1-Relation als Objekt (FK auf foods).
  foods: RawFood | null;
}

interface RawGoal {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface RawCopySourceEntry {
  id: string;
  meal_type: MealType;
  amount_g: number;
  food_id: string;
}

function mapGoal(raw: RawGoal | null): DiaryGoal | null {
  return raw
    ? { kcal: raw.kcal, proteinG: raw.protein_g, carbsG: raw.carbs_g, fatG: raw.fat_g }
    : null;
}

/** Schnappschuss des zuletzt geladenen Tages + Zielzeile (ADR-0016 Punkt 8) — fester Schlüssel `DAY_SNAPSHOT_KEY`, ein Datum je Schnappschuss. */
interface DaySnapshot {
  date: string;
  entries: DiaryEntry[];
  goal: DiaryGoal | null;
}

const DAY_SNAPSHOT_KEY = 'current';

/**
 * Datenzugriff der Tagesansicht (siehe ADR-0006). Lädt die Einträge eines
 * Tages mit eingebetteten Foods in einer PostgREST-Abfrage sowie die
 * Zielzeile in einer zweiten. Bewusste, dokumentierte Abweichung von der
 * Context-Map-Regel „diary liest Foods über food-catalog": das gilt für den
 * *Katalog*-Zugriff, nicht für den eigenen Lesepfad hier (ADR-0006 Punkt 1).
 *
 * Kein `user_id`-Filter im Client — die Abgrenzung leisten die
 * RLS-Policies aus `supabase/migrations/20260920161132_init_schema_rls.sql`
 * (ADR-0004).
 *
 * Ab Paket PO-2026-09-20-014 (ADR-0016 Punkt 8): `loadDay()` schreibt nach
 * jedem erfolgreichen Laden einen Schnappschuss (Tag + Zielzeile) über
 * `core/local-db.service.ts`. Scheitert die Abfrage (offline,
 * Netzwerkfehler) UND der Schnappschuss gehört zum angefragten Datum, wird
 * er als Anzeige-Ersatz verwendet statt eines Fehlerzustands — reiner
 * Lesecache, nie Schreibquelle. Gehört der Schnappschuss zu einem anderen
 * Tag (Navigation auf einen Tag, der offline noch nie geladen wurde), bleibt
 * es beim regulären Fehlerzustand.
 */
@Injectable({ providedIn: 'root' })
export class DiaryService {
  private readonly supabase = inject(SupabaseService);
  private readonly localDb = inject(LocalDbService);

  async loadDay(dateKey: string): Promise<LoadDayResult> {
    const [entriesResponse, goalResponse] = await Promise.all([
      this.supabase.client
        .from('entries')
        .select(
          'id, meal_type, amount_g, created_at, foods(id, name, kcal_100g, protein_100g, carbs_100g, fat_100g)',
        )
        .eq('date', dateKey)
        .order('created_at', { ascending: true }),
      this.supabase.client.from('goals').select('kcal, protein_g, carbs_g, fat_g').maybeSingle(),
    ]);

    if (entriesResponse.error || goalResponse.error) {
      const snapshot = await this.localDb.get<DaySnapshot>(DAY_SNAPSHOT_STORE, DAY_SNAPSHOT_KEY);
      if (snapshot && snapshot.date === dateKey) {
        return { success: true, entries: snapshot.entries, goal: snapshot.goal };
      }
      return { success: false, message: 'Tageswerte konnten nicht geladen werden.' };
    }

    const rawEntries = (entriesResponse.data ?? []) as unknown as RawEntry[];
    // Ein Eintrag ohne eingebettetes Food (z. B. gelöschtes Food bei
    // `on delete restrict` kann eigentlich nicht vorkommen) wird defensiv
    // übersprungen statt mit erfundenen Nährwerten in die Summe zu fließen.
    const entries: DiaryEntry[] = rawEntries
      .filter((raw): raw is RawEntry & { foods: RawFood } => raw.foods !== null)
      .map((raw) => ({
        id: raw.id,
        mealType: raw.meal_type,
        amountG: raw.amount_g,
        createdAt: raw.created_at,
        syncState: 'synced',
        food: {
          id: raw.foods.id,
          name: raw.foods.name,
          kcal100g: raw.foods.kcal_100g,
          proteinG100g: raw.foods.protein_100g,
          carbsG100g: raw.foods.carbs_100g,
          fatG100g: raw.foods.fat_100g,
        },
      }));

    const goal = mapGoal(goalResponse.data as RawGoal | null);

    await this.localDb.put(
      DAY_SNAPSHOT_STORE,
      { date: dateKey, entries, goal } satisfies DaySnapshot,
      DAY_SNAPSHOT_KEY,
    );

    return { success: true, entries, goal };
  }

  /**
   * Lädt ausschließlich die Zielzeile neu — eigene Methode für den
   * gezielten Nachlade-Weg beim Aktivieren der Tagebuch-Route (ADR-0007
   * Punkt 5), ohne die bereits geladenen Einträge des Tages erneut
   * abzufragen.
   */
  async loadGoal(): Promise<LoadGoalResult> {
    const response = await this.supabase.client
      .from('goals')
      .select('kcal, protein_g, carbs_g, fat_g')
      .maybeSingle();

    if (response.error) {
      return { success: false, message: 'Ziel konnte nicht geladen werden.' };
    }

    return { success: true, goal: mapGoal(response.data as RawGoal | null) };
  }

  /**
   * Schlanke Kopiervorlage eines Tages für „gestern kopieren"
   * (ADR-0013 Punkt 6): nur `id, meal_type, amount_g, food_id`, **ohne**
   * eingebettete Foods — kopiert werden ausschließlich `food_id`/`amount_g`,
   * Nährwerte ergeben sich beim späteren Lesen. Speist zugleich die Zähler
   * des globalen Auslösers und der Sektions-Badges; `dateKey` ist dabei der
   * Bezugstag (`angezeigter Tag − 1`, ADR-0013 Punkt 7), nicht der
   * angezeigte Tag selbst.
   */
  async loadCopySource(dateKey: string): Promise<LoadCopySourceResult> {
    const response = await this.supabase.client
      .from('entries')
      .select('id, meal_type, amount_g, food_id')
      .eq('date', dateKey)
      .order('created_at', { ascending: true });

    if (response.error) {
      return { success: false, message: 'Kopiervorlage konnte nicht geladen werden.' };
    }

    const rawEntries = (response.data ?? []) as unknown as RawCopySourceEntry[];
    const entries: CopySourceEntry[] = rawEntries.map((raw) => ({
      id: raw.id,
      mealType: raw.meal_type,
      amountG: raw.amount_g,
      foodId: raw.food_id,
    }));

    return { success: true, entries };
  }
}
