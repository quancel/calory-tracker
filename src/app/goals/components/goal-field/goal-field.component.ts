import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { GoalFieldSaveState } from '../../models/goal.model';

let nextInstanceId = 0;

/**
 * Feldblock mit unabhängigem Speichern (design-conventions.md, Abschnitt
 * „Feldblock mit unabhängigem Speichern") — Label + Input + eigener
 * „Speichern"-Button in einer Zeile, darunter wechselseitig Fehlermeldung
 * oder Erfolgsrückmeldung. Rein präsentational: Gültigkeit, Speicherzustand
 * und Werte kommen als `input()` von `GoalsStore` über `GoalsPageComponent`,
 * kein eigener Zugriff auf Store/Service (code-conventions.md).
 *
 * Die Anzeige der Client-Validierungsmeldung folgt der projektweiten
 * Formularregel (design-conventions.md „Formulare"): erst nach dem ersten
 * Blur, danach live bei jeder Änderung — daher der lokale `touched`-Zustand,
 * eine reine Anzeige-Timing-Frage ohne Bezug zum Speicher-Workflow im Store.
 */
@Component({
  selector: 'app-goal-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-field.component.html',
  styleUrl: './goal-field.component.css',
})
export class GoalFieldComponent {
  private readonly instanceId = nextInstanceId++;
  protected readonly inputId = `goal-field-input-${this.instanceId}`;
  protected readonly feedbackId = `goal-field-feedback-${this.instanceId}`;

  readonly label = input.required<string>();
  readonly unit = input.required<string>();
  readonly value = input.required<string>();
  readonly validationError = input.required<string | null>();
  readonly canSave = input.required<boolean>();
  readonly saveState = input.required<GoalFieldSaveState>();
  readonly saveErrorMessage = input.required<string | null>();

  readonly valueChange = output<string>();
  readonly save = output<void>();

  private readonly touched = signal(false);

  protected readonly displayedError = computed(() => {
    if (this.saveState() === 'error') {
      return this.saveErrorMessage();
    }
    if (this.touched()) {
      return this.validationError();
    }
    return null;
  });

  protected readonly showSuccess = computed(
    () => this.saveState() === 'saved' && this.displayedError() === null,
  );

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.valueChange.emit(target.value);
  }

  protected onBlur(): void {
    this.touched.set(true);
  }

  protected onSave(): void {
    if (!this.canSave()) return;
    this.save.emit();
  }
}
