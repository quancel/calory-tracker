import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  type MealType,
} from '../../../core/meal-type.constants';
import {
  type NutritionMaybeNull,
  type PlausibilityMarker,
  plausibilityMarkerStatusText,
  resolvePlausibilityMarker,
} from '../../../core/foods.calculations';
import { type CreateFoodFormValues, normalizeMealType } from '../../food-search.calculations';
import { FoodSearchStore, type StepATab } from '../../food-search.store';
import type { Meal } from '../../../core/meals.service';
import type { Food } from '../../../core/foods.service';
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { PlausibilityMarkerComponent } from '../../../shared/ui/plausibility-marker/plausibility-marker.component';
import { BarcodeScannerComponent } from '../barcode-scanner/barcode-scanner.component';

type SheetStep = 'search' | 'create' | 'amount' | 'scan' | 'scan-success' | 'correct';

/** Validierte Step-A2-Felder — `barcode` ist reine Anzeige (Scan-Vorbelegung, ADR-0010 Punkt 5), nicht Teil der Formularvalidierung. */
type ValidatableCreateFoodField = Exclude<keyof CreateFoodFormValues, 'barcode'>;

/**
 * Eingabe-Sheet Step A (Suche), Step A2 (Neu anlegen) und Step B (Menge
 * erfassen/Eintrag speichern) — Auxiliary-Route im benannten Outlet `sheet`
 * (ADR-0008 Punkt 1, ADR-0009 Punkt 1). Der Sheet-Rahmen (Backdrop,
 * Drag-Handle, Schließen-Button, Fokusfalle) liegt seit Paket 010 in
 * `shared/ui/bottom-sheet/` (zweiter Nutzer: das Mahlzeit-Sheet von
 * `meals`, ADR-0012 Punkt 5) — diese Komponente bleibt nur noch für die
 * Step-Logik (Suche/Anlegen/Menge/Scan/Korrektur) zuständig.
 *
 * `date`/`mealType` kommen als Query-Parameter der Route (gesetzt von
 * `diary-shell.component.ts`) für den Anlegen-Flow; ein zusätzlicher
 * `entryId`-Parameter (gesetzt beim Tap auf eine bestehende Eintragszeile)
 * schaltet direkt in den Bearbeiten-Flow: das Sheet lädt den Eintrag über
 * `FoodSearchStore.loadEntryForEdit()` und öffnet direkt Step B (ADR-0009
 * Punkt 5) — genau eine Step-B-Implementierung für Anlegen und Bearbeiten.
 *
 * Schließen (Backdrop-Tap, Drag-Handle-Bereich, „X", Escape) verwirft eine
 * unvollständige Eingabe ohne Bestätigungsdialog (design-conventions.md
 * „Abgrenzung: ungespeicherte Sheet-Eingabe bleibt ohne Bestätigung") —
 * bewusste projektweite Ausnahme vom Bestätigungsdialog-Pattern. Löschen
 * eines bereits gespeicherten Eintrags läuft dagegen über den
 * Bestätigungsdialog (design-conventions.md „Bestätigungsdialog für
 * destruktive Aktionen").
 */
@Component({
  selector: 'app-food-entry-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    BottomSheetComponent,
    ConfirmDialogComponent,
    PlausibilityMarkerComponent,
    BarcodeScannerComponent,
  ],
  templateUrl: './food-entry-sheet.component.html',
  styleUrl: './food-entry-sheet.component.css',
})
export class FoodEntrySheetComponent implements OnInit, AfterViewInit {
  protected readonly store = inject(FoodSearchStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly mealTypeOptions = MEAL_TYPE_ORDER;
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;

  private readonly date = this.route.snapshot.queryParamMap.get('date') ?? '';
  private readonly entryId = this.route.snapshot.queryParamMap.get('entryId');

  protected readonly step = signal<SheetStep>('search');
  protected readonly confirmDeleteOpen = signal(false);

  /** Step, zu dem Step C (Korrektur) nach „Speichern"/Zurück zurückkehrt — der Aufrufkontext (Step A/Step B), rein UI-lokal, kein Store-State (ADR-0011 betrifft nur `food-catalog`-Daten). */
  private correctReturnStep: SheetStep = 'search';

  private readonly touchedFields = signal<Record<ValidatableCreateFoodField, boolean>>({
    name: false,
    kcal100g: false,
    proteinG100g: false,
    carbsG100g: false,
    fatG100g: false,
    defaultPortionG: false,
  });

  private readonly correctTouchedFields = signal<Record<ValidatableCreateFoodField, boolean>>({
    name: false,
    kcal100g: false,
    proteinG100g: false,
    carbsG100g: false,
    fatG100g: false,
    defaultPortionG: false,
  });

  @ViewChild('searchInput') private readonly searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('nameInput') private readonly nameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('amountInput') private readonly amountInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('correctNameInput') private readonly correctNameInputRef?: ElementRef<HTMLInputElement>;

  constructor() {
    // Reagiert auf Scan-Ergebnisse unabhängig davon, wo sie ausgelöst wurden
    // (BarcodeScannerComponent ruft store.handleScanDetected() selbst auf).
    // Der `step()`-Guard verhindert, dass ein noch nicht zurückgesetztes
    // `scanPhase` nach dem Verlassen des Scan-Steps erneut einen
    // Step-Wechsel auslöst.
    effect(() => {
      const phase = this.store.scanPhase();
      if (this.step() !== 'scan') return;

      if (phase === 'resolved') {
        this.step.set('amount');
        this.focusAfterRender(() => this.focusAmountInput());
      } else if (phase === 'prefill-create') {
        this.step.set('create');
        this.focusAfterRender(() => this.nameInputRef?.nativeElement.focus());
      }
    });
  }

  ngOnInit(): void {
    void this.store.ensureLoaded();

    const mealType = normalizeMealType(this.route.snapshot.queryParamMap.get('mealType'));
    this.store.beginEntrySession(this.date, mealType);

    if (this.entryId) {
      this.step.set('amount');
      void this.store.loadEntryForEdit(this.entryId);
    }
  }

  ngAfterViewInit(): void {
    if (this.step() === 'amount') {
      this.focusAmountInput();
    } else {
      this.searchInputRef?.nativeElement.focus();
    }
  }

  protected close(): void {
    void this.router.navigate([{ outlets: { sheet: null } }]);
  }

  protected onSelectTab(tab: StepATab): void {
    this.store.setActiveTab(tab);
  }

  protected async onLogMeal(meal: Meal): Promise<void> {
    await this.store.logMeal(meal);
  }

  protected onLogMealNext(): void {
    this.store.resetForNextMealLog();
  }

  protected onQueryInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setQuery(target.value);
  }

  protected onSelectFood(food: Food): void {
    this.store.selectFood(food);
    this.step.set('amount');
    this.focusAfterRender(() => this.focusAmountInput());
  }

  protected onMealTypeSelect(mealType: MealType): void {
    this.store.setMealType(mealType);
  }

  protected goToCreate(): void {
    this.store.beginCreate();
    this.step.set('create');
    this.focusAfterRender(() => this.nameInputRef?.nativeElement.focus());
  }

  protected backToSearch(): void {
    this.step.set('search');
    this.focusAfterRender(() => this.searchInputRef?.nativeElement.focus());
  }

  protected onCreateFieldInput(key: ValidatableCreateFoodField, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setCreateField(key, target.value);
  }

  protected onCreateFieldBlur(key: ValidatableCreateFoodField): void {
    this.touchedFields.update((current) => ({ ...current, [key]: true }));
  }

  protected createFieldError(key: ValidatableCreateFoodField): string | null {
    if (!this.touchedFields()[key]) return null;
    const result = this.store.createValidation()[key];
    return result.valid ? null : result.error;
  }

  protected async onSubmitCreate(event: Event): Promise<void> {
    event.preventDefault();
    this.touchedFields.set({
      name: true,
      kcal100g: true,
      proteinG100g: true,
      carbsG100g: true,
      fatG100g: true,
      defaultPortionG: true,
    });

    const created = await this.store.createFood();
    if (created) {
      this.step.set('search');
      this.focusAfterRender(() => this.searchInputRef?.nativeElement.focus());
    }
  }

  /** Marker für Suchtrefferliste/Step B (design-conventions.md „Plausibilitäts-/Vollständigkeits-Marker") — reine Ableitung, kein Store-Aufruf nötig. */
  protected marker(nutrition: NutritionMaybeNull): PlausibilityMarker {
    return resolvePlausibilityMarker(nutrition);
  }

  protected markerStatusText(marker: NonNullable<PlausibilityMarker>): string {
    return plausibilityMarkerStatusText(marker);
  }

  /** Marker-Slot in der Suchtrefferliste wird bei markiertem Food selbst zum Tap-Ziel und öffnet Step C für GENAU dieses Food (nicht das gerade in Step B aktive). */
  protected openCorrectFromList(food: Food): void {
    this.correctReturnStep = this.step();
    if (!this.store.beginCorrect(food.id)) return;
    this.step.set('correct');
    this.correctTouchedFields.set({
      name: false,
      kcal100g: false,
      proteinG100g: false,
      carbsG100g: false,
      fatG100g: false,
      defaultPortionG: false,
    });
    this.focusAfterRender(() => this.correctNameInputRef?.nativeElement.focus());
  }

  /** Bleistift-Icon in Step B: korrigiert das aktuell aktive Step-B-Food. */
  protected openCorrectFromStepB(): void {
    const food = this.store.stepBFood();
    if (!food) return;
    this.openCorrectFromList({ ...food, defaultPortionG: null, barcode: null, isCorrected: false });
  }

  protected backFromCorrect(): void {
    this.step.set(this.correctReturnStep);
  }

  protected onCorrectFieldInput(key: ValidatableCreateFoodField, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setCorrectField(key, target.value);
  }

  protected onCorrectFieldBlur(key: ValidatableCreateFoodField): void {
    this.correctTouchedFields.update((current) => ({ ...current, [key]: true }));
  }

  protected correctFieldError(key: ValidatableCreateFoodField): string | null {
    if (!this.correctTouchedFields()[key]) return null;
    const result = this.store.correctValidation()[key];
    return result.valid ? null : result.error;
  }

  protected async onSubmitCorrect(event: Event): Promise<void> {
    event.preventDefault();
    this.correctTouchedFields.set({
      name: true,
      kcal100g: true,
      proteinG100g: true,
      carbsG100g: true,
      fatG100g: true,
      defaultPortionG: true,
    });

    const updated = await this.store.submitCorrect();
    if (updated) {
      this.step.set(this.correctReturnStep);
    }
  }

  protected amountFieldError(): string | null {
    const validation = this.store.amountValidation();
    return validation.valid ? null : validation.error;
  }

  protected onAmountInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setAmountInput(target.value);
  }

  protected async onSubmitAmount(event: Event): Promise<void> {
    event.preventDefault();
    const saved = await this.store.saveEntry();
    if (!saved) return;

    if (this.store.entryOrigin() === 'scan') {
      // Serien-Erfassung (design-conventions.md „Erfolgsrückmeldung mit
      // primärer + sekundärer Folgeaktion"): bleibt im Sheet, statt zu
      // schließen — der Nutzer entscheidet über die Folgeaktion.
      this.step.set('scan-success');
    } else {
      this.close();
    }
  }

  protected goToScan(): void {
    this.store.beginScanSession();
    this.step.set('scan');
  }

  protected onScanManualCreate(): void {
    this.step.set('create');
    this.focusAfterRender(() => this.nameInputRef?.nativeElement.focus());
  }

  /** Primäraktion der Erfolgsansicht: Mahlzeit bleibt erhalten (ADR-0010, Serien-Erfassung). */
  protected onScanNext(): void {
    this.store.resetForNextScan();
    this.step.set('scan');
  }

  protected async retryLoadEntry(): Promise<void> {
    if (!this.entryId) return;
    await this.store.loadEntryForEdit(this.entryId);
  }

  protected onRequestDelete(): void {
    this.confirmDeleteOpen.set(true);
  }

  protected onCancelDelete(): void {
    this.confirmDeleteOpen.set(false);
  }

  protected async onConfirmDelete(): Promise<void> {
    const deleted = await this.store.deleteEntry();
    this.confirmDeleteOpen.set(false);
    if (deleted) {
      this.close();
    }
  }

  private focusAmountInput(): void {
    const input = this.amountInputRef?.nativeElement;
    if (!input) return;
    input.focus();
    input.select();
  }

  /** Fokus nach dem nächsten Render-Zyklus setzen (Step-Wechsel ändert die gerenderten Felder). */
  private focusAfterRender(focus: () => void): void {
    setTimeout(focus);
  }
}
