import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CopyFeedbackView } from '../../models/diary.model';

/**
 * Inline-Rückmeldung nach „gestern kopieren" (design-conventions.md
 * „Inline-Rückmeldung mit Rückgängig-Bestätigung statt Undo-Snackbar",
 * ADR-0013 Punkt 8): kein Toast/Snackbar/Overlay, sondern Teil des
 * normalen Seitenflusses — schiebt nachfolgenden Content, statt ihn zu
 * verdecken. Kein Timer-Autodismiss.
 *
 * Bewusst lokal in `diary/`, nicht in `shared/ui/`: genau zwei
 * Verwendungsstellen innerhalb desselben Features (global, je Sektion) —
 * die Zwei-Nutzer-Regel meint zwei **Features**, nicht zwei Stellen
 * innerhalb eines Features (ADR-0013 Punkt 8).
 *
 * Zustandslos: „Rückgängig machen" öffnet **nicht** selbst den
 * Bestätigungsdialog, sondern meldet nur die Absicht nach oben — der
 * aufrufende Kontext (`DiaryShellComponent`) entscheidet, welcher
 * `CopyContext` gerade angefragt wird und öffnet den projektweiten
 * `app-confirm-dialog`.
 */
@Component({
  selector: 'app-copy-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './copy-feedback.component.html',
  styleUrl: './copy-feedback.component.css',
})
export class CopyFeedbackComponent {
  readonly view = input.required<CopyFeedbackView>();

  readonly undoRequested = output<void>();
  readonly closed = output<void>();

  protected onUndoRequested(): void {
    this.undoRequested.emit();
  }

  protected onClosed(): void {
    this.closed.emit();
  }
}
