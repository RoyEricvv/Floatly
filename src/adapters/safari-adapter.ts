import { createWebExtensionAdapter, type BrowserAdapter, type ExtensionApi } from './browser-adapter.ts';

/**
 * Safari: se prefiere el namespace `browser` (nativo con promesas). Safari no
 * ofrece una pantalla para reasignar atajos de extensiones, así que solo se usa
 * el atajo sugerido del manifest.
 */
export function createSafariAdapter(scope: typeof globalThis = globalThis): BrowserAdapter {
  const g = scope as unknown as { browser?: ExtensionApi; chrome?: ExtensionApi };
  const api = g.browser ?? g.chrome;
  if (!api) throw new Error('WebExtensions API no disponible');
  return createWebExtensionAdapter({ target: 'safari', api, shortcutSettingsUrl: null });
}
