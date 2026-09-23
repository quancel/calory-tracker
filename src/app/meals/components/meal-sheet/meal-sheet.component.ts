import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { computeLiveNutrition, resolvePlausibilityMarker } from '../../../core/foods.calculations';
import type { Food } from '../../../core/foods.service';
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { PlausibilityMarkerComponent } from '../../../shared/ui/plausibility-marker/plausibility-marker.component';
import { MealsStore } from '../../meals.store';

type MealSheetStep = 'm1' | 'm2' | 'm3';

/**
 * Mahlzeit-Sheet — Anlegen & Bearbeiten, M1 (Mahlzeit)/M2 (Food-Suche)/M3
 * (Menge), Auxiliary-Route `mahlzeit-bearbeiten` im Outlet `sheet`
 * (ADR-0012 Punkt 9, design-conventions.md „Mahlzeit-Sheet"). Sheet-Rahmen
 * aus `shared/ui/bottom-sheet/`.
 *
 * `mealId`-Query-Parameter (gesetzt von der Verwaltungsansicht) schaltet in
 * den Bearbeiten-Flow; ohne Parameter startet ein leerer Entwurf.
 *
 * **M3 im Ändern-Modus** (Tap auf eine bestehende Positionszeile in M1,
 * Nutzerentscheidung 2026-09-21, ABWEICHEND von der ursprünglichen Annahme
 * „nur entfernen"): überspringt M2, das Food ist nicht wechselbar, nur die
 * Menge. „Zurück" aus M3 führt im Ändern-Modus daher direkt zu M1, im
 * Hinzufügen-Modus zu M2.
 */
@Component({
  selector: 'app-meal-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, BottomSheetComponent, ConfirmDialogComponent, PlausibilityMarkerComponent],
  templateUrl: './meal-sheet.component.html',
  styleUrl: './meal-sheet.component.css',
})
export class MealSheetComponent implements OnInit, AfterViewInit {
  protected readonly store = inject(MealsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly mealId = this.route.snapshot.queryParamMap.get('mealId');

  protected readonly step = signal<MealSheetStep>('m1');
  protected readonly confirmDeleteOpen = signal(false);
  protected readonly nameTouched = signal(false);

  @ViewChild('nameInput') private readonly nameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('m2SearchInput') private readonly m2SearchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('m3AmountInput') private readonly m3AmountInputRef?: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    void this.store.ensureFoodsLoaded();

    if (this.mealId) {
      void this.initEdit(this.mealId);
    } else {
      this.store.beginNewMeal();
    }
  }

  ngAfterViewInit(): void {
    this.nameInputRef?.nativeElement.focus();
  }

  private async initEdit(mealId: string): Promise<void> {
    await this.store.ensureListLoaded();
    this.store.beginEditMeal(mealId);
  }

  protected close(): void {
    void this.router.navigate([{ outlets: { sheet: null } }]);
  }

  protected onNameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setDraftName(target.value);
  }

  protected onNameBlur(): void {
    this.nameTouched.set(true);
  }

  protected nameError(): string | null {
    if (!this.nameTouched()) return null;
    const validation = this.store.nameValidation();
    return validation.valid ? null : validation.error;
  }

  /** Marker in M1 ist bewusst NICHT vorhanden — die Positionsliste bleibt markierungsfrei (design-conventions.md „Weitere markierungsfreie Summen-Kontexte"). */
  protected onItemRowClick(index: number): void {
    this.store.beginChangeItem(index);
    this.step.set('m3');
    this.focusAfterRender(() => this.focusM3Amount());
  }

  protected onRemoveItem(index: number, event: Event): void {
    event.stopPropagation();
    this.store.removeDraftItem(index);
  }

  protected goToAddItem(): void {
    this.store.beginAddItem();
    this.step.set('m2');
    this.focusAfterRender(() => this.m2SearchInputRef?.nativeElement.focus());
  }

  protected backToM1(): void {
    this.step.set('m1');
  }

  protected onM2QueryInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setM2Query(target.value);
  }

  protected onSelectM2Food(food: Food): void {
    this.store.selectM2Food(food);
    this.step.set('m3');
    this.focusAfterRender(() => this.focusM3Amount());
  }

  protected backFromM3(): void {
    this.step.set(this.store.isChangeMode() ? 'm1' : 'm2');
  }

  protected onM3AmountInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setM3AmountInput(target.value);
  }

  protected m3AmountError(): string | null {
    const validation = this.store.m3AmountValidation();
    return validation.valid ? null : validation.error;
  }

  protected m3LiveNutrition() {
    const food = this.store.m3Food();
    const validation = this.store.m3AmountValidation();
    if (food === null || !validation.valid) return null;
    return computeLiveNutrition(food, validation.value);
  }

  protected m3Marker(food: Food) {
    return resolvePlausibilityMarker(food);
  }

  protected onConfirmAmount(event: Event): void {
    event.preventDefault();
    const ok = this.store.confirmAmount();
    if (ok) {
      this.step.set('m1');
    }
  }

  protected async onSaveMeal(event: Event): Promise<void> {
    event.preventDefault();
    this.nameTouched.set(true);
    const saved = await this.store.saveMeal();
    if (saved) {
      this.close();
    }
  }

  protected onRequestDelete(): void {
    this.confirmDeleteOpen.set(true);
  }

  protected onCancelDelete(): void {
    this.confirmDeleteOpen.set(false);
  }

  protected async onConfirmDelete(): Promise<void> {
    const deleted = await this.store.deleteMeal();
    this.confirmDeleteOpen.set(false);
    if (deleted) {
      this.close();
    }
  }

  private focusM3Amount(): void {
    const input = this.m3AmountInputRef?.nativeElement;
    if (!input) return;
    input.focus();
    input.select();
  }

  private focusAfterRender(focus: () => void): void {
    setTimeout(focus);
  }
}
