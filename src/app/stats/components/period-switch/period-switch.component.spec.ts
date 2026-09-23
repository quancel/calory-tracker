import { TestBed } from '@angular/core/testing';
import { PeriodSwitchComponent } from './period-switch.component';

describe('PeriodSwitchComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodSwitchComponent],
    }).compileComponents();
  });

  function setup(kind: 'week' | 'month') {
    const fixture = TestBed.createComponent(PeriodSwitchComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return fixture;
  }

  it('marks the active tab and reflects it via aria-selected', () => {
    const fixture = setup('week');
    const tabs = fixture.nativeElement.querySelectorAll('.segment-tab');

    expect(tabs[0].classList.contains('segment-tab-active')).toBe(true);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].classList.contains('segment-tab-active')).toBe(false);
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('emits kindChange when a different tab is selected', () => {
    const fixture = setup('week');
    const emitted = vi.fn();
    fixture.componentInstance.kindChange.subscribe(emitted);

    fixture.nativeElement.querySelectorAll('.segment-tab')[1].click();

    expect(emitted).toHaveBeenCalledWith('month');
  });

  it('does not emit when the already-active tab is tapped again', () => {
    const fixture = setup('week');
    const emitted = vi.fn();
    fixture.componentInstance.kindChange.subscribe(emitted);

    fixture.nativeElement.querySelectorAll('.segment-tab')[0].click();

    expect(emitted).not.toHaveBeenCalled();
  });
});
