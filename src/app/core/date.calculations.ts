/**
 * Kalendertag-Arithmetik und -Beschriftung — genau eine Quelle im Projekt
 * (siehe code-conventions.md „Wo was hingehört", ADR-0014 Punkt 7). Reine
 * Funktionen ohne DI, ohne Angular-Import, ohne UI-Wissen.
 *
 * Umzug aus `diary/diary.calculations.ts` mit Paket PO-2026-09-20-012:
 * zweiter Nutzer `stats` (Zwei-Nutzer-Regel, ADR-0005). Verhaltensneutraler
 * Umzug — keine Änderung an Logik oder Ergebnissen, nur der Ort.
 *
 * Kalendertage sind lokale `YYYY-MM-DD`-Strings, nie `Date`-Objekte im
 * Zustand. Tagesarithmetik läuft hier ausschließlich über lokale
 * Jahres-/Monats-/Tageszahlen, nie über `toISOString()` (UTC-Verschiebung,
 * ADR-0006 Punkt 2). Keine Datums-Bibliothek.
 */

const WEEKDAY_LABELS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_LABELS_DE = [
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

/** Erlaubtes Vorwärtsfenster der Datumsnavigation: heute + 7 Tage. */
export const MAX_FORWARD_DAYS = 7;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function toDateKey(year: number, monthIndex0: number, day: number): string {
  const date = new Date(year, monthIndex0, day);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey: string): { year: number; monthIndex0: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, monthIndex0: month - 1, day };
}

/** Heutiges lokales Datum als `YYYY-MM-DD`. */
export function todayKey(reference: Date = new Date()): string {
  return toDateKey(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

/** Verschiebt einen Datumsschlüssel um `deltaDays` (positiv oder negativ), rein lokal. */
export function addDaysToKey(dateKey: string, deltaDays: number): string {
  const { year, monthIndex0, day } = parseDateKey(dateKey);
  return toDateKey(year, monthIndex0, day + deltaDays);
}

/** Maximal erlaubtes Vorwärtsdatum der Navigation: heute + 7 Tage. */
export function maxForwardKey(reference: Date = new Date()): string {
  return addDaysToKey(todayKey(reference), MAX_FORWARD_DAYS);
}

/** Differenz in Tagen (`bKey - aKey`), lokal berechnet. */
export function diffInDays(aKey: string, bKey: string): number {
  const a = parseDateKey(aKey);
  const b = parseDateKey(bKey);
  const aDate = new Date(a.year, a.monthIndex0, a.day);
  const bDate = new Date(b.year, b.monthIndex0, b.day);
  return Math.round((bDate.getTime() - aDate.getTime()) / 86_400_000);
}

export type DateLabelKind = 'today' | 'tomorrow' | 'yesterday' | 'future-relative' | 'past-weekday';

export interface DateLabel {
  text: string;
  kind: DateLabelKind;
}

/**
 * Beschriftung der Datumsnavigation (design-conventions.md
 * „Datumsnavigation"): „Heute"/„Morgen"/„in {n} Tagen" innerhalb des
 * erlaubten Vorwärtsfensters, „Gestern" für den Vortag, alle übrigen
 * Vergangenheitstage als Wochentag + Datum ohne Relativangabe.
 */
export function formatDateLabel(dateKey: string, reference: Date = new Date()): DateLabel {
  const diff = diffInDays(todayKey(reference), dateKey);

  if (diff === 0) {
    return { text: 'Heute', kind: 'today' };
  }
  if (diff === 1) {
    return { text: 'Morgen', kind: 'tomorrow' };
  }
  if (diff > 1 && diff <= MAX_FORWARD_DAYS) {
    return { text: `in ${diff} Tagen`, kind: 'future-relative' };
  }
  if (diff === -1) {
    return { text: 'Gestern', kind: 'yesterday' };
  }

  const { year, monthIndex0, day } = parseDateKey(dateKey);
  const weekday = new Date(year, monthIndex0, day).getDay();
  return {
    text: `${WEEKDAY_LABELS_DE[weekday]}, ${day}. ${MONTH_LABELS_DE[monthIndex0]}.`,
    kind: 'past-weekday',
  };
}
