import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../core/supabase.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let signInWithPassword: ReturnType<typeof vi.fn>;
  let signOut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    signInWithPassword = vi.fn();
    signOut = vi.fn();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { auth: { signInWithPassword, signOut } } },
        },
      ],
    });
  });

  it('returns a success result on valid credentials', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const service = TestBed.inject(AuthService);

    const result = await service.signInWithPassword('duc@example.com', 'secret123');

    expect(result).toEqual({ success: true });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'duc@example.com',
      password: 'secret123',
    });
  });

  it('translates any Supabase error into the generic domain message', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const service = TestBed.inject(AuthService);

    const result = await service.signInWithPassword('duc@example.com', 'wrong');

    expect(result).toEqual({ success: false, message: 'E-Mail oder Passwort ist falsch.' });
  });

  it('delegates signOut to the Supabase client', async () => {
    signOut.mockResolvedValue({ error: null });
    const service = TestBed.inject(AuthService);

    await service.signOut();

    expect(signOut).toHaveBeenCalled();
  });
});
