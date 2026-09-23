/**
 * Domänenmodelle der Tagesansicht (siehe ADR-0006). Reine Typen, kein
 * Angular-Import — der Rohzugriff auf Supabase (snake_case) bleibt in
 * `diary.service.ts` gekapselt und mappt auf diese Typen.
 *
 * `MealType`/`MEAL_TYPE_ORDER`/`MEAL_TYPE_LABELS` sind seit Paket
 * PO-2026-09-20-007 in `core/meal-type.constants.ts` (ADR-0009 Punkt 6,
 * zweiter Nutzer `food-catalog`) — kein Re-Export hier, importiert direkt
 * von dort. `DateLabel`/`DateLabelKind` (Kalendertag-Beschriftung) und
 * `ProgressResult` (Ziel-/Überschussberechnung) sind seit Paket
 * PO-2026-09-20-012 in `core/date.calculations.ts` bzw.
 * `core/progress.calculations.ts` (zweiter Nutzer `stats`, ADR-0014
 * Punkt 7) — ebenfalls kein Re-Export hier.
 */

import type { MealType } from '../../core/meal-type.constants';

export interface DiaryEntryFood {
  id: string;
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
}

/**
 * `syncState` ab Paket PO-2026-09-20-014 (ADR-0016 Punkt 7): `'synced'` ist
 * der Wert für jeden Eintrag aus dem Server-Lesepfad (`diary.service.ts`).
 * `'pending'`/`'failed'` kommen ausschließlich von Einträgen, die
 * `DiaryStore` aus der Puffer-Queue (`core/entry-queue.service.ts`)
 * einmischt.
 */
export type DiaryEntrySyncState = 'synced' | 'pending' | 'failed';

export interface DiaryEntry {
  id: string;
  mealType: MealType;
  amountG: number;
  createdAt: string;
  syncState: DiaryEntrySyncState;
  food: DiaryEntryFood;
}

/**
 * Zielzeile des Nutzers. `null` bedeutet „keine Zeile vorhanden". Ein
 * einzelner Wert `<= 0` bedeutet „für dieses Makro kein Ziel gesetzt"
 * (ADR-0006 Punkt 4) — wird in `computeProgress` ausgewertet, nicht hier.
 */
export interface DiaryGoal {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DayTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealSection {
  mealType: MealType;
  label: string;
  kcal: number;
  entries: readonly DiaryEntry[];
}

/**
 * Schlanker Eintrag der Kopiervorlage (Vortag) — nur die Felder, die
 * „gestern kopieren" braucht: `food_id`/`amount_g` für den Insert,
 * `meal_type` für die Sektions-Badges (ADR-0013 Punkt 6). Bewusst ohne
 * eingebettetes Food.
 */
export interface CopySourceEntry {
  id: string;
  mealType: MealType;
  amountG: number;
  foodId: string;
}

/**
 * Kontext einer Kopieraktion (ADR-0013 Punkt 4): `'global'` für „ganzen Tag
 * kopieren", ein `MealType` für „Sektion kopieren". Pro Kontext existiert
 * höchstens ein Undo-Zustand gleichzeitig.
 */
export type CopyContext = 'global' | MealType;

/**
 * Undo-Zustand einer einzelnen Kopieraktion — reiner Client-State im
 * `DiaryStore`, nie persistiert (ADR-0013 Punkt 4). `entryIds` sind die
 * beim Insert zurückgegebenen IDs, ausschließlich darüber läuft die
 * Rücknahme (nie über eine Merkmalssuche).
 */
export interface CopyUndoState {
  sourceDateKey: string;
  entryIds: readonly string[];
  count: number;
}

/** Anzeige-Projektion eines `CopyUndoState` für die Inline-Rückmeldung (Text statt Rohdaten). */
export interface CopyFeedbackView {
  sourceDateLabel: string;
  count: number;
}
