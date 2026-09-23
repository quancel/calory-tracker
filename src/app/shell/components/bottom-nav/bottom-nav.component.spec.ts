import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BottomNavComponent } from './bottom-nav.component';

describe('BottomNavComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomNavComponent],
      providers: [
        provideRouter([
          { path: 'tagebuch', component: BottomNavComponent },
          { path: 'verlauf', component: BottomNavComponent },
          { path: 'ziele', component: BottomNavComponent },
          { path: 'mahlzeiten', component: BottomNavComponent },
        ]),
      ],
    }).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(BottomNavComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a landmark nav with exactly two tabs, Tagebuch and Verlauf', () => {
    const fixture = setup();
    const nav = fixture.nativeElement.querySelector('nav[aria-label="Hauptnavigation"]');
    expect(nav).not.toBeNull();

    const tabs = fixture.nativeElement.querySelectorAll('.nav-tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain('Tagebuch');
    expect(tabs[1].textContent).toContain('Verlauf');
  });

  it('marks the Tagebuch tab active with aria-current when on /tagebuch', async () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/tagebuch');
    fixture.detectChanges();

    const tagebuchTab = fixture.nativeElement.querySelector('a[routerLink="/tagebuch"]');
    const verlaufTab = fixture.nativeElement.querySelector('a[routerLink="/verlauf"]');

    expect(tagebuchTab.classList.contains('active')).toBe(true);
    expect(tagebuchTab.getAttribute('aria-current')).toBe('page');
    expect(verlaufTab.classList.contains('active')).toBe(false);
    expect(verlaufTab.hasAttribute('aria-current')).toBe(false);
  });

  it('marks no tab active on /ziele — bottom nav stays visible but without an active tab', async () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/ziele');
    fixture.detectChanges();

    const tagebuchTab = fixture.nativeElement.querySelector('a[routerLink="/tagebuch"]');
    const verlaufTab = fixture.nativeElement.querySelector('a[routerLink="/verlauf"]');

    expect(tagebuchTab.classList.contains('active')).toBe(false);
    expect(tagebuchTab.hasAttribute('aria-current')).toBe(false);
    expect(verlaufTab.classList.contains('active')).toBe(false);
    expect(verlaufTab.hasAttribute('aria-current')).toBe(false);
  });

  it('marks no tab active on /mahlzeiten — bottom nav stays visible but without an active tab', async () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/mahlzeiten');
    fixture.detectChanges();

    const tagebuchTab = fixture.nativeElement.querySelector('a[routerLink="/tagebuch"]');
    const verlaufTab = fixture.nativeElement.querySelector('a[routerLink="/verlauf"]');

    expect(tagebuchTab.classList.contains('active')).toBe(false);
    expect(verlaufTab.classList.contains('active')).toBe(false);
  });
});
