import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WeightStore } from '../../weight.store';
import { WeightEntrySheetComponent } from './weight-entry-sheet.component';

describe('WeightEntrySheetComponent', () => {
  let storeStub: {
    weightInput: ReturnType<typeof signal>;
    weightValidation: ReturnType<typeof signal>;
    canSubmit: ReturnType<typeof signal>;
    saving: ReturnType<typeof signal>;
    submitError: ReturnType<typeof signal>;
    pendingReplace: ReturnType<typeof signal>;
    setWeightInput: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
    closeSheet: ReturnType<typeof vi.fn>;
    confirmReplace: ReturnType<typeof vi.fn>;
    cancelReplace: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    storeStub = {
      weightInput: signal(''),
      weightValidation: signal({ valid: false, error: 'Bitte ein Gewicht eingeben.' }),
      canSubmit: signal(false),
      saving: signal(false),
      submitError: signal<string | null>(null),
      pendingReplace: signal<{ existingWeightKg: number; newWeightKg: number } | null>(null),
      setWeightInput: vi.fn(),
      submit: vi.fn().mockResolvedValue(undefined),
      closeSheet: vi.fn(),
      confirmReplace: vi.fn().mockResolvedValue(undefined),
      cancelReplace: vi.fn(),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [WeightEntrySheetComponent],
      providers: [{ provide: WeightStore, useValue: storeStub }],
    });
  });

  it('disables the submit button while the input is invalid', () => {
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.submit-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('forwards input changes to the store', () => {
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.field-input') as HTMLInputElement;
    input.value = '80,5';
    input.dispatchEvent(new Event('input'));

    expect(storeStub.setWeightInput).toHaveBeenCalledWith('80,5');
  });

  it('calls submit() on form submit', () => {
    storeStub.canSubmit.set(true);
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    // jsdom implementiert `HTMLFormElement.requestSubmit()` nicht (das ein
    // Button-`click()` bei `type="submit"` auslöst) — das `submit`-Event
    // direkt zu dispatchen ist die dokumentierte Umgehung und prüft
    // denselben `(ngSubmit)`-Pfad.
    const form = fixture.nativeElement.querySelector('.sheet-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(storeStub.submit).toHaveBeenCalledTimes(1);
  });

  it('does not show the validation error before the field was touched (blurred)', () => {
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-error')).toBeNull();
  });

  it('shows the validation error after blur', () => {
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.field-input') as HTMLInputElement;
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-error').textContent).toContain(
      'Bitte ein Gewicht eingeben.',
    );
  });

  it('shows the replace confirmation dialog with old/new value and confirms via the store', () => {
    storeStub.pendingReplace.set({ existingWeightKg: 72.4, newWeightKg: 72.1 });
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('app-confirm-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('Gewicht für heute ersetzen?');
    expect(dialog.textContent).toContain('72,4 kg wird durch 72,1 kg ersetzt.');

    fixture.nativeElement.querySelector('.confirm-button').click();
    expect(storeStub.confirmReplace).toHaveBeenCalledTimes(1);
  });

  it('cancelling the replace dialog calls cancelReplace()', () => {
    storeStub.pendingReplace.set({ existingWeightKg: 72.4, newWeightKg: 72.1 });
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.cancel-button').click();
    expect(storeStub.cancelReplace).toHaveBeenCalledTimes(1);
  });

  it('closing the sheet calls closeSheet()', () => {
    const fixture = TestBed.createComponent(WeightEntrySheetComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.close-button').click();
    expect(storeStub.closeSheet).toHaveBeenCalledTimes(1);
  });
});
