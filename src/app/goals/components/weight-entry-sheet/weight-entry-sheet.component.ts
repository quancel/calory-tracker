import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { WeightStore } from '../../weight.store';

/**
 * Erfassen-Sheet (design-conventions.md „Erfassen-Sheet", ADR-0017
 * Punkt 8): In-Feature-Sheet **ohne** Auxiliary-Route (wird aus der
 * Ziele-Ansicht selbst geöffnet), Rahmen über `shared/ui/bottom-sheet/`.
 * Ein Feld — Gewicht in kg, Datum ist immer der aktuelle Tag. Existiert für
 * heute bereits ein Wert, öffnet sich vor dem Ersetzen der projektweite
 * Bestätigungsdialog (`shared/ui/confirm-dialog/`,
 * design-conventions.md „Ein Gewichtswert pro Kalendertag").
 */
@Component({
  selector: 'app-weight-entry-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheetComponent, ConfirmDialogComponent],
  templateUrl: './weight-entry-sheet.component.html',
  styleUrl: './weight-entry-sheet.component.css',
})
export class WeightEntrySheetComponent implements AfterViewInit {
  protected readonly store = inject(WeightStore);

  @ViewChild('weightInputRef') private readonly weightInputRef?: ElementRef<HTMLInputElement>;

  private readonly touched = signal(false);

  /** Client-Validierungsmeldung erst nach dem ersten Blur, danach live (design-conventions.md „Formulare", gleiches Pattern wie `GoalFieldComponent`). */
  protected readonly displayedError = computed(() => {
    const submitError = this.store.submitError();
    if (submitError) return submitError;
    if (!this.touched()) return null;
    const validation = this.store.weightValidation();
    return validation.valid ? null : validation.error;
  });

  ngAfterViewInit(): void {
    this.weightInputRef?.nativeElement.focus();
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setWeightInput(target.value);
  }

  protected onBlur(): void {
    this.touched.set(true);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.touched.set(true);
    void this.store.submit();
  }

  protected onClose(): void {
    this.store.closeSheet();
  }

  protected replaceDescription(): string {
    const pending = this.store.pendingReplace();
    if (!pending) return '';
    // Deutsche Dezimalschreibweise (design-conventions.md: „72,4 kg wird
    // durch 72,1 kg ersetzt.") — Gewichte sind auf 1 Nachkommastelle
    // validiert (weight.calculations.ts).
    return `${this.formatWeight(pending.existingWeightKg)} kg wird durch ${this.formatWeight(pending.newWeightKg)} kg ersetzt.`;
  }

  private formatWeight(weightKg: number): string {
    return weightKg.toFixed(1).replace('.', ',');
  }

  protected onConfirmReplace(): void {
    void this.store.confirmReplace();
  }

  protected onCancelReplace(): void {
    this.store.cancelReplace();
  }
}
