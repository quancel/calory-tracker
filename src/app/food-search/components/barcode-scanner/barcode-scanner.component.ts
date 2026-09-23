import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MEAL_TYPE_LABELS } from '../../../core/meal-type.constants';
import { FoodSearchScannerService, type ScannerHandle } from '../../food-search.scanner.service';
import { FoodSearchStore } from '../../food-search.store';

/**
 * Vollbild-Scan-Zustand des Eingabe-Sheets (ADR-0010 Punkt 1): kein eigenes
 * Feature, liegt in `food-search/components/`. Kapselt nur die
 * Kamera-/Zielrahmen-Darstellung und delegiert jede Entscheidung
 * (Kamera-Adapter, Lookup-Reihenfolge, Fehlerzustand) an
 * `FoodSearchScannerService` bzw. `FoodSearchStore` — diese Komponente
 * weiß selbst nichts über `BarcodeDetector` vs. `@zxing/browser`
 * (code-conventions.md „Browser-Plattform-APIs mit Fallback").
 *
 * Den Step-Wechsel des Sheets (`SheetStep`) besitzt weiterhin
 * `FoodEntrySheetComponent` — sie beobachtet `store.scanPhase()` per
 * `effect()` für die automatischen Übergänge (Treffer → Step B,
 * unvollständiger OFF-Treffer → Step A2) und reagiert auf
 * `(manualCreate)` für den expliziten Wechsel aus einem Fehlerzustand.
 */
@Component({
  selector: 'app-barcode-scanner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.css',
})
export class BarcodeScannerComponent implements AfterViewInit, OnDestroy {
  protected readonly store = inject(FoodSearchStore);
  private readonly scanner = inject(FoodSearchScannerService);

  @Output() readonly manualCreate = new EventEmitter<void>();

  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  /** Grüner Puls am Zielrahmen bei Erkennung (design-conventions.md), blendet nach 600ms selbst wieder aus. */
  protected readonly pulse = signal(false);

  @ViewChild('video') private readonly videoRef?: ElementRef<HTMLVideoElement>;

  private handle: ScannerHandle | null = null;

  protected readonly showTargetFrame = computed(() => {
    const phase = this.store.scanPhase();
    return phase === 'camera' || phase === 'looking-up';
  });

  protected readonly errorText = computed(() => {
    switch (this.store.scanPhase()) {
      case 'not-found':
        return 'Kein Produkt zu diesem Barcode gefunden.';
      case 'api-error':
      case 'camera-error':
        return this.store.scanErrorMessage() ?? 'Unbekannter Fehler.';
      default:
        return '';
    }
  });

  protected readonly showErrorPanel = computed(() => {
    const phase = this.store.scanPhase();
    return phase === 'not-found' || phase === 'api-error' || phase === 'camera-error';
  });

  ngAfterViewInit(): void {
    void this.startCamera();
  }

  ngOnDestroy(): void {
    this.handle?.stop();
    this.handle = null;
  }

  protected async retry(): Promise<void> {
    this.store.retryScan();
    await this.startCamera();
  }

  protected onManualCreate(): void {
    this.handle?.stop();
    this.handle = null;
    this.store.goToManualCreateFromScan();
    this.manualCreate.emit();
  }

  private async startCamera(): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!video) return;

    const result = await this.scanner.start(video, (code) => this.onDetected(code));
    if (!result.success) {
      this.store.reportCameraError(result.reason);
      return;
    }
    this.handle = result.handle;
  }

  private onDetected(code: string): void {
    this.pulse.set(true);
    setTimeout(() => this.pulse.set(false), 600);
    this.handle?.stop();
    this.handle = null;
    void this.store.handleScanDetected(code);
  }
}
