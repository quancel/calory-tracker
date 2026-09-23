import { TestBed } from '@angular/core/testing';
import { CopyFeedbackComponent } from './copy-feedback.component';

describe('CopyFeedbackComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CopyFeedbackComponent],
    }).compileComponents();
  });

  function setup(view: { sourceDateLabel: string; count: number }) {
    const fixture = TestBed.createComponent(CopyFeedbackComponent);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the count and source date label', () => {
    const fixture = setup({ sourceDateLabel: 'Gestern', count: 5 });

    expect(fixture.nativeElement.querySelector('.feedback-text')?.textContent).toContain(
      '5 Einträge von Gestern übernommen',
    );
  });

  it('emits undoRequested when "Rückgängig machen" is clicked (does not delete itself)', () => {
    const fixture = setup({ sourceDateLabel: 'Gestern', count: 2 });
    const emitted = vi.fn();
    fixture.componentInstance.undoRequested.subscribe(emitted);

    fixture.nativeElement.querySelector('.undo-button').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('emits closed when the "x" close affordance is clicked', () => {
    const fixture = setup({ sourceDateLabel: 'Gestern', count: 2 });
    const emitted = vi.fn();
    fixture.componentInstance.closed.subscribe(emitted);

    fixture.nativeElement.querySelector('.close-button').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('has an accessible label on the close affordance', () => {
    const fixture = setup({ sourceDateLabel: 'Gestern', count: 2 });

    expect(fixture.nativeElement.querySelector('.close-button').getAttribute('aria-label')).toBe(
      'Rückmeldung schließen',
    );
  });
});
