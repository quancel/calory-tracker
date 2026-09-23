import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { goalFieldConfig } from '../../goals.calculations';
import { GoalsStore } from '../../goals.store';
import { GoalFieldComponent } from '../goal-field/goal-field.component';
import { WeightLogSectionComponent } from '../weight-log-section/weight-log-section.component';

/**
 * Gewicht-Ansicht (ADR-0019): eigener Tab `/gewicht` in der
 * Bottom-Navigation. Enthält den bisherigen Gewichtslog-Abschnitt der
 * Ziele-Ansicht unverändert — Zielgewicht-Feldblock als erstes Element
 * (ADR-0018 Punkt 6), darunter Erfassen-Einstieg, großes Liniendiagramm und
 * Vorschlagskarte (`WeightLogSectionComponent`).
 *
 * Lädt beim Aktivieren die Zielzeile (`GoalsStore.load()`), weil
 * Zielgewicht-Feld und Vorschlag darauf aufbauen; die Messungen lädt
 * `WeightLogSectionComponent` selbst.
 */
@Component({
  selector: 'app-weight-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GoalFieldComponent, WeightLogSectionComponent],
  templateUrl: './weight-page.component.html',
  styleUrl: './weight-page.component.css',
})
export class WeightPageComponent implements OnInit {
  protected readonly goalsStore = inject(GoalsStore);
  protected readonly targetWeightField = goalFieldConfig('targetWeightKg');

  ngOnInit(): void {
    void this.goalsStore.load();
  }
}
