import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { goalFieldConfig } from '../../goals.calculations';
import { GOAL_FIELD_ORDER } from '../../models/goal.model';
import { GoalsStore } from '../../goals.store';
import { GoalFieldComponent } from '../goal-field/goal-field.component';

/**
 * Ziele-Ansicht (Paket PO-2026-09-20-005, ADR-0007): die vier kcal-/Makro-
 * Feldblöcke. Gewichtslog, Zielgewicht und Kalorienziel-Vorschlag liegen
 * seit ADR-0019 in der eigenen Gewicht-Ansicht (`/gewicht`,
 * `WeightPageComponent`). Eigene
 * Top-Level-Route `ziele`, erreichbar über das Zahnrad-Icon im
 * Tagebuch-Header (`diary-shell`) und mit sichtbarem Zurück-Weg hierhin per
 * `routerLink`. Lädt bei jedem Aktivieren der Route neu
 * (`GoalsStore.load()`), damit ein erneuter Besuch keine veralteten
 * Zustände einer vorherigen Sitzung zeigt.
 */
@Component({
  selector: 'app-goals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GoalFieldComponent],
  templateUrl: './goals-page.component.html',
  styleUrl: './goals-page.component.css',
})
export class GoalsPageComponent implements OnInit {
  protected readonly goalsStore = inject(GoalsStore);
  /**
   * Konfiguration der **vier** kcal-/Makro-Feldblöcke in Anzeigereihenfolge
   * (`GOAL_FIELD_ORDER`) — bewusst nicht `GOAL_FIELD_CONFIG` direkt, das
   * seit ADR-0018 auch das Zielgewicht enthält (ADR-0018 Punkt 6).
   */
  protected readonly fields = GOAL_FIELD_ORDER.map(goalFieldConfig);

  ngOnInit(): void {
    void this.goalsStore.load();
  }
}
