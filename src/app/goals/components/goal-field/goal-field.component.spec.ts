import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GoalFieldComponent } from './goal-field.component';

@Component({
  selector: 'app-goal-field-host',
  imports: [GoalFieldComponent],
  template: `
    <app-goal-field
      label="Kalorien"
      unit="kcal"
      [value]="value"
      [validationError]="validationError"
      [canSave]="canSave"
      [saveState]="saveState"
      [saveErrorMessage]="saveErrorMessage"
      (valueChange)="onValueChange($event)"
      (save)="onSave()"
    />
  `,
})
class HostComponent {
  value = '2200';
  validationError: string | null = null;
  canSave = true;
  saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  saveErrorMessage: string | null = null;
  onValueChange = vi.fn();
  onSave = vi.fn();
}

describe('GoalFieldComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('renders the label, unit and current value', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-label').textContent).toContain(
      'Kalorien-Ziel (kcal)',
    );
    expect(fixture.nativeElement.querySelector('.field-input').value).toBe('2200');
  });

  it('uses inputmode="decimal" for the numeric keyboard', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-input').getAttribute('inputmode')).toBe(
      'decimal',
    );
  });

  it('emits valueChange on input', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.field-input') as HTMLInputElement;
    input.value = '2300';
    input.dispatchEvent(new Event('input'));

    expect(fixture.componentInstance.onValueChange).toHaveBeenCalledWith('2300');
  });

  it('save button is disabled when canSave is false and does not emit on click', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.canSave = false;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.save-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    button.click();
    expect(fixture.componentInstance.onSave).not.toHaveBeenCalled();
  });

  it('save button emits save when canSave is true', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.save-button').click();
    expect(fixture.componentInstance.onSave).toHaveBeenCalledTimes(1);
  });

  it('does not show the validation error before the field was touched (blurred)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.validationError = 'Bitte einen Wert eingeben.';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-error')).toBeNull();
  });

  it('shows the validation error after blur', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.validationError = 'Bitte einen Wert eingeben.';
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.field-input') as HTMLInputElement;
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-error').textContent).toContain(
      'Bitte einen Wert eingeben.',
    );
  });

  it('shows the save error regardless of touched state, never together with success', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.saveState = 'error';
    fixture.componentInstance.saveErrorMessage = 'Ziel konnte nicht gespeichert werden.';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-error').textContent).toContain(
      'Ziel konnte nicht gespeichert werden.',
    );
    expect(fixture.nativeElement.querySelector('.field-success')).toBeNull();
  });

  it('shows the success feedback when saved and there is no error', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.saveState = 'saved';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-success').textContent).toContain(
      'Gespeichert',
    );
    expect(fixture.nativeElement.querySelector('.field-error')).toBeNull();
  });
});
