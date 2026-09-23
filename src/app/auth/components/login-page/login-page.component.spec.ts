import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../../auth.store';
import { LoginPageComponent } from './login-page.component';

describe('LoginPageComponent', () => {
  let signIn: ReturnType<typeof vi.fn>;
  let submitting: ReturnType<typeof signal<boolean>>;
  let error: ReturnType<typeof signal<string | null>>;
  let router: Router;

  beforeEach(async () => {
    signIn = vi.fn();
    submitting = signal(false);
    error = signal<string | null>(null);

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideRouter([{ path: 'tagebuch', children: [] }]),
        {
          provide: AuthStore,
          useValue: {
            signIn,
            submitting: submitting.asReadonly(),
            error: error.asReadonly(),
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('marks fields as touched and shows inline errors on submit with an empty form', () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(signIn).not.toHaveBeenCalled();
    expect(compiled.textContent).toContain('E-Mail ist erforderlich.');
    expect(compiled.textContent).toContain('Passwort ist erforderlich.');
  });

  it('submits valid input via the store and navigates to /tagebuch on success', async () => {
    signIn.mockResolvedValue(true);
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const emailInput = compiled.querySelector<HTMLInputElement>('#email')!;
    const passwordInput = compiled.querySelector<HTMLInputElement>('#password')!;
    emailInput.value = 'duc@example.com';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'secret123';
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    compiled.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(signIn).toHaveBeenCalledWith('duc@example.com', 'secret123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tagebuch');
  });

  it('keeps input values, shows the generic error (role=alert) and focuses the password field on failure', async () => {
    signIn.mockImplementation(async () => {
      error.set('E-Mail oder Passwort ist falsch.');
      return false;
    });
    const fixture = TestBed.createComponent(LoginPageComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const emailInput = compiled.querySelector<HTMLInputElement>('#email')!;
    const passwordInput = compiled.querySelector<HTMLInputElement>('#password')!;
    emailInput.value = 'duc@example.com';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'wrong-pw';
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    compiled.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emailInput.value).toBe('duc@example.com');
    expect(passwordInput.value).toBe('wrong-pw');
    expect(compiled.querySelector('[role="alert"]')?.textContent).toContain(
      'E-Mail oder Passwort ist falsch.',
    );
    expect(passwordInput.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(passwordInput);

    fixture.nativeElement.remove();
  });

  it('toggles password visibility', () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const passwordInput = compiled.querySelector<HTMLInputElement>('#password')!;
    const toggle = compiled.querySelector<HTMLButtonElement>('.visibility-toggle')!;

    expect(passwordInput.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(passwordInput.type).toBe('text');
  });

  it('shows a spinner and disables the submit button while submitting', () => {
    submitting.set(true);
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const submitButton = compiled.querySelector<HTMLButtonElement>('.submit-button')!;
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toContain('Meldet an...');
    expect(compiled.querySelector('.spinner')).toBeTruthy();
  });
});
