import {
  FoodSearchScannerService,
  classifyGetUserMediaError,
  isNativeDetectorSupported,
} from './food-search.scanner.service';

describe('classifyGetUserMediaError', () => {
  it('classifies NotAllowedError as "permission"', () => {
    expect(classifyGetUserMediaError(new DOMException('denied', 'NotAllowedError'))).toBe(
      'permission',
    );
  });

  it('classifies SecurityError as "permission"', () => {
    expect(classifyGetUserMediaError(new DOMException('blocked', 'SecurityError'))).toBe(
      'permission',
    );
  });

  it('classifies any other DOMException as "unavailable"', () => {
    expect(classifyGetUserMediaError(new DOMException('no camera', 'NotFoundError'))).toBe(
      'unavailable',
    );
  });

  it('classifies a non-DOMException error as "unavailable" (defensive)', () => {
    expect(classifyGetUserMediaError(new Error('unexpected'))).toBe('unavailable');
  });
});

describe('isNativeDetectorSupported', () => {
  afterEach(() => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  it('is false without a global BarcodeDetector', () => {
    expect(isNativeDetectorSupported()).toBe(false);
  });

  it('is true once BarcodeDetector exists on window', () => {
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {};
    expect(isNativeDetectorSupported()).toBe(true);
  });
});

describe('FoodSearchScannerService.start', () => {
  it('returns "unsupported" when the platform has no mediaDevices.getUserMedia', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    // jsdom does not implement mediaDevices by default; this test only relies on that.
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    }

    const service = new FoodSearchScannerService();
    const video = document.createElement('video');
    const onDetect = vi.fn();

    const result = await service.start(video, onDetect);

    expect(result).toEqual({ success: false, reason: 'unsupported' });
    expect(onDetect).not.toHaveBeenCalled();

    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      });
    }
  });

  it('classifies a getUserMedia rejection instead of throwing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      },
      configurable: true,
    });

    const service = new FoodSearchScannerService();
    const video = document.createElement('video');

    const result = await service.start(video, vi.fn());

    expect(result).toEqual({ success: false, reason: 'permission' });
  });
});
