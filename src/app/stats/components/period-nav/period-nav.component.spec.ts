import { TestBed } from '@angular/core/testing';
import { PeriodNavComponent } from './period-nav.component';

describe('PeriodNavComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeriodNavComponent] }).compileComponents();
  });

  function setup(label: string, canGoForward: boolean) {
    const fixture = TestBed.createComponent(PeriodNavComponent);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('canGoForward', canGoForward);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the given period label', () => {
    const fixture = setup('15.–21. Sep.', true);
    expect(fixture.nativeElement.querySelector('.label').textContent).toContain('15.–21. Sep.');
  });

  it('emits previous regardless of canGoForward', () => {
    const fixture = setup('September 2026', false);
    const emitted = vi.fn();
    fixture.componentInstance.previous.subscribe(emitted);

    fixture.nativeElement.querySelector('[aria-label="Vorherige Periode"]').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('disables the forward chevron and does not emit next when canGoForward is false', () => {
    const fixture = setup('September 2026', false);
    const emitted = vi.fn();
    fixture.componentInstance.next.subscribe(emitted);

    const nextButton = fixture.nativeElement.querySelector(
      '[aria-label="Nächste Periode"]',
    ) as HTMLButtonElement;

    expect(nextButton.disabled).toBe(true);
    expect(nextButton.getAttribute('aria-disabled')).toBe('true');

    nextButton.click();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('emits next when the forward chevron is enabled', () => {
    const fixture = setup('September 2026', true);
    const emitted = vi.fn();
    fixture.componentInstance.next.subscribe(emitted);

    fixture.nativeElement.querySelector('[aria-label="Nächste Periode"]').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });
});
