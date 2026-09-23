import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MealsStore } from '../../meals.store';

/**
 * Verwaltungsansicht „Gespeicherte Mahlzeiten" — gewöhnliche Top-Level-
 * Route `mahlzeiten` (ADR-0012 Punkt 9, design-conventions.md
 * „Verwaltungsansicht"). Liste im Karten/Listen-Stil, Tap öffnet das
 * Mahlzeit-Sheet zum Bearbeiten; „+" öffnet es leer.
 */
@Component({
  selector: 'app-meals-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './meals-list.component.html',
  styleUrl: './meals-list.component.css',
})
export class MealsListComponent implements OnInit {
  protected readonly store = inject(MealsStore);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.store.ensureListLoaded();
  }

  /** Kurztext „3 Positionen: Haferflocken, Banane…" — bis zu zwei Food-Namen als Vorschau (design-conventions.md „Zeilendarstellung"). */
  protected itemsPreview(items: readonly { food: { name: string } }[]): string {
    const names = items.slice(0, 2).map((item) => item.food.name);
    const suffix = items.length > 2 ? '…' : '';
    return `${items.length} ${items.length === 1 ? 'Position' : 'Positionen'}: ${names.join(', ')}${suffix}`;
  }

  protected openNew(): void {
    void this.router.navigate([{ outlets: { sheet: ['mahlzeit-bearbeiten'] } }]);
  }

  protected openMeal(mealId: string): void {
    void this.router.navigate([{ outlets: { sheet: ['mahlzeit-bearbeiten'] } }], {
      queryParams: { mealId },
    });
  }
}
