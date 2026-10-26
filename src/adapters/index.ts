import type { BrowserAdapter } from './browser-adapter.ts';
import { createChromeAdapter } from './chrome-adapter.ts';
import { createSafariAdapter } from './safari-adapter.ts';

/** __TARGET__ es una constante de compilación: cada build solo incluye su adaptador. */
export function getAdapter(): BrowserAdapter {
  return __TARGET__ === 'safari' ? createSafariAdapter() : createChromeAdapter();
}

export type { BrowserAdapter, TabRef, FrameResult } from './browser-adapter.ts';
