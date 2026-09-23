import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/** Eine einzelne Gewichtsmessung aus `weight_logs`. */
export interface WeightLogEntry {
  readonly id: string;
  /** Lokaler Kalendertag `YYYY-MM-DD` (ADR-0006 Punkt 2). */
  readonly dateKey: string;
  readonly weightKg: number;
}

/** Domain-Ergebnis eines Gewichtslog-Ladevorgangs — kein Supabase-Typ nach außen. */
export type LoadWeightLogsResult =
  { success: true; logs: WeightLogEntry[] } | { success: false; message: string };

export type SaveWeightLogResult = { success: true } | { success: false; message: string };
export type DeleteWeightLogResult = { success: true } | { success: false; message: string };

interface RawWeightLogRow {
  id: string;
  date: string;
  weight_kg: number;
}

/**
 * Einziger Tabellenzugriff auf `weight_logs` (ADR-0019, löst den
 * Service-Teil von ADR-0017 ab). Liegt in `core/`, weil zwei Features die
 * Tabelle lesen und schreiben: `goals` (Gewicht-Ansicht, Diagramm,
 * Vorschlag) und `diary` (Schnelleingabe + Mini-Verlauf auf der
 * Tagesansicht). Gleiches Muster wie `core/entries.service.ts`: Features
 * erfahren von Änderungen über das `revision`-Signal, `core/` ruft nie in
 * ein Feature hinein. Kein `user_id`-Filter beim Lesen — RLS grenzt ein.
 */
@Injectable({ providedIn: 'root' })
export class WeightLogsService {
  private readonly supabase = inject(SupabaseService);

  private readonly revisionState = signal(0);

  /** Erhöht sich nach jedem erfolgreichen Schreibvorgang auf `weight_logs`. */
  readonly revision = this.revisionState.asReadonly();

  /**
   * Lädt die Gewichtsmessungen im angegebenen Kalendertag-Bereich
   * (`gte`/`lte` auf `date`), Reihenfolge ohne Belang — die Sortierung
   * übernimmt die jeweilige Rechenlogik des Features.
   */
  async loadWeightLogs(startKey: string, endKey: string): Promise<LoadWeightLogsResult> {
    const response = await this.supabase.client
      .from('weight_logs')
      .select('id, date, weight_kg')
      .gte('date', startKey)
      .lte('date', endKey);

    if (response.error) {
      return { success: false, message: 'Gewichtseinträge konnten nicht geladen werden.' };
    }

    const rows = (response.data ?? []) as RawWeightLogRow[];
    const logs: WeightLogEntry[] = rows.map((row) => ({
      id: row.id,
      dateKey: row.date,
      weightKg: row.weight_kg,
    }));

    return { success: true, logs };
  }

  /**
   * Schreibt/ersetzt die Gewichtsmessung des angegebenen Tages
   * (`unique (user_id, date)`, ADR-0017 Punkt 2). Eine Rückfrage vor dem
   * Ersetzen ist reine UI — hier wird immer unbedingt upserted, die
   * Datenbank garantiert nur die Eindeutigkeit.
   */
  async upsertWeightLog(dateKey: string, weightKg: number): Promise<SaveWeightLogResult> {
    const userId = this.supabase.userId();
    if (!userId) {
      return { success: false, message: 'Nicht angemeldet.' };
    }

    const response = await this.supabase.client.from('weight_logs').upsert(
      {
        user_id: userId,
        date: dateKey,
        weight_kg: weightKg,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' },
    );

    if (response.error) {
      return { success: false, message: 'Gewicht konnte nicht gespeichert werden.' };
    }

    this.bumpRevision();
    return { success: true };
  }

  async deleteWeightLog(id: string): Promise<DeleteWeightLogResult> {
    const response = await this.supabase.client.from('weight_logs').delete().eq('id', id);

    if (response.error) {
      return { success: false, message: 'Gewichtseintrag konnte nicht gelöscht werden.' };
    }

    this.bumpRevision();
    return { success: true };
  }

  private bumpRevision(): void {
    this.revisionState.update((current) => current + 1);
  }
}
