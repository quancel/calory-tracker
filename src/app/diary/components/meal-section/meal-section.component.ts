import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CopyFeedbackView, DiaryEntry, MealSection } from '../../models/diary.model';
import { CopyFeedbackComponent } from '../copy-feedback/copy-feedback.component';
import { SyncStatusMarkerComponent } from '../sync-status-marker/sync-status-marker.component';

/**
 * Mahlzeiten-Sektion (design-conventions.md „Mahlzeiten-Sektionen" und
 * „Eingabe-Einstieg: FAB + Sektions-Buttons"): Sektionskopf mit Name +
 * kcal-Zwischensumme, Eintragszeilen (Food-Name links, Menge + kcal
 * rechts), ein eigener neutraler „+"-Button (48×48, kein Akzent) sowie ein
 * Sektions-Auslöser für „gestern kopieren" mit Zahlen-Badge (ADR-0013,
 * design_notes Paket 011) — sichtbar, aber deaktiviert bei leerem Vortag.
 * Die Inline-Rückmeldung sitzt direkt unterhalb des Sektionskopfs,
 * oberhalb des Sektionsinhalts.
 *
 * Ab Paket PO-2026-09-20-014 (ADR-0016, design-conventions.md
 * „Sync-Status-Marker"): eine Eintragszeile mit `syncState !== 'synced'`
 * trägt zusätzlich den Sync-Status-Marker vor dem Food-Namen. Der Marker
 * selbst liegt NICHT im `entry-row`-Button (kein Button-in-Button), sondern
 * als eigenständiges Element davor; Tap öffnet eine Inline-Erläuterung
 * unterhalb der Zeile — der geöffnete Zustand ist bewusst lokal je Sektion
 * (Vereinfachung gegenüber der seitenweiten Exklusivität aus den
 * design_notes, siehe Handoff-Bericht).
 */
@Component({
  selector: 'app-meal-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CopyFeedbackComponent, SyncStatusMarkerComponent],
  templateUrl: './meal-section.component.html',
  styleUrl: './meal-section.component.css',
})
export class MealSectionComponent {
  readonly section = input.required<MealSection>();
  readonly copyCount = input.required<number>();
  readonly copyFeedback = input.required<CopyFeedbackView | null>();

  readonly addEntry = output<void>();
  readonly openEntry = output<DiaryEntry>();
  readonly copySection = output<void>();
  readonly undoRequested = output<void>();
  readonly feedbackClosed = output<void>();
  /** Manueller Einzel-Retry (design-conventions.md „Erneut versuchen", nur im Zustand „dauerhaft gescheitert"). */
  readonly retrySync = output<string>();

  protected readonly kcalRounded = computed(() => Math.round(this.section().kcal));
  protected readonly canCopySection = computed(() => this.copyCount() > 0);

  /** ID der Zeile mit offener Sync-Inline-Erläuterung, `null` = keine offen. */
  protected readonly openMarkerEntryId = signal<string | null>(null);

  protected entryKcalRounded(entry: DiaryEntry): number {
    return Math.round((entry.amountG / 100) * entry.food.kcal100g);
  }

  protected onAddEntry(): void {
    this.addEntry.emit();
  }

  protected onOpenEntry(entry: DiaryEntry): void {
    this.openEntry.emit(entry);
  }

  protected onCopySection(): void {
    if (!this.canCopySection()) return;
    this.copySection.emit();
  }

  protected onUndoRequested(): void {
    this.undoRequested.emit();
  }

  protected onFeedbackClosed(): void {
    this.feedbackClosed.emit();
  }

  protected onToggleMarker(entryId: string): void {
    this.openMarkerEntryId.update((current) => (current === entryId ? null : entryId));
  }

  protected onRetrySync(entryId: string): void {
    this.retrySync.emit(entryId);
  }
}
