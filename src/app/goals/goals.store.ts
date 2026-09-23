import { Injectable, type Signal, type WritableSignal, computed, inject, signal } from '@angular/core';
import { ALL_GOAL_FIELD_KEYS, type GoalFieldKey, type GoalFieldSaveState } from './models/goal.model';
import { GoalsService } from './goals.service';
import { type GoalFieldValidation, validateGoalField } from './goals.calculations';

const SUCCESS_FADE_MS = 2400;

interface GoalFieldEntry {
  readonly input: WritableSignal<string>;
  /**
   * Letzter erfolgreich geladene/gespeicherte Wert dieses Felds.
   * `undefined` = **noch nicht geladen** (vor dem ersten erfolgreichen
   * `load()`); `null` = geladen, aber kein Wert vorhanden — bei den vier
   * kcal-/Makro-Feldern heißt das „keine `goals`-Zeile", beim optionalen
   * Zielgewicht zusätzlich „bewusst geleert/nie gesetzt" (ADR-0018 Punkt 2).
   * Beide Zustände waren vor diesem Paket nicht unterscheidbar (`null` für
   * beides) — die Trennung ist nötig, weil ein leeres Zielgewicht-Feld ein
   * gültiger, gespeicherter Zustand ist, kein Ladezustand.
   */
  readonly savedValue: WritableSignal<number | null | undefined>;
  readonly state: WritableSignal<GoalFieldSaveState>;
  /** Nur die Fehlermeldung eines gescheiterten Speichervorgangs (Server), nicht die Client-Validierung. */
  readonly saveErrorMessage: WritableSignal<string | null>;
  readonly validation: Signal<GoalFieldValidation>;
  readonly canSave: Signal<boolean>;
  successFadeTimer: ReturnType<typeof setTimeout> | null;
}

function createFieldEntry(key: GoalFieldKey): GoalFieldEntry {
  const input = signal('');
  const savedValue = signal<number | null | undefined>(undefined);
  const state = signal<GoalFieldSaveState>('idle');
  const saveErrorMessage = signal<string | null>(null);

  const validation = computed(() => validateGoalField(key, input()));
  const canSave = computed(() => {
    const result = validation();
    if (!result.valid) return false;
    const saved = savedValue();
    // Noch nicht geladen: kein Speichern anbieten, auch wenn die aktuell
    // leere Eingabe beim optionalen Zielgewicht als „gültig" durchginge.
    if (saved === undefined) return false;
    return result.value !== saved;
  });

  return {
    input,
    savedValue,
    state,
    saveErrorMessage,
    validation,
    canSave,
    successFadeTimer: null,
  };
}

function formatValue(value: number | null): string {
  return value === null ? '' : `${value}`;
}

/**
 * Einzige Zustandsquelle der Ziele-Ansicht (siehe ADR-0007 Punkt 4,
 * ADR-0018 Punkt 6). Fünf unabhängige Feld-Zustände (vier kcal-/Makro-Felder
 * plus Zielgewicht) — **kein** formularweiter `dirty`/`saving`/`error`-
 * Zustand. Validierung/Grenzwerte laufen ausschließlich über
 * `goals.calculations.ts`.
 */
@Injectable({ providedIn: 'root' })
export class GoalsStore {
  private readonly goalsService = inject(GoalsService);

  private readonly fields: Readonly<Record<GoalFieldKey, GoalFieldEntry>> = ALL_GOAL_FIELD_KEYS.reduce(
    (acc, key) => {
      acc[key] = createFieldEntry(key);
      return acc;
    },
    {} as Record<GoalFieldKey, GoalFieldEntry>,
  );

  private readonly loadingState = signal(true);
  private readonly loadErrorState = signal<string | null>(null);

  readonly loading = this.loadingState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();

  inputValue(key: GoalFieldKey): Signal<string> {
    return this.fields[key].input;
  }

  validationError(key: GoalFieldKey): Signal<string | null> {
    return computed(() => {
      const result = this.fields[key].validation();
      return result.valid ? null : result.error;
    });
  }

  canSave(key: GoalFieldKey): Signal<boolean> {
    return this.fields[key].canSave;
  }

  saveState(key: GoalFieldKey): Signal<GoalFieldSaveState> {
    return this.fields[key].state;
  }

  saveErrorMessage(key: GoalFieldKey): Signal<string | null> {
    return this.fields[key].saveErrorMessage;
  }

  /**
   * Letzter geladene/gespeicherte Wert eines Felds — `WeightStore` liest
   * darüber das aktuelle Zielgewicht für den Kalorienziel-Vorschlag
   * (ADR-0018 Punkt 6), ohne selbst zu schreiben. `undefined` (noch nicht
   * geladen) wird nach außen als `null` behandelt (kein Zielgewicht
   * anzeigen, bis der Ladevorgang abgeschlossen ist).
   */
  savedValue(key: GoalFieldKey): Signal<number | null> {
    return computed(() => {
      const value = this.fields[key].savedValue();
      return value === undefined ? null : value;
    });
  }

  setInput(key: GoalFieldKey, value: string): void {
    this.fields[key].input.set(value);
  }

  /**
   * (Neu-)Lädt die aktuelle Zielzeile und setzt alle fünf Feld-Zustände auf
   * ihren Ausgangspunkt zurück — aufgerufen beim Aktivieren der Ziele-Route,
   * damit ein erneuter Besuch keine veralteten „Gespeichert"/Fehler-Reste
   * aus einer vorherigen Sitzung zeigt.
   */
  async load(): Promise<void> {
    this.loadingState.set(true);
    this.loadErrorState.set(null);

    for (const key of ALL_GOAL_FIELD_KEYS) {
      const entry = this.fields[key];
      this.clearSuccessFadeTimer(entry);
      entry.state.set('idle');
      entry.saveErrorMessage.set(null);
    }

    const result = await this.goalsService.loadGoal();

    this.loadingState.set(false);

    if (!result.success) {
      this.loadErrorState.set(result.message);
      return;
    }

    for (const key of ALL_GOAL_FIELD_KEYS) {
      const value = result.goal ? result.goal[key] : null;
      const entry = this.fields[key];
      entry.savedValue.set(value);
      entry.input.set(formatValue(value));
    }
  }

  async retry(): Promise<void> {
    await this.load();
  }

  /** Speichert genau dieses eine Feld — unabhängig von den anderen vier (ADR-0007 Punkt 3, ADR-0018 Punkt 6). */
  async save(key: GoalFieldKey): Promise<void> {
    const entry = this.fields[key];
    const validation = entry.validation();
    if (!validation.valid) return;

    this.clearSuccessFadeTimer(entry);
    entry.state.set('saving');
    entry.saveErrorMessage.set(null);

    const result = await this.goalsService.saveField(key, validation.value);

    if (!result.success) {
      entry.state.set('error');
      entry.saveErrorMessage.set(result.message);
      // Fehlerfall: letzter gespeicherter Wert bleibt sichtbar, der
      // gescheiterte Eingabeversuch wird verworfen.
      const saved = entry.savedValue();
      entry.input.set(formatValue(saved === undefined ? null : saved));
      return;
    }

    entry.savedValue.set(validation.value);
    entry.input.set(formatValue(validation.value));
    entry.state.set('saved');
    entry.successFadeTimer = setTimeout(() => {
      if (entry.state() === 'saved') {
        entry.state.set('idle');
      }
      entry.successFadeTimer = null;
    }, SUCCESS_FADE_MS);
  }

  private clearSuccessFadeTimer(entry: GoalFieldEntry): void {
    if (entry.successFadeTimer !== null) {
      clearTimeout(entry.successFadeTimer);
      entry.successFadeTimer = null;
    }
  }
}
