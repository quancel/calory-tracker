import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '../../auth.store';

interface LoginForm {
  email: FormControl<string>;
  password: FormControl<string>;
}

/**
 * Login-Ansicht — funktional (Paket PO-2026-09-20-002).
 *
 * Weg Komponente → Store → Service: diese Komponente ruft ausschließlich
 * `AuthStore.signIn` auf, kein direkter Supabase-Zugriff (siehe
 * ADR-0003). Bei Erfolg navigiert sie zu `/tagebuch`.
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css',
})
export class LoginPageComponent {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  protected readonly passwordVisible = signal(false);

  protected readonly submitting = this.authStore.submitting;
  protected readonly errorMessage = this.authStore.error;

  protected readonly form = new FormGroup<LoginForm>({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Eingaben bleiben bei Fehler erhalten — Formular wird bei Fehlschlag
    // bewusst NICHT zurückgesetzt (design_notes Paket 002).
    const { email, password } = this.form.getRawValue();
    const success = await this.authStore.signIn(email, password);

    if (success) {
      await this.router.navigateByUrl('/tagebuch');
      return;
    }

    this.passwordInput()?.nativeElement.focus();
  }
}
