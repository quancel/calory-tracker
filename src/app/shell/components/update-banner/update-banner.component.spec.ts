import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AppUpdateService } from '../../../core/app-update.service';
import { UpdateBannerComponent } from './update-banner.component';

describe('UpdateBannerComponent', () => {
  let fixture: ComponentFixture<UpdateBannerComponent>;
  let updateAvailable: ReturnType<typeof signal<boolean>>;
  let applyUpdate: ReturnType<typeof vi.fn>;
  let dismissForSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateAvailable = signal(false);
    applyUpdate = vi.fn().mockResolvedValue(undefined);
    dismissForSession = vi.fn();

    TestBed.configureTestingModule({
      imports: [UpdateBannerComponent],
      providers: [
        {
          provide: AppUpdateService,
          useValue: { updateAvailable, applyUpdate, dismissForSession },
        },
      ],
    });

    fixture = TestBed.createComponent(UpdateBannerComponent);
  });

  it('zeigt kein Banner, solange kein Update verfügbar ist', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.update-banner')).toBeNull();
  });

  it('zeigt das Banner mit role="status", Text und beiden Aktionen, sobald ein Update verfügbar ist', () => {
    updateAvailable.set(true);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.update-banner');
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Neue Version verfügbar');
    expect(fixture.nativeElement.querySelector('.reload-button').textContent).toContain(
      'Neu laden',
    );
    expect(fixture.nativeElement.querySelector('.later-button').textContent).toContain('Später');
  });

  it('"Neu laden" ruft applyUpdate() auf', () => {
    updateAvailable.set(true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.reload-button').click();

    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('"Später" ruft dismissForSession() auf', () => {
    updateAvailable.set(true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.later-button').click();

    expect(dismissForSession).toHaveBeenCalledTimes(1);
  });
});
