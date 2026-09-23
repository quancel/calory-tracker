import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  input,
  output,
} from '@angular/core';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Zustandsloser Bottom-Sheet-Rahmen (ADR-0012 Punkt 5, code-conventions.md
 * „Geteilte UI-Bausteine"): Backdrop, Drag-Handle, Schließen-Button,
 * Escape/Tab-Fokusfalle. Reine Extraktion aus dem bereits abgenommenen
 * Eintrags-Sheet (`food-search/components/food-entry-sheet/`) —
 * verhaltensneutrales Refactoring, die Step-Logik bleibt beim jeweiligen
 * Sheet (design-conventions.md „Bottom-Sheets"). Zweiter Nutzer: das
 * Mahlzeit-Sheet von `meals`.
 *
 * Inhalt per `ng-content`; der Aufrufer bleibt für Titel/`aria-labelledby`
 * zuständig (`ariaLabelledby` verweist auf die ID der eigenen Überschrift
 * im projizierten Inhalt).
 */
@Component({
  selector: 'app-bottom-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bottom-sheet.component.html',
  styleUrl: './bottom-sheet.component.css',
})
export class BottomSheetComponent {
  readonly ariaLabelledby = input.required<string>();
  /** Vollbild statt 85vh-Begrenzung (z. B. Barcode-Scanner-Step, ADR-0010). */
  readonly fullscreen = input(false);
  /** Heller Schließen-Button über dunklem Inhalt (z. B. Kamera-Viewfinder). */
  readonly closeButtonOnDark = input(false);

  readonly close = output<void>();

  @ViewChild('sheetPanel') private readonly sheetPanelRef?: ElementRef<HTMLElement>;

  protected onClose(): void {
    this.close.emit();
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.focusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.sheetPanelRef?.nativeElement.ownerDocument.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    const panel = this.sheetPanelRef?.nativeElement;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }
}
