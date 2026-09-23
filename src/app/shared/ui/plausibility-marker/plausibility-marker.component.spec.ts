import { TestBed } from '@angular/core/testing';
import { PlausibilityMarkerComponent } from './plausibility-marker.component';

describe('PlausibilityMarkerComponent', () => {
  it('renders nothing when marker is null', async () => {
    const fixture = TestBed.createComponent(PlausibilityMarkerComponent);
    fixture.componentRef.setInput('marker', null);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.querySelector('span')).toBeNull();
  });

  it('renders a non-interactive span by default (interactive=false)', async () => {
    const fixture = TestBed.createComponent(PlausibilityMarkerComponent);
    fixture.componentRef.setInput('marker', { kind: 'incomplete' });
    fixture.detectChanges();

    const span = fixture.nativeElement.querySelector('span.marker-icon-inline');
    expect(span).toBeTruthy();
    expect(span.getAttribute('aria-label')).toBe('Nährwerte unvollständig');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('renders an interactive button and emits "correct" on click when interactive=true', async () => {
    const fixture = TestBed.createComponent(PlausibilityMarkerComponent);
    fixture.componentRef.setInput('marker', { kind: 'implausible' });
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('ariaLabelSuffix', ' – Apfel bearbeiten');
    fixture.detectChanges();

    let emitted = false;
    fixture.componentInstance.correct.subscribe(() => (emitted = true));

    const button = fixture.nativeElement.querySelector('button.marker-button');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Nährwerte unplausibel – Apfel bearbeiten');
    expect(button.classList.contains('marker-button-warning')).toBe(true);

    button.click();

    expect(emitted).toBe(true);
  });
});
