import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  input,
  output,
} from '@angular/core';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Projektweiter Bestätigungsdialog für destruktive Aktionen
 * (design-conventions.md „Bestätigungsdialog für destruktive Aktionen").
 * Zustandslos: Inputs/Outputs, kein Store-Zugriff — der aufrufende
 * Kontext entscheidet, welche Aktion bei `confirm` tatsächlich ausgeführt
 * wird.
 *
 * Umgezogen nach `shared/ui/confirm-dialog/` mit Paket 010 (ADR-0009
 * Konsequenzen, ADR-0012 Punkt 5) — zweiter Nutzer ist das Mahlzeit-Sheet
 * von `meals` (Löschen einer gespeicherten Mahlzeit).
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
})
export class ConfirmDialogComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly confirmLabel = input<string>('Bestätigen');
  readonly cancelLabel = input<string>('Abbrechen');

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  @ViewChild('dialogPanel') private readonly panelRef?: ElementRef<HTMLElement>;
  @ViewChild('cancelButton') private readonly cancelButtonRef?: ElementRef<HTMLButtonElement>;

  private triggerElement: HTMLElement | null = null;

  ngAfterViewInit(): void {
    // Fokusfalle (design-conventions.md): das auslösende Element wird HIER
    // erfasst — vor dem Fokuswechsel unten liegt der Fokus noch auf dem
    // Button, der den Dialog geöffnet hat.
    const active = this.panelRef?.nativeElement.ownerDocument.activeElement;
    this.triggerElement = active instanceof HTMLElement ? active : null;
    // Initialer Fokus auf „Abbrechen", nicht auf der destruktiven Aktion.
    this.cancelButtonRef?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.triggerElement?.focus();
  }

  protected onBackdropClick(): void {
    this.cancel.emit();
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  protected onConfirm(): void {
    this.confirm.emit();
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    // Verhindert, dass Escape/Tab zusätzlich den darunterliegenden
    // Sheet-Keydown-Handler erreicht, falls dieser Dialog innerhalb des
    // Sheet-DOM gerendert wird (Fokusfalle bleibt auf den Dialog begrenzt).
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.focusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.panelRef?.nativeElement.ownerDocument.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    const panel = this.panelRef?.nativeElement;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }
}
