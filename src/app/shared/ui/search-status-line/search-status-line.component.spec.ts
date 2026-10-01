import { TestBed } from '@angular/core/testing';
import type { SearchStatus } from '../../../core/foods.calculations';
import { SearchStatusLineComponent } from './search-status-line.component';

describe('SearchStatusLineComponent (ADR-0021 Punkt 13)', () => {
  function render(inputs: {
    status?: SearchStatus;
    announcement?: string | null;
    reserveSpace?: boolean;
  }) {
    const fixture = TestBed.createComponent(SearchStatusLineComponent);
    if (inputs.status) fixture.componentRef.setInput('status', inputs.status);
    if (inputs.announcement !== undefined)
      fixture.componentRef.setInput('announcement', inputs.announcement);
    if (inputs.reserveSpace !== undefined)
      fixture.componentRef.setInput('reserveSpace', inputs.reserveSpace);
    fixture.detectChanges();
    return fixture;
  }

  const live = (fixture: ReturnType<typeof render>): HTMLElement =>
    fixture.nativeElement.querySelector('[role="status"]');

  it('always renders the polite live region, empty for "none"', () => {
    const fixture = render({ status: { kind: 'none' } });

    expect(live(fixture).getAttribute('aria-live')).toBe('polite');
    expect(live(fixture).textContent?.trim()).toBe('');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('local-unavailable: text and retry button, no icon', () => {
    const fixture = render({ status: { kind: 'local-unavailable' } });

    expect(live(fixture).textContent).toContain('Lokale Treffer nicht verfügbar');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Erneut versuchen');
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
  });

  it('offline: cloud-off icon and text, no button', () => {
    const fixture = render({ status: { kind: 'offline' } });

    expect(live(fixture).textContent).toContain('Offline – nur lokale Treffer');
    expect(fixture.nativeElement.querySelector('svg')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('server-failed: icon, text and retry button', () => {
    const fixture = render({ status: { kind: 'server-failed' } });

    expect(live(fixture).textContent).toContain('Online-Suche fehlgeschlagen');
    expect(fixture.nativeElement.querySelector('svg')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('button')).toBeTruthy();
  });

  it('searching: text only, without icon, spinner or button', () => {
    const fixture = render({ status: { kind: 'searching' } });

    expect(live(fixture).textContent).toContain('Suche online …');
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('emits retry when the button is pressed', () => {
    const fixture = render({ status: { kind: 'server-failed' } });
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    fixture.nativeElement.querySelector('button').click();

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders the announcement as sr-only text inside the live region', () => {
    const fixture = render({ status: { kind: 'none' }, announcement: '3 Treffer online' });

    const sr = live(fixture).querySelector('.sr-only');
    expect(sr?.textContent).toContain('3 Treffer online');
  });

  it('reserves the line height only when asked to', () => {
    expect(live(render({ reserveSpace: false })).classList.contains('status-line-reserved')).toBe(
      false,
    );
    expect(live(render({ reserveSpace: true })).classList.contains('status-line-reserved')).toBe(
      true,
    );
  });
});
