/**
 * Reine Rechenlogik des Verlaufs — ohne DI, ohne Angular-Import, ohne
 * UI-Wissen (siehe code-conventions.md „Wo was hingehört", ADR-0014
 * Punkt 5). `stats.store.ts` ruft diese Funktionen ausschließlich in
 * `computed` auf.
 *
 * Perioden-Arithmetik (Woche Mo–So, Monat, Anker-Tag) bleibt hier in
 * `stats` — nur die Kalendertag-Grundoperationen (`addDaysToKey`,
 * `diffInDays`, `todayKey`) kommen aus `core/date.calculations.ts`
 * (ADR-0014 Punkt 7/8). Die Mengenumrechnung nutzt `computeLiveNutrition()`
 * aus `core/foods.calculations.ts` — die Formel wird hier nicht erneut
 * geschrieben (ADR-0014 Punkt 5).
 */

import { addDaysToKey, diffInDays, todayKey } from '../core/date.calculations';
import { computeLiveNutrition } from '../core/foods.calculations';
import { GOAL_OVERSHOOT_TOLERANCE } from '../core/nutrition.constants';
import type {
  DayBarState,
  DayBucket,
  DayTotals,
  PeriodAverages,
  PeriodBounds,
  PeriodKind,
  StatsEntry,
} from './models/stats.model';

const MONTH_LABELS_DE_SHORT = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

const MONTH_LABELS_DE_FULL = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function parseDateKey(dateKey: string): { year: number; monthIndex0: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, monthIndex0: month - 1, day };
}

function buildDateRange(startKey: string, endKey: string): string[] {
  const length = diffInDays(startKey, endKey) + 1;
  const keys: string[] = [];
  for (let i = 0; i < length; i++) {
    keys.push(addDaysToKey(startKey, i));
  }
  return keys;
}

/** Montag der Woche, die `dateKey` enthält (Wochenstart Montag). */
function mondayOfWeek(dateKey: string): string {
  const { year, monthIndex0, day } = parseDateKey(dateKey);
  const weekday = new Date(year, monthIndex0, day).getDay(); // 0=So..6=Sa
  const offsetFromMonday = (weekday + 6) % 7; // Mo=0, Di=1, ..., So=6
  return addDaysToKey(dateKey, -offsetFromMonday);
}

/**
 * Periodengrenzen ab dem Anker-Tag: Woche Mo–So (enthält `anchorKey`),
 * Monat (Kalendermonat, der `anchorKey` enthält).
 */
export function computePeriodBounds(kind: PeriodKind, anchorKey: string): PeriodBounds {
  if (kind === 'week') {
    const startKey = mondayOfWeek(anchorKey);
    const endKey = addDaysToKey(startKey, 6);
    return { startKey, endKey, dateKeys: buildDateRange(startKey, endKey) };
  }

  const { year, monthIndex0 } = parseDateKey(anchorKey);
  const startKey = `${year}-${pad2(monthIndex0 + 1)}-01`;
  const lastDayOfMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const endKey = `${year}-${pad2(monthIndex0 + 1)}-${pad2(lastDayOfMonth)}`;
  return { startKey, endKey, dateKeys: buildDateRange(startKey, endKey) };
}

/**
 * Anker-Tag beim Wechsel Woche ↔ Monat (design-conventions.md
 * „Kontext-Erhalt beim Wechsel Woche ↔ Monat"): die neue Periode enthält
 * immer den ersten Tag der zuvor sichtbaren Periode — oder „heute", falls
 * die zuvor sichtbare Periode „heute" enthält. Kein Rücksprung auf die
 * aktuelle Periode bei jedem Wechsel.
 */
export function anchorForKindChange(
  previousBounds: PeriodBounds,
  todayKeyValue: string = todayKey(),
): string {
  return previousBounds.dateKeys.includes(todayKeyValue) ? todayKeyValue : previousBounds.startKey;
}

/** Anker-Tag der vorherigen/nächsten Periode derselben Art (±1 Woche bzw. ±1 Monat). */
export function shiftPeriod(kind: PeriodKind, bounds: PeriodBounds, direction: 1 | -1): string {
  if (kind === 'week') {
    return addDaysToKey(bounds.startKey, direction * 7);
  }

  const { year, monthIndex0 } = parseDateKey(bounds.startKey);
  const shifted = new Date(year, monthIndex0 + direction, 1);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}-01`;
}

/**
 * Vorwärtsgrenze der Periodennavigation (ADR-0014 Punkt 8): die nächste
 * Periode ist erreichbar, solange sie mindestens einen Tag `<= heute +
 * MAX_FORWARD_DAYS` enthält — da `dateKeys` aufsteigend sortiert ist,
 * genügt der Vergleich des ersten Tages.
 */
export function canNavigateForward(nextBounds: PeriodBounds, maxForward: string): boolean {
  return nextBounds.startKey <= maxForward;
}

/**
 * Periodenlabel (design-conventions.md „Zeitraum-Umschalter"): Woche
 * „15.–21. Sep." (bzw. „29. Sep. – 5. Okt." bei Monatswechsel innerhalb der
 * Woche), Monat „September 2026".
 */
export function formatPeriodLabel(kind: PeriodKind, bounds: PeriodBounds): string {
  if (kind === 'month') {
    const { year, monthIndex0 } = parseDateKey(bounds.startKey);
    return `${MONTH_LABELS_DE_FULL[monthIndex0]} ${year}`;
  }

  const start = parseDateKey(bounds.startKey);
  const end = parseDateKey(bounds.endKey);

  if (start.monthIndex0 === end.monthIndex0 && start.year === end.year) {
    return `${start.day}.–${end.day}. ${MONTH_LABELS_DE_SHORT[start.monthIndex0]}.`;
  }

  return `${start.day}. ${MONTH_LABELS_DE_SHORT[start.monthIndex0]}. – ${end.day}. ${MONTH_LABELS_DE_SHORT[end.monthIndex0]}.`;
}

/**
 * Bildet je Kalendertag der Periode einen Balken-Datensatz. Drei Zustände
 * (design-conventions.md „Balken-Chart"): `'entries'` für jeden Tag mit
 * Einträgen (vergangen/heute UND Zukunft gleichermaßen als normaler
 * Balken), `'gap'` für einen vergangenen/heutigen Tag ohne Einträge,
 * `'future-empty'` für JEDEN zukünftigen Tag ohne Einträge — unabhängig
 * vom Abstand zu heute, keine dritte Variante jenseits heute+7.
 *
 * `countsForAverage` ist ausschließlich bei vergangenen/heutigen Tagen MIT
 * Einträgen wahr (Nutzer-Entscheidung PO-2026-09-20-012): ein zukünftiger
 * Tag mit Einträgen wird als normaler Balken dargestellt, zählt aber NICHT
 * in den Durchschnitt.
 */
export function buildDayBuckets(
  dateKeys: readonly string[],
  entries: readonly StatsEntry[],
  todayKeyValue: string = todayKey(),
): DayBucket[] {
  const totalsByDate = new Map<string, DayTotals>();

  for (const entry of entries) {
    const live = computeLiveNutrition(entry.food, entry.amountG);
    const existing = totalsByDate.get(entry.dateKey) ?? {
      kcal: 0,
      carbsG: 0,
      proteinG: 0,
      fatG: 0,
    };
    totalsByDate.set(entry.dateKey, {
      kcal: existing.kcal + live.kcal,
      carbsG: existing.carbsG + live.carbsG,
      proteinG: existing.proteinG + live.proteinG,
      fatG: existing.fatG + live.fatG,
    });
  }

  return dateKeys.map((dateKey) => {
    const totals = totalsByDate.get(dateKey) ?? { kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 };
    const hasEntries = totalsByDate.has(dateKey);
    const isFuture = diffInDays(todayKeyValue, dateKey) > 0;
    const state: DayBarState = hasEntries ? 'entries' : isFuture ? 'future-empty' : 'gap';
    const countsForAverage = !isFuture && hasEntries;

    return { dateKey, ...totals, hasEntries, isFuture, state, countsForAverage };
  });
}

/**
 * Durchschnitt pro Tag über die zählenden Tage (design-conventions.md
 * „Makro-Zusammenfassung"): Nenner ist ausschließlich `countsForAverage`.
 * Leere Periode (kein zählender Tag) liefert `count: 0` und Nullwerte,
 * statt durch 0 zu teilen.
 */
export function computePeriodAverages(buckets: readonly DayBucket[]): PeriodAverages {
  const counted = buckets.filter((bucket) => bucket.countsForAverage);

  if (counted.length === 0) {
    return { count: 0, kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 };
  }

  const sums = counted.reduce<DayTotals>(
    (acc, bucket) => ({
      kcal: acc.kcal + bucket.kcal,
      carbsG: acc.carbsG + bucket.carbsG,
      proteinG: acc.proteinG + bucket.proteinG,
      fatG: acc.fatG + bucket.fatG,
    }),
    { kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 },
  );

  return {
    count: counted.length,
    kcal: sums.kcal / counted.length,
    carbsG: sums.carbsG / counted.length,
    proteinG: sums.proteinG / counted.length,
    fatG: sums.fatG / counted.length,
  };
}

/** `true`, wenn kein einziger Tag der Periode zählt (design-conventions.md „Leerzustand"). */
export function isPeriodEmpty(buckets: readonly DayBucket[]): boolean {
  return buckets.every((bucket) => !bucket.countsForAverage);
}

/**
 * Skalierung der Balkenhöhe: das Maximum aus dem höchsten Tageswert und
 * 105 % des Ziels (damit die Zielinie stets innerhalb des Charts liegt),
 * mindestens `1`, um eine Division durch 0 auszuschließen.
 */
export function computeChartScale(buckets: readonly DayBucket[], goalKcal: number | null): number {
  const maxKcal = buckets.reduce((max, bucket) => Math.max(max, bucket.kcal), 0);
  const goalReference = goalKcal !== null && goalKcal > 0 ? goalKcal * GOAL_OVERSHOOT_TOLERANCE : 0;
  return Math.max(maxKcal, goalReference, 1);
}

export interface BarFillPercents {
  /** Anteil der Balkenhöhe (0..100) in `--color-accent`. */
  fillPercent: number;
  /** Anteil der Balkenhöhe (0..100) in `--color-warning`, nur jenseits 105 % des Ziels. */
  warningPercent: number;
}

/**
 * Füllsegmente eines normalen Balkens (design-conventions.md „Balken-Chart":
 * gefüllt in `--color-accent` bis einschließlich 105 % des Tagesziels,
 * darüber ein zusätzliches Segment in `--color-warning`). Ohne Ziel wird
 * der volle Ist-Wert in Accent gefüllt — keine Warnfarbe, da kein Ziel zum
 * Vergleich existiert.
 */
export function computeBarFillPercents(
  kcal: number,
  goalKcal: number | null,
  scale: number,
): BarFillPercents {
  if (goalKcal === null || goalKcal <= 0) {
    return { fillPercent: (kcal / scale) * 100, warningPercent: 0 };
  }

  const toleranceKcal = goalKcal * GOAL_OVERSHOOT_TOLERANCE;
  const fillPercent = (Math.min(kcal, toleranceKcal) / scale) * 100;
  const warningPercent = (Math.max(kcal - toleranceKcal, 0) / scale) * 100;
  return { fillPercent, warningPercent };
}
