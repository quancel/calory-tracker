import { TestBed } from '@angular/core/testing';
import { DateNavComponent } from './date-nav.component';

describe('DateNavComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DateNavComponent] }).compileComponents();
  });

  function setup(label: string, canGoForward: boolean) {
    const fixture = TestBed.createComponent(DateNavComponent);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('canGoForward', canGoForward);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the given label', () => {
    const fixture = setup('Heute', true);
    expect(fixture.nativeElement.querySelector('.label').textContent).toContain('Heute');
  });

  it('emits previous when the back chevron is clicked, regardless of canGoForward', () => {
    const fixture = setup('Heute', false);
    const emitted = vi.fn();
    fixture.componentInstance.previous.subscribe(emitted);

    fixture.nativeElement.querySelector('[aria-label="Vorheriger Tag"]').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('disables the forward chevron and does not emit next when canGoForward is false', () => {
    const fixture = setup('in 7 Tagen', false);
    const emitted = vi.fn();
    fixture.componentInstance.next.subscribe(emitted);

    const nextButton = fixture.nativeElement.querySelector(
      '[aria-label="Nächster Tag"]',
    ) as HTMLButtonElement;

    expect(nextButton.disabled).toBe(true);
    expect(nextButton.getAttribute('aria-disabled')).toBe('true');

    nextButton.click();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('emits next when the forward chevron is enabled', () => {
    const fixture = setup('Heute', true);
    const emitted = vi.fn();
    fixture.componentInstance.next.subscribe(emitted);

    fixture.nativeElement.querySelector('[aria-label="Nächster Tag"]').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });
});
