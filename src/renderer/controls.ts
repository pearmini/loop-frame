const error = required<HTMLElement>('#error');
const bar = required<HTMLElement>('#bar');
const label = required<HTMLElement>('#label');
const position = required<HTMLElement>('#position');
const remaining = required<HTMLElement>('#remaining');
const pause = required<HTMLButtonElement>('#pause');
const previous = required<HTMLButtonElement>('#previous');
const next = required<HTMLButtonElement>('#next');
const exit = required<HTMLButtonElement>('#exit');

let paused = false;

previous.addEventListener('click', () => window.loopframeControls.command('previous'));
next.addEventListener('click', () => window.loopframeControls.command('next'));
exit.addEventListener('click', () => window.loopframeControls.command('exit'));
pause.addEventListener('click', () => window.loopframeControls.command(paused ? 'resume' : 'pause'));

window.loopframeControls.onState((state) => {
  paused = state.paused;
  error.hidden = !state.error;
  error.textContent = state.error ?? '';
  bar.hidden = !state.chromeVisible;
  label.textContent = state.label;
  position.textContent = state.position;
  remaining.textContent = state.remainingLabel;
  pause.textContent = state.paused ? 'Resume' : 'Pause';
});

function required<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element as T;
}
