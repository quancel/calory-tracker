import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { authGuard, redirectIfAuthenticatedGuard } from './auth.guard';
import { SupabaseService } from './supabase.service';

function setup(authenticated: boolean) {
  const restoreSession = vi.fn().mockResolvedValue(undefined);
  const isAuthenticated = vi.fn(() => authenticated);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: { restoreSession, isAuthenticated } },
    ],
  });

  return {
    restoreSession,
    router: TestBed.inject(Router),
  };
}

const noopSnapshot = {} as ActivatedRouteSnapshot;
const noopState = {} as RouterStateSnapshot;

describe('authGuard', () => {
  it('awaits session restore and allows activation once authenticated', async () => {
    const { restoreSession } = setup(true);

    const result = await TestBed.runInInjectionContext(() => authGuard(noopSnapshot, noopState));

    expect(restoreSession).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('redirects to /login when not authenticated', async () => {
    const { router } = setup(false);

    const result = await TestBed.runInInjectionContext(() => authGuard(noopSnapshot, noopState));

    expect(result).toEqual(router.createUrlTree(['/login']));
  });
});

describe('redirectIfAuthenticatedGuard', () => {
  it('redirects to /tagebuch when a session already exists', async () => {
    const { router } = setup(true);

    const result = await TestBed.runInInjectionContext(() =>
      redirectIfAuthenticatedGuard(noopSnapshot, noopState),
    );

    expect(result).toEqual(router.createUrlTree(['/tagebuch']));
  });

  it('allows activation when not authenticated', async () => {
    setup(false);

    const result = await TestBed.runInInjectionContext(() =>
      redirectIfAuthenticatedGuard(noopSnapshot, noopState),
    );

    expect(result).toBe(true);
  });
});
