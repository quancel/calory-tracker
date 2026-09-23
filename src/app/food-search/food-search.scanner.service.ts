import { Injectable } from '@angular/core';
import type { CameraErrorReason } from './food-search.calculations';

/**
 * Browser-Plattform-Adapter für Barcode-Erkennung (ADR-0010 Punkt 2):
 * `BarcodeDetector`, wenn verfügbar, sonst `@zxing/browser` per dynamischem
 * `import()` — erst im Fallback-Fall geladen, nie statisch. Aufrufer
 * (`BarcodeScannerComponent`) erfahren nie, welche Implementierung läuft;
 * sie prüfen selbst nie auf Verfügbarkeit (code-conventions.md).
 */

export interface ScannerHandle {
  /** Stoppt Erkennung und Kamera-Stream. Nach dem ersten Aufruf ein No-op. */
  stop(): void;
}

export type ScanStartResult =
  { success: true; handle: ScannerHandle } | { success: false; reason: CameraErrorReason };

const DETECT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] as const;

interface NativeDetection {
  rawValue: string;
}

interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<NativeDetection[]>;
}

interface NativeBarcodeDetectorCtor {
  new (options: { formats: readonly string[] }): NativeBarcodeDetector;
}

/** `'BarcodeDetector' in window` — Komponenten fragen das nie selbst ab. */
export function isNativeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/** Reine Klassifikation eines `getUserMedia`-Fehlers für den Fehlerzustand (design-conventions.md „Fehler-Panels"). */
export function classifyGetUserMediaError(error: unknown): CameraErrorReason {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'permission';
    }
  }
  return 'unavailable';
}

@Injectable({ providedIn: 'root' })
export class FoodSearchScannerService {
  /**
   * Startet Kamera + Erkennung auf dem übergebenen `<video>`-Element.
   * `onDetect` wird beim ersten erkannten Code aufgerufen — der Aufrufer
   * entscheidet, ob/wann erneut gestartet wird (kein Auto-Restart hier).
   */
  async start(video: HTMLVideoElement, onDetect: (code: string) => void): Promise<ScanStartResult> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { success: false, reason: 'unsupported' };
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (error) {
      return { success: false, reason: classifyGetUserMediaError(error) };
    }

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();

    if (isNativeDetectorSupported()) {
      return this.startNativeDetector(video, stream, onDetect);
    }
    return this.startZxingFallback(video, stream, onDetect);
  }

  private startNativeDetector(
    video: HTMLVideoElement,
    stream: MediaStream,
    onDetect: (code: string) => void,
  ): ScanStartResult {
    const DetectorCtor = (window as unknown as { BarcodeDetector: NativeBarcodeDetectorCtor })
      .BarcodeDetector;
    const detector = new DetectorCtor({ formats: DETECT_FORMATS });

    let stopped = false;

    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const results = await detector.detect(video);
        if (!stopped && results.length > 0) {
          onDetect(results[0].rawValue);
          return;
        }
      } catch {
        // Ein einzelner fehlgeschlagener Frame wird ignoriert, nächster Frame versucht erneut.
      }
      if (!stopped) {
        requestAnimationFrame(() => void tick());
      }
    };
    requestAnimationFrame(() => void tick());

    return {
      success: true,
      handle: {
        stop: () => {
          stopped = true;
          stream.getTracks().forEach((track) => track.stop());
        },
      },
    };
  }

  private async startZxingFallback(
    video: HTMLVideoElement,
    stream: MediaStream,
    onDetect: (code: string) => void,
  ): Promise<ScanStartResult> {
    const zxing = await import('@zxing/browser');
    const reader = new zxing.BrowserMultiFormatReader();

    let stopped = false;
    const controls = await reader.decodeFromVideoElement(video, (result, _error, _controls) => {
      if (!stopped && result) {
        onDetect(result.getText());
      }
    });

    return {
      success: true,
      handle: {
        stop: () => {
          if (stopped) return;
          stopped = true;
          controls.stop();
          stream.getTracks().forEach((track) => track.stop());
        },
      },
    };
  }
}
