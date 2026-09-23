import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { MealType } from '../../../core/meal-type.constants';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { MacroBarComponent } from '../../../shared/ui/macro-bar/macro-bar.component';
import { DiaryStore } from '../../diary.store';
import type { CopyContext, DiaryEntry } from '../../models/diary.model';
import { CalorieRingComponent } from '../calorie-ring/calorie-ring.component';
import { CopyFeedbackComponent } from '../copy-feedback/copy-feedback.component';
import { DateNavComponent } from '../date-nav/date-nav.component';
import { MealSectionComponent } from '../meal-section/meal-section.component';

/**
 * Tagebuch-Shell — Tagesansicht (Paket PO-2026-09-20-004, siehe ADR-0006).
 *
 * Orchestriert `DiaryStore` (Signals) und die reinen Anzeige-Komponenten
 * (Datumsnavigation, Kalorienring, Makro-Balken, Mahlzeiten-Sektionen).
 * Die Datumsnavigation bleibt in Lade-/Leer-/Fehlerzustand gleichermaßen
 * bedienbar (außerhalb der zustandsabhängigen Bereiche gerendert).
 *
 * FAB und Sektions-Buttons öffnen seit Paket 006 das Eingabe-Sheet von
 * `food-catalog` über die Auxiliary-Route im Outlet `sheet` (ADR-0008) —
 * `diary` importiert dabei nichts aus `food-search`, nur `Router`. Tag und
 * vorgewählte Mahlzeit werden als Query-Parameter durchgereicht, aber
 * NICHT ausgewertet (das Sheet zeigt bislang nur Suche/Anlegen, Step B mit
 * Mengen-Erfassung folgt in Paket 007). Der Tap auf eine Eintragszeile
 * (design-conventions.md „Mahlzeiten-Sektionen": „Tap öffnet Bearbeitung")
 * bleibt bis zum selben Paket ein Stub — es existiert noch keine
 * Bearbeitungsansicht.
 */
@Component({
  selector: 'app-diary-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DateNavComponent,
    CalorieRingComponent,
    MacroBarComponent,
    MealSectionComponent,
    CopyFeedbackComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './diary-shell.component.html',
  styleUrl: './diary-shell.component.css',
})
export class DiaryShellComponent implements OnInit, OnDestroy {
  protected readonly diaryStore = inject(DiaryStore);
  private readonly router = inject(Router);

  /**
   * Kontext, dessen Rückgängig-Bestätigung gerade offen ist — reiner
   * Interaktionszustand der Ansicht (welcher Dialog ist offen), nicht der
   * Undo-Zustand selbst (der lebt im `DiaryStore`, ADR-0013 Punkt 4). `null`
   * bedeutet: kein Bestätigungsdialog offen.
   */
  protected readonly pendingUndoContext = signal<CopyContext | null>(null);

  private readonly pendingFeedback = computed(() => {
    const context = this.pendingUndoContext();
    return context ? this.diaryStore.feedbackFor(context) : null;
  });

  /** Wortlaut aus den design_notes: „Kopie von {Bezugstag} rückgängig machen?" */
  protected readonly undoDialogTitle = computed(() => {
    const feedback = this.pendingFeedback();
    return feedback ? `Kopie von ${feedback.sourceDateLabel} rückgängig machen?` : '';
  });

  /** Wortlaut aus den design_notes: „Alle {n} daraus übernommenen Einträge werden aus {Tag} entfernt." */
  protected readonly undoDialogDescription = computed(() => {
    const feedback = this.pendingFeedback();
    if (!feedback) return null;
    return `Alle ${feedback.count} daraus übernommenen Einträge werden aus ${this.diaryStore.dateLabel().text} entfernt.`;
  });

  /**
   * Lädt die Zielzeile beim Aktivieren der Tagebuch-Route erneut (ADR-0007
   * Punkt 5): `DiaryStore` ist `providedIn: 'root'` und lädt sonst nur im
   * Konstruktor, ein in der Ziele-Ansicht geändertes Ziel würde ohne diesen
   * gezielten Nachlade-Weg nach der Rückkehr nicht sichtbar.
   */
  ngOnInit(): void {
    void this.diaryStore.reloadGoal();
  }

  /**
   * Undo-Zustand ist an den Seitenaufruf gebunden (ADR-0013 Punkt 4):
   * `DiaryStore` ist `providedIn: 'root'` und überlebt das Verlassen der
   * Route — die Rückmeldungen müssen hier explizit geleert werden.
   */
  ngOnDestroy(): void {
    this.diaryStore.clearAllFeedback();
  }

  protected onCopyDayClick(): void {
    void this.diaryStore.copyDay();
  }

  protected onGlobalUndoRequested(): void {
    this.pendingUndoContext.set('global');
  }

  protected onGlobalFeedbackClosed(): void {
    this.diaryStore.dismissFeedback('global');
  }

  protected onSectionCopyClick(mealType: MealType): void {
    void this.diaryStore.copySection(mealType);
  }

  protected onSectionUndoRequested(mealType: MealType): void {
    this.pendingUndoContext.set(mealType);
  }

  protected onSectionFeedbackClosed(mealType: MealType): void {
    this.diaryStore.dismissFeedback(mealType);
  }

  /** Manueller Einzel-Retry (design-conventions.md „Erneut versuchen", ADR-0016). */
  protected onRetrySync(entryId: string): void {
    void this.diaryStore.retrySync(entryId);
  }

  protected onConfirmUndo(): void {
    const context = this.pendingUndoContext();
    this.pendingUndoContext.set(null);
    if (context) {
      void this.diaryStore.confirmUndo(context);
    }
  }

  protected onCancelUndo(): void {
    this.pendingUndoContext.set(null);
  }

  protected onFabClick(): void {
    this.openEntrySheet(this.diaryStore.suggestedMealType());
  }

  protected onSectionAddClick(mealType: MealType): void {
    this.openEntrySheet(mealType);
  }

  /**
   * Tap auf eine Eintragszeile öffnet dasselbe Eingabe-Sheet zum Bearbeiten
   * (ADR-0009 Punkt 5): einziger zusätzlicher Query-Parameter `entryId`,
   * keine Nährwerte über die URL. Das Sheet lädt den Eintrag selbst über
   * `EntriesService.loadEntry()` und öffnet direkt Step B.
   */
  protected onEntryClick(entry: DiaryEntry): void {
    void this.router.navigate([{ outlets: { sheet: ['eintrag-erfassen'] } }], {
      queryParams: { date: this.diaryStore.currentDate(), entryId: entry.id },
    });
  }

  /**
   * Öffnet das Eingabe-Sheet über das benannte Outlet `sheet`
   * (ADR-0008 Punkt 1) zum Anlegen — `date`/`mealType` als Durchreiche-
   * Parameter, ausgewertet vom Sheet (ADR-0009 Punkt 1).
   */
  private openEntrySheet(mealType: MealType): void {
    void this.router.navigate([{ outlets: { sheet: ['eintrag-erfassen'] } }], {
      queryParams: { date: this.diaryStore.currentDate(), mealType },
    });
  }
}
