import { createWebExtensionAdapter, type BrowserAdapter, type ExtensionApi } from './browser-adapter.ts';

/** Chrome MV3: namespace `chrome` con promesas; atajos configurables en chrome://extensions/shortcuts. */
export function createChromeAdapter(scope: typeof globalThis = globalThis): BrowserAdapter {
  const api = (scope as unknown as { chrome?: ExtensionApi }).chrome;
  if (!api?.runtime) throw new Error('WebExtensions API no disponible');
  return createWebExtensionAdapter({ target: 'chrome', api, shortcutSettingsUrl: 'chrome://extensions/shortcuts' });
}
