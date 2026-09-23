import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';

describe('AuthStore', () => {
  let signInWithPassword: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    signInWithPassword = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { signInWithPassword } }],
    });
  });

  it('sets submitting during signIn and clears it again on success', async () => {
    signInWithPassword.mockResolvedValue({ success: true });
    const store = TestBed.inject(AuthStore);

    const pending = store.signIn('duc@example.com', 'secret123');
    expect(store.submitting()).toBe(true);

    const success = await pending;

    expect(success).toBe(true);
    expect(store.submitting()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('exposes the generic error message on failure and resets submitting', async () => {
    signInWithPassword.mockResolvedValue({
      success: false,
      message: 'E-Mail oder Passwort ist falsch.',
    });
    const store = TestBed.inject(AuthStore);

    const success = await store.signIn('duc@example.com', 'wrong');

    expect(success).toBe(false);
    expect(store.error()).toBe('E-Mail oder Passwort ist falsch.');
    expect(store.submitting()).toBe(false);
  });

  it('clearError resets the error state', async () => {
    signInWithPassword.mockResolvedValue({ success: false, message: 'x' });
    const store = TestBed.inject(AuthStore);
    await store.signIn('duc@example.com', 'wrong');

    store.clearError();

    expect(store.error()).toBeNull();
  });
});
