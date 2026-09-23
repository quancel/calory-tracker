import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import type { StatsEntry, StatsGoal } from './models/stats.model';

/** Domain-Ergebnis der Perioden-Abfrage — kein Supabase-Typ nach außen. */
export type LoadPeriodResult =
  | { success: true; entries: StatsEntry[] }
  | { success: false; message: string };

/** Domain-Ergebnis des Ziel-Ladevorgangs (zweite Lesestelle, ADR-0014 Punkt 6). */
export type LoadStatsGoalResult =
  | { success: true; goal: StatsGoal | null }
  | { success: false; message: string };

interface RawFood {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

interface RawEntry {
  date: string;
  amount_g: number;
  // PostgREST liefert die eingebettete 1:1-Relation als Objekt (FK auf foods).
  foods: RawFood | null;
}

interface RawGoal {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function mapGoal(raw: RawGoal | null): StatsGoal | null {
  return raw
    ? { kcal: raw.kcal, proteinG: raw.protein_g, carbsG: raw.carbs_g, fatG: raw.fat_g }
    : null;
}

/**
 * Datenzugriff des Verlaufs (siehe ADR-0014 Punkt 5/6). Lädt die sichtbare
 * Periode mit **einer** Bereichsabfrage auf `entries` (`gte`/`lte` auf
 * `date`) in schlanker Projektion — ohne `id`, `meal_type`: der Verlauf
 * zeigt keine Einzeleinträge, nur Tagesaggregate. Die Zielzeile kommt als
 * zweite, einzeilige Abfrage — dieselbe Lese-Semantik wie
 * `diary/diary.service.ts` (bewusste zweite Lesestelle, code-conventions.md
 * „Abweichungen").
 *
 * Kein `user_id`-Filter im Client — die Abgrenzung leisten die
 * RLS-Policies (ADR-0004); der bestehende Index
 * `entries_user_id_date_idx` deckt den Bereichsfilter ab.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly supabase = inject(SupabaseService);

  async loadPeriod(startKey: string, endKey: string): Promise<LoadPeriodResult> {
    const response = await this.supabase.client
      .from('entries')
      .select('date, amount_g, foods(kcal_100g, protein_100g, carbs_100g, fat_100g)')
      .gte('date', startKey)
      .lte('date', endKey);

    if (response.error) {
      return { success: false, message: 'Verlaufsdaten konnten nicht geladen werden.' };
    }

    const rawEntries = (response.data ?? []) as unknown as RawEntry[];
    // Ein Eintrag ohne eingebettetes Food wird defensiv übersprungen statt
    // mit erfundenen Nährwerten in die Summe zu fließen (gleiches Muster
    // wie diary.service.ts).
    const entries: StatsEntry[] = rawEntries
      .filter((raw): raw is RawEntry & { foods: RawFood } => raw.foods !== null)
      .map((raw) => ({
        dateKey: raw.date,
        amountG: raw.amount_g,
        food: {
          kcal100g: raw.foods.kcal_100g,
          proteinG100g: raw.foods.protein_100g,
          carbsG100g: raw.foods.carbs_100g,
          fatG100g: raw.foods.fat_100g,
        },
      }));

    return { success: true, entries };
  }

  async loadGoal(): Promise<LoadStatsGoalResult> {
    const response = await this.supabase.client
      .from('goals')
      .select('kcal, protein_g, carbs_g, fat_g')
      .maybeSingle();

    if (response.error) {
      return { success: false, message: 'Ziel konnte nicht geladen werden.' };
    }

    return { success: true, goal: mapGoal(response.data as RawGoal | null) };
  }
}
