import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { WeightChartComponent } from '../weight-chart/weight-chart.component';
import { WeightEntrySheetComponent } from '../weight-entry-sheet/weight-entry-sheet.component';
import { WeightSuggestionCardComponent } from '../weight-suggestion-card/weight-suggestion-card.component';
import { WeightStore } from '../../weight.store';

/**
 * Container des Gewichtslog-Abschnitts (design-conventions.md „Gewichtslog &
 * Kalorienziel-Vorschlag"): Erfassen-Einstieg, Liniendiagramm,
 * Vorschlagskarte und deren Zustands-Priorität. Der Zielgewicht-Feldblock
 * selbst liegt **außerhalb** dieser Komponente in
 * `goals-page.component.html` (ADR-0018 Punkt 6, `GoalsStore`-Feld, kein
 * `WeightStore`-Zustand) — visuell aber im selben `<section>`.
 *
 * Lädt beim Mounten selbst nach (`WeightStore.load()`), analog
 * `GoalsPageComponent.ngOnInit()`.
 */
@Component({
  selector: 'app-weight-log-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WeightChartComponent, WeightSuggestionCardComponent, WeightEntrySheetComponent],
  templateUrl: './weight-log-section.component.html',
  styleUrl: './weight-log-section.component.css',
})
export class WeightLogSectionComponent implements OnInit {
  protected readonly store = inject(WeightStore);

  ngOnInit(): void {
    void this.store.load();
  }
}
