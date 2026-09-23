import { TestBed } from '@angular/core/testing';
import { SwUpdate, type UnrecoverableStateEvent, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService, RELOAD_PAGE } from './app-update.service';

/**
 * Ersetzt `SwUpdate` per `TestBed`-Provider (analog `SUPABASE_CLIENT_FACTORY`
 * in `supabase.service.spec.ts`) statt `@angular/service-worker` zu mocken —
 * `AppUpdateService` ist die einzige Stelle, die `SwUpdate` injiziert
 * (ADR-0015 Punkt 1). `RELOAD_PAGE` wird ebenfalls ersetzt, da
 * `document.location.reload` in jsdom nicht überschreibbar ist.
 */
function configureWithSwUpdate(swUpdate: Partial<SwUpdate>, reloadPage: () => void) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SwUpdate, useValue: swUpdate },
      { provide: RELOAD_PAGE, useValue: reloadPage },
    ],
  });
}

const readyEvent: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'a' },
  latestVersion: { hash: 'b' },
};
const installationFailedEvent: VersionEvent = {
  type: 'VERSION_INSTALLATION_FAILED',
  version: { hash: 'b' },
  error: 'boom',
};
const unrecoverableEvent: UnrecoverableStateEvent = {
  type: 'UNRECOVERABLE_STATE',
  reason: 'boom',
};

describe('AppUpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let activateUpdate: () => Promise<boolean>;
  let reloadSpy: () => void;

  beforeEach(() => {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    activateUpdate = vi.fn().mockResolvedValue(true) as () => Promise<boolean>;
    reloadSpy = vi.fn() as () => void;
  });

  it('bleibt dauerhaft "false", wenn der Service Worker abgeschaltet ist (ADR-0015 Punkt 6)', () => {
    configureWithSwUpdate(
      { isEnabled: false, versionUpdates, unrecoverable, activateUpdate },
      reloadSpy,
    );
    const service = TestBed.inject(AppUpdateService);

    versionUpdates.next(readyEvent);

    expect(service.updateAvailable()).toBe(false);
  });

  it('meldet ein Update bei VERSION_READY', () => {
    configureWithSwUpdate(
      { isEnabled: true, versionUpdates, unrecoverable, activateUpdate },
      reloadSpy,
    );
    const service = TestBed.inject(AppUpdateService);

    versionUpdates.next(readyEvent);

    expect(service.updateAvailable()).toBe(true);
  });

  it('blendet bei VERSION_INSTALLATION_FAILED wieder aus', () => {
    configureWithSwUpdate(
      { isEnabled: true, versionUpdates, unrecoverable, activateUpdate },
      reloadSpy,
    );
    const service = TestBed.inject(AppUpdateService);

    versionUpdates.next(readyEvent);
    versionUpdates.next(installationFailedEvent);

    expect(service.updateAvailable()).toBe(false);
  });

  it('applyUpdate() wendet das Update an und lädt neu', async () => {
    configureWithSwUpdate(
      { isEnabled: true, versionUpdates, unrecoverable, activateUpdate },
      reloadSpy,
    );
    const service = TestBed.inject(AppUpdateService);
    versionUpdates.next(readyEvent);

    await service.applyUpdate();

    expect(activateUpdate).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('unrecoverable löst einen Reload aus (ADR-0002)', () => {
    configureWithSwUpdate(
      { isEnabled: true, versionUpdates, unrecoverable, activateUpdate },
      reloadSpy,
    );
    TestBed.inject(AppUpdateService);

    unrecoverable.next(unrecoverableEvent);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('dismissForSession() unterdrückt das Banner nur für die laufende Vordergrundphase und wird bei visibilitychange zurückgesetzt (ADR-0015 Punkt 4)', () => {
    configureWithSwUpdate(
      { isEnabled: true, versionUpdates, unrecoverable, activateUpdate },
      reloadSpy,
    );
    const service = TestBed.inject(AppUpdateService);
    versionUpdates.next(readyEvent);

    service.dismissForSession();
    expect(service.updateAvailable()).toBe(false);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(service.updateAvailable()).toBe(true);
  });
});
