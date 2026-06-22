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

/** Yield one animation frame so the browser can paint and handle input. */
export function yieldToMain(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

const FRAME_BUDGET_MS = 8;

/** Return a fresh timestamp after yielding when the current frame budget is exceeded. */
export async function yieldIfBusy(frameStartMs: number, budgetMs = FRAME_BUDGET_MS): Promise<number> {
  if (typeof performance === 'undefined' || performance.now() - frameStartMs < budgetMs) {
    return frameStartMs;
  }
  await yieldToMain();
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

/** Run an async task after idle, without blocking the click handler. */
export function runAsyncWhenIdle<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return fn();
  return new Promise((resolve, reject) => {
    runWhenIdle(() => {
      fn().then(resolve, reject);
    });
  });
}
