import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppUpdateService } from '../../../core/app-update.service';
import { MainLayoutComponent } from './main-layout.component';

@Component({ selector: 'app-stub', template: 'stub-content' })
class StubComponent {}

describe('MainLayoutComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([{ path: 'tagebuch', component: StubComponent }]),
        // `AppUpdateService` injiziert `SwUpdate`, das ohne
        // `provideServiceWorker` in der Testumgebung keinen Provider hat
        // (ADR-0015 Punkt 1) — hier reicht ein einfaches Test-Double, das
        // Layout-Zusammenspiel ist nicht Gegenstand dieses Tests, siehe
        // `update-banner.component.spec.ts` für das Banner selbst.
        {
          provide: AppUpdateService,
          useValue: {
            updateAvailable: signal(false),
            applyUpdate: () => Promise.resolve(),
            dismissForSession: () => {},
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the routed child content and the bottom navigation together', async () => {
    const fixture = TestBed.createComponent(MainLayoutComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/tagebuch');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('stub-content');
    expect(el.querySelector('app-bottom-nav')).not.toBeNull();
  });
});
