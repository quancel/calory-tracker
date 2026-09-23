import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MacroBarComponent } from '../../../shared/ui/macro-bar/macro-bar.component';
import type { PeriodKind } from '../../models/stats.model';
import { StatsStore } from '../../stats.store';
import { BarChartComponent } from '../bar-chart/bar-chart.component';
import { PeriodNavComponent } from '../period-nav/period-nav.component';
import { PeriodSwitchComponent } from '../period-switch/period-switch.component';

/**
 * Verlaufs-Shell — Wurzelkomponente der Route `verlauf` (Paket
 * PO-2026-09-20-012, ADR-0014). Orchestriert `StatsStore` (Signals) und die
 * reinen Anzeige-Komponenten (Zeitraum-Umschalter, Perioden-Navigation,
 * Balken-Chart, Makro-Zusammenfassung).
 */
@Component({
  selector: 'app-stats-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeriodSwitchComponent,
    PeriodNavComponent,
    BarChartComponent,
    MacroBarComponent,
  ],
  templateUrl: './stats-shell.component.html',
  styleUrl: './stats-shell.component.css',
})
export class StatsShellComponent {
  protected readonly statsStore = inject(StatsStore);

  protected readonly averageHint = computed(() => `Ø über ${this.statsStore.averages().count} Tage`);

  protected onKindChange(kind: PeriodKind): void {
    void this.statsStore.setPeriodKind(kind);
  }

  protected onPrevious(): void {
    void this.statsStore.goToPreviousPeriod();
  }

  protected onNext(): void {
    void this.statsStore.goToNextPeriod();
  }
}
