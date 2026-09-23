import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BottomSheetComponent } from './bottom-sheet.component';

@Component({
  selector: 'app-host',
  imports: [BottomSheetComponent],
  template: `
    <app-bottom-sheet ariaLabelledby="host-title" (close)="onClose()">
      <h2 id="host-title">Titel</h2>
      <button type="button">Feld</button>
      <input type="text" />
    </app-bottom-sheet>
  `,
})
class HostComponent {
  closed = false;
  onClose(): void {
    this.closed = true;
  }
}

describe('BottomSheetComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders backdrop, drag-handle, close-button and projected content', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.backdrop')).toBeTruthy();
    expect(el.querySelector('.drag-handle')).toBeTruthy();
    expect(el.querySelector('.close-button')).toBeTruthy();
    expect(el.querySelector('#host-title')?.textContent).toBe('Titel');
  });

  it('emits close on backdrop click', () => {
    const fixture = setup();
    fixture.nativeElement.querySelector('.backdrop').click();

    expect(fixture.componentInstance.closed).toBe(true);
  });

  it('emits close on close-button click', () => {
    const fixture = setup();
    fixture.nativeElement.querySelector('.close-button').click();

    expect(fixture.componentInstance.closed).toBe(true);
  });

  it('emits close on Escape (Fokusfalle-Handler)', () => {
    const fixture = setup();
    const panel = fixture.nativeElement.querySelector('.sheet-panel');

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(fixture.componentInstance.closed).toBe(true);
  });

  it('traps Tab focus within the panel', () => {
    const fixture = setup();
    const panel = fixture.nativeElement.querySelector('.sheet-panel') as HTMLElement;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    const last = focusable[focusable.length - 1];
    last.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    panel.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
