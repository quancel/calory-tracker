import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';

describe('ConnectivityService (ADR-0016 Punkt 9)', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
  });

  it('reflects navigator.onLine as the initial value', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const service = TestBed.inject(ConnectivityService);

    expect(service.online()).toBe(true);
  });

  it('flips to false on an "offline" window event', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const service = TestBed.inject(ConnectivityService);

    window.dispatchEvent(new Event('offline'));

    expect(service.online()).toBe(false);
  });

  it('flips to true on an "online" window event', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const service = TestBed.inject(ConnectivityService);

    window.dispatchEvent(new Event('online'));

    expect(service.online()).toBe(true);
  });
});
