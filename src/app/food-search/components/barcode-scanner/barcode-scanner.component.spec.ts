import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoodSearchScannerService } from '../../food-search.scanner.service';
import { FoodSearchStore, type ScanPhase } from '../../food-search.store';
import { BarcodeScannerComponent } from './barcode-scanner.component';

describe('BarcodeScannerComponent', () => {
  let storeStub: {
    scanPhase: ReturnType<typeof signal<ScanPhase>>;
    scanErrorMessage: ReturnType<typeof signal<string | null>>;
    scanReentry: ReturnType<typeof signal<boolean>>;
    mealType: ReturnType<typeof signal<'breakfast' | 'lunch' | 'dinner' | 'snack'>>;
    retryScan: ReturnType<typeof vi.fn>;
    reportCameraError: ReturnType<typeof vi.fn>;
    goToManualCreateFromScan: ReturnType<typeof vi.fn>;
    handleScanDetected: ReturnType<typeof vi.fn>;
  };
  let start: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    stop = vi.fn();
    start = vi.fn().mockResolvedValue({ success: true, handle: { stop } });

    storeStub = {
      scanPhase: signal<ScanPhase>('camera'),
      scanErrorMessage: signal<string | null>(null),
      scanReentry: signal(false),
      mealType: signal('breakfast'),
      retryScan: vi.fn(),
      reportCameraError: vi.fn(),
      goToManualCreateFromScan: vi.fn(),
      handleScanDetected: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [BarcodeScannerComponent],
      providers: [
        { provide: FoodSearchStore, useValue: storeStub },
        { provide: FoodSearchScannerService, useValue: { start } },
      ],
    }).compileComponents();
  });

  it('starts the camera adapter on init without knowing which implementation runs', async () => {
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(start).toHaveBeenCalledTimes(1);
    const [video] = start.mock.calls[0];
    expect(video).toBeInstanceOf(HTMLVideoElement);
  });

  it('shows the target frame while camera/looking-up, hides it in error phases', async () => {
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.target-frame')).toBeTruthy();

    storeStub.scanPhase.set('not-found');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.target-frame')).toBeNull();
  });

  it('reports a camera error to the store when the adapter fails to start', async () => {
    start.mockResolvedValue({ success: false, reason: 'permission' });
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(storeStub.reportCameraError).toHaveBeenCalledWith('permission');
  });

  it('shows the context hint only on scan re-entry (Serien-Erfassung)', async () => {
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.context-hint')).toBeNull();

    storeStub.scanReentry.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.context-hint').textContent).toContain('Frühstück');
  });

  it('shows a German not-found message with "Manuell anlegen"/"Erneut versuchen"', async () => {
    storeStub.scanPhase.set('not-found');
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.scan-error-panel');
    expect(panel.textContent).toContain('Kein Produkt zu diesem Barcode gefunden.');
    expect(panel.querySelectorAll('button')).toHaveLength(2);
  });

  it('shows the API error message distinctly from the not-found message', async () => {
    storeStub.scanPhase.set('api-error');
    storeStub.scanErrorMessage.set('Open Food Facts ist gerade nicht erreichbar.');
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.scan-error-text').textContent).toContain(
      'Open Food Facts ist gerade nicht erreichbar.',
    );
  });

  it('"Manuell anlegen" prepares the store and emits manualCreate', async () => {
    storeStub.scanPhase.set('not-found');
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    const emitted = vi.fn();
    fixture.componentRef.instance.manualCreate.subscribe(emitted);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.primary-button').click();

    expect(storeStub.goToManualCreateFromScan).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('"Erneut versuchen" resets the scan phase and restarts the camera', async () => {
    storeStub.scanPhase.set('camera-error');
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    start.mockClear();

    fixture.nativeElement.querySelector('.text-button').click();
    await fixture.whenStable();

    expect(storeStub.retryScan).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('stops the scanner handle on destroy', async () => {
    const fixture = TestBed.createComponent(BarcodeScannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.destroy();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
