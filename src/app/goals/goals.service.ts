import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { goalFieldConfig } from './goals.calculations';
import type { GoalFieldKey, GoalValues } from './models/goal.model';
import type { IntakeDay } from './models/weight.model';

/** Domain-Ergebnis eines Ziel-Ladevorgangs — kein Supabase-Typ nach außen. */
export type LoadGoalResult =
  { success: true; goal: GoalValues | null } | { success: false; message: string };

/** Domain-Ergebnis eines einzelnen Feld-Speichervorgangs. */
export type SaveGoalFieldResult = { success: true } | { success: false; message: string };

/** Domain-Ergebnis des Ist-Zufuhr-Ladevorgangs für den Vorschlag (ADR-0017 Punkt 4). */
export type LoadIntakeResult =
  { success: true; days: IntakeDay[] } | { success: false; message: string };

interface RawGoalRow {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  target_weight_kg: number | null;
}

interface RawIntakeFood {
  kcal_100g: number;
}

interface RawIntakeEntry {
  date: string;
  amount_g: number;
  // PostgREST liefert die eingebettete 1:1-Relation als Objekt (FK auf foods).
  foods: RawIntakeFood | null;
}

/**
 * Datenzugriff der Ziele-Ansicht sowie der Ist-Zufuhr für den
 * Kalorienziel-Vorschlag (ADR-0007, ADR-0017, ADR-0018). Einziger
 * Schreibweg auf `goals`. Der Tabellenzugriff auf `weight_logs` liegt seit
 * ADR-0019 in `core/weight-logs.service.ts` (zweiter Nutzer `diary`). Kein
 * `user_id`-Filter im Client — RLS grenzt auf die eigene Zeile/eigenen
 * Datensätze ein.
 */
@Injectable({ providedIn: 'root' })
export class GoalsService {
  private readonly supabase = inject(SupabaseService);

  async loadGoal(): Promise<LoadGoalResult> {
    const response = await this.supabase.client
      .from('goals')
      .select('kcal, protein_g, carbs_g, fat_g, target_weight_kg')
      .maybeSingle();

    if (response.error) {
      return { success: false, message: 'Ziele konnten nicht geladen werden.' };
    }

    const raw = response.data as RawGoalRow | null;
    const goal: GoalValues | null = raw
      ? {
          kcal: raw.kcal,
          carbsG: raw.carbs_g,
          proteinG: raw.protein_g,
          fatG: raw.fat_g,
          targetWeightKg: raw.target_weight_kg,
        }
      : null;

    return { success: true, goal };
  }

  /**
   * Ein Upsert mit **genau einer** Wertspalte (ADR-0007 Punkt 3). PostgREST
   * erzeugt daraus `on conflict (user_id) do update set <spalte> = ...` —
   * die übrigen bereits gespeicherten Werte bleiben unangetastet. Bei
   * Erstanlage greifen die DB-Defaults (`0`) der vier übrigen Spalten
   * (Migration `20260921090000_goals_defaults_checks.sql`); `target_weight_kg`
   * hat keinen Default und bleibt `null` (ADR-0018 Punkt 2).
   *
   * `value: null` ist nur für das Zielgewicht ein gültiger Aufruf (Feld
   * geleert → Zielwert entfernen, ADR-0018 Punkt 2); die vier kcal-/Makro-
   * Felder liefern hier nach der Store-Validierung immer eine Zahl.
   */
  async saveField(key: GoalFieldKey, value: number | null): Promise<SaveGoalFieldResult> {
    const userId = this.supabase.userId();
    if (!userId) {
      return { success: false, message: 'Nicht angemeldet.' };
    }

    const column = goalFieldConfig(key).column;
    const payload: Record<string, unknown> = {
      user_id: userId,
      [column]: value,
      updated_at: new Date().toISOString(),
    };

    const response = await this.supabase.client
      .from('goals')
      .upsert(payload, { onConflict: 'user_id' });

    if (response.error) {
      return { success: false, message: 'Ziel konnte nicht gespeichert werden.' };
    }

    return { success: true };
  }

  /**
   * Zweite, schlanke Bereichsabfrage auf `entries` (ADR-0017 Punkt 4): nur
   * `foods(kcal_100g)`, keine Makros — der Verlauf (`stats.service.ts`)
   * liest denselben Zeitraum mit voller Makro-Projektion, bewusste
   * Doppelung (code-conventions.md „Abweichungen").
   */
  async loadIntake(startKey: string, endKey: string): Promise<LoadIntakeResult> {
    const response = await this.supabase.client
      .from('entries')
      .select('date, amount_g, foods(kcal_100g)')
      .gte('date', startKey)
      .lte('date', endKey);

    if (response.error) {
      return { success: false, message: 'Ist-Zufuhr konnte nicht geladen werden.' };
    }

    const rawEntries = (response.data ?? []) as unknown as RawIntakeEntry[];
    const kcalByDate = new Map<string, number>();
    for (const raw of rawEntries) {
      // Ein Eintrag ohne eingebettetes Food wird defensiv übersprungen statt
      // mit erfundenen kcal in die Summe zu fließen (gleiches Muster wie
      // stats.service.ts).
      if (raw.foods === null) continue;
      const kcal = (raw.amount_g / 100) * raw.foods.kcal_100g;
      kcalByDate.set(raw.date, (kcalByDate.get(raw.date) ?? 0) + kcal);
    }

    const days: IntakeDay[] = Array.from(kcalByDate.entries()).map(([dateKey, kcal]) => ({
      dateKey,
      kcal,
    }));

    return { success: true, days };
  }
}
