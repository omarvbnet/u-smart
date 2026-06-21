/** Run work after the browser is idle — keeps UI responsive during heavy batches. */
export function runWhenIdle(fn: () => void): void {
  if (typeof window === 'undefined') {
    fn();
    return;
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 2000 });
  } else {
    window.setTimeout(fn, 16);
  }
}
