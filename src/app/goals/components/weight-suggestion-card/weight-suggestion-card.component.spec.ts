import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CalorieSuggestionResult } from '../../models/weight.model';
import { WeightSuggestionCardComponent } from './weight-suggestion-card.component';

@Component({
  selector: 'app-weight-suggestion-card-host',
  imports: [WeightSuggestionCardComponent],
  template: `
    <app-weight-suggestion-card [result]="result" (adopt)="onAdopt()" (dismiss)="onDismiss()" />
  `,
})
class HostComponent {
  result!: CalorieSuggestionResult;
  onAdopt = vi.fn();
  onDismiss = vi.fn();
}

describe('WeightSuggestionCardComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('shows the "kein Zielgewicht gesetzt" hint without actions for "no-target"', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.result = 'no-target';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hint-text').textContent).toContain(
      'Setze ein Zielgewicht, um einen Vorschlag zu erhalten.',
    );
    expect(fixture.nativeElement.querySelector('.suggestion-card')).toBeNull();
  });

  it('shows the "zu wenig Messpunkte" hint without actions for "insufficient"', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.result = 'insufficient';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hint-text').textContent).toContain(
      'Noch zu wenig Gewichtseinträge für einen Vorschlag.',
    );
    expect(fixture.nativeElement.querySelector('.suggestion-card')).toBeNull();
  });

  it('shows the observational card text with both actions for a normal suggestion', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.result = { kind: 'suggestion', kcal: 1850, holding: false };
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.suggestion-card');
    expect(card.textContent).toContain('Basierend auf deinem Gewichtsverlauf: 1850 kcal.');
    expect(fixture.nativeElement.querySelector('.adopt-button').textContent).toContain(
      'Übernehmen',
    );
    expect(fixture.nativeElement.querySelector('.dismiss-button').textContent).toContain(
      'Verwerfen',
    );
  });

  it('shows the holding-state text with the same actions and card styling for holding: true', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.result = { kind: 'suggestion', kcal: 2400, holding: true };
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.suggestion-card');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Dein Gewicht ist stabil. So bleibt es: 2400 kcal.');
    expect(fixture.nativeElement.querySelector('.adopt-button')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.dismiss-button')).toBeTruthy();
  });

  it('emits adopt on button click', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.result = { kind: 'suggestion', kcal: 1850, holding: false };
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.adopt-button').click();
    expect(fixture.componentInstance.onAdopt).toHaveBeenCalledTimes(1);
  });

  it('fades the card out before emitting dismiss (design-conventions.md „Verwerfen"-Fade, --duration-base)', () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.result = { kind: 'suggestion', kcal: 1850, holding: false };
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.dismiss-button').click();
      fixture.detectChanges();

      // Sofort nach dem Klick: noch nicht emittiert, aber optisch am Ausblenden.
      expect(fixture.componentInstance.onDismiss).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.suggestion-card-closing')).toBeTruthy();

      vi.advanceTimersByTime(180);
      expect(fixture.componentInstance.onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
