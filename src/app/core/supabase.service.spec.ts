import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT_FACTORY, SupabaseService } from './supabase.service';

const mockAuth = {
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
};

/**
 * Ersetzt den Client-*Erzeuger* per `TestBed`-Provider statt
 * `@supabase/supabase-js` per `vi.mock` zu ersetzen (siehe
 * `SUPABASE_CLIENT_FACTORY`-Kommentar in `supabase.service.ts`) — `vi.mock`
 * griff hier wegen Vitest-Dep-Prebundling nicht zuverlässig, weil der
 * bisherige `createClient`-Aufruf im Feld-Initialisierer sofort beim
 * Modul-Laden ausgewertet wurde.
 */
function configureWithFactory(factory: ReturnType<typeof vi.fn>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SUPABASE_CLIENT_FACTORY, useValue: factory }],
  });
}

describe('SupabaseService', () => {
  let clientFactory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockAuth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
    clientFactory = vi.fn(() => ({ auth: mockAuth }));
    configureWithFactory(clientFactory);
  });

  it('creates exactly one Supabase client and starts unauthenticated', () => {
    const service = TestBed.inject(SupabaseService);

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.userId()).toBeNull();
    expect(service.session()).toBeNull();
  });

  it('restoreSession sets the session state from getSession and is idempotent', async () => {
    const fakeSession = { user: { id: 'user-1' } };
    mockAuth.getSession.mockResolvedValue({ data: { session: fakeSession } });
    const service = TestBed.inject(SupabaseService);

    await service.restoreSession();
    await service.restoreSession();

    expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.userId()).toBe('user-1');
  });

  it('updates the session state whenever onAuthStateChange fires', () => {
    let capturedCallback: ((event: string, session: unknown) => void) | undefined;
    mockAuth.onAuthStateChange.mockImplementation((cb: typeof capturedCallback) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const service = TestBed.inject(SupabaseService);
    const fakeSession = { user: { id: 'user-2' } };

    capturedCallback?.('SIGNED_IN', fakeSession);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.userId()).toBe('user-2');

    capturedCallback?.('SIGNED_OUT', null);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.userId()).toBeNull();
  });
});
