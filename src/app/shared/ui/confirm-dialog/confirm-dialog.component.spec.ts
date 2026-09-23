import { TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    }).compileComponents();
  });

  function createFixture(inputs: { title: string; description?: string }) {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentRef.setInput('title', inputs.title);
    if (inputs.description !== undefined) {
      fixture.componentRef.setInput('description', inputs.description);
    }
    return fixture;
  }

  it('renders role=alertdialog with the given title and default button labels', () => {
    const fixture = createFixture({ title: 'Eintrag löschen?' });
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.dialog-panel');
    expect(panel.getAttribute('role')).toBe('alertdialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(fixture.nativeElement.querySelector('.dialog-title').textContent).toBe(
      'Eintrag löschen?',
    );
    expect(fixture.nativeElement.querySelector('.cancel-button').textContent.trim()).toBe(
      'Abbrechen',
    );
    expect(fixture.nativeElement.querySelector('.confirm-button').textContent.trim()).toBe(
      'Bestätigen',
    );
  });

  it('sets initial focus on the cancel button, not the destructive action', () => {
    const fixture = createFixture({ title: 'Eintrag löschen?' });
    fixture.detectChanges();

    const cancelButton = fixture.nativeElement.querySelector('.cancel-button');
    expect(fixture.nativeElement.ownerDocument.activeElement).toBe(cancelButton);
  });

  it('returns focus to the triggering element on destroy', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const fixture = createFixture({ title: 'Eintrag löschen?' });
    fixture.detectChanges();
    fixture.destroy();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('emits cancel on backdrop click and on the cancel button', () => {
    const fixture = createFixture({ title: 'Eintrag löschen?' });
    fixture.detectChanges();
    const cancelSpy = vi.fn();
    fixture.componentInstance.cancel.subscribe(cancelSpy);

    fixture.nativeElement.querySelector('.backdrop').click();
    fixture.nativeElement.querySelector('.cancel-button').click();

    expect(cancelSpy).toHaveBeenCalledTimes(2);
  });

  it('emits cancel on Escape', () => {
    const fixture = createFixture({ title: 'Eintrag löschen?' });
    fixture.detectChanges();
    const cancelSpy = vi.fn();
    fixture.componentInstance.cancel.subscribe(cancelSpy);

    fixture.nativeElement
      .querySelector('.dialog-panel')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('emits confirm on the confirm button', () => {
    const fixture = createFixture({ title: 'Eintrag löschen?' });
    fixture.detectChanges();
    const confirmSpy = vi.fn();
    fixture.componentInstance.confirm.subscribe(confirmSpy);

    fixture.nativeElement.querySelector('.confirm-button').click();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('renders an optional description with aria-describedby wired up', () => {
    const fixture = createFixture({
      title: 'Eintrag löschen?',
      description: 'Dieser Vorgang kann nicht rückgängig gemacht werden.',
    });
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.dialog-panel');
    const description = fixture.nativeElement.querySelector('.dialog-description');
    expect(description.textContent).toBe('Dieser Vorgang kann nicht rückgängig gemacht werden.');
    expect(panel.getAttribute('aria-describedby')).toBe('confirm-dialog-description');
  });

  it('omits aria-describedby without a description', () => {
    const fixture = createFixture({ title: 'Eintrag löschen?' });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.dialog-panel').hasAttribute('aria-describedby'),
    ).toBe(false);
  });
});
