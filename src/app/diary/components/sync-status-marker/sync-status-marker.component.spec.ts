import { TestBed } from '@angular/core/testing';
import { SyncStatusMarkerComponent } from './sync-status-marker.component';

describe('SyncStatusMarkerComponent (design-conventions.md „Sync-Status-Marker")', () => {
  it('shows an aria-label for the pending state', () => {
    const fixture = TestBed.createComponent(SyncStatusMarkerComponent);
    fixture.componentRef.setInput('state', 'pending');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-label')).toBe('Wartet auf Synchronisierung');
  });

  it('shows a distinct aria-label for the failed state (not distinguished by color alone)', () => {
    const fixture = TestBed.createComponent(SyncStatusMarkerComponent);
    fixture.componentRef.setInput('state', 'failed');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-label')).toBe('Synchronisierung fehlgeschlagen');
  });

  it('appends ariaLabelSuffix', () => {
    const fixture = TestBed.createComponent(SyncStatusMarkerComponent);
    fixture.componentRef.setInput('state', 'pending');
    fixture.componentRef.setInput('ariaLabelSuffix', ' – Apfel');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-label')).toBe('Wartet auf Synchronisierung – Apfel');
  });

  it('emits toggled on click', () => {
    const fixture = TestBed.createComponent(SyncStatusMarkerComponent);
    fixture.componentRef.setInput('state', 'pending');
    fixture.detectChanges();
    let emitted = false;
    fixture.componentInstance.toggled.subscribe(() => (emitted = true));

    fixture.nativeElement.querySelector('button').click();

    expect(emitted).toBe(true);
  });
});
