import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateService } from '../../../core/app-update.service';

/**
 * Update-Hinweis (design-conventions.md „Update-Hinweis-Komponente",
 * ADR-0015): gerendert von `MainLayoutComponent`, damit sie auf allen vier
 * Ansichten hinter dem Login erscheint — bewusst nicht auf `/login`
 * (ADR-0015 Punkt 2). Kennt `SwUpdate` nicht selbst, liest ausschließlich
 * `AppUpdateService.updateAvailable()` und ruft dessen Aktionen auf.
 */
@Component({
  selector: 'app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.css',
})
export class UpdateBannerComponent {
  protected readonly appUpdate = inject(AppUpdateService);

  protected onReload(): void {
    void this.appUpdate.applyUpdate();
  }

  protected onDismiss(): void {
    this.appUpdate.dismissForSession();
  }
}
