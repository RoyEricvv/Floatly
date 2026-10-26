import type { BrowserAdapter, TabRef } from '../adapters/index.ts';
import { invokeContent } from '../shared/content-bridge.ts';
import { collectTabVideos } from '../shared/frames.ts';
import type { PipSession } from '../shared/types.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('background');
const SESSION_KEY = 'pipSession';
export const TOGGLE_COMMAND = 'toggle-pip';

/**
 * Background mínimo (service worker en Chrome, página no persistente en Safari):
 * badge del icono, pestaña con PiP activo y atajo de teclado.
 */
export function startBackground(adapter: BrowserAdapter): void {
  adapter.onMessage((message, sender) => {
    if (message.type !== 'pip-state' || sender.tabId === undefined) return;
    const tabId = sender.tabId;
    void (async () => {
      await adapter.setPipBadge(tabId, message.active);
      if (message.active) {
        const session: PipSession = { tabId, frameId: sender.frameId ?? 0, windowId: sender.windowId };
        await adapter.session.set(SESSION_KEY, session);
      } else {
        const current = await adapter.session.get<PipSession>(SESSION_KEY);
        if (current?.tabId === tabId) await adapter.session.remove(SESSION_KEY);
      }
    })();
  });

  adapter.onTabGone((tabId) => {
    void (async () => {
      const current = await adapter.session.get<PipSession>(SESSION_KEY);
      if (current?.tabId === tabId) await adapter.session.remove(SESSION_KEY);
    })();
  });

  adapter.onCommand((command, tab) => {
    if (command !== TOGGLE_COMMAND) return;
    toggleFromShortcut(adapter, tab).catch((error: unknown) => log.warn('atajo de teclado', error));
  });
}

/** Si hay un PiP activo lo cierra; si no, abre el video principal de la pestaña activa. */
export async function toggleFromShortcut(adapter: BrowserAdapter, tab: TabRef | null): Promise<void> {
  const session = await adapter.session.get<PipSession>(SESSION_KEY);
  if (session) {
    try {
      await invokeContent(adapter, session.tabId, [session.frameId], 'exit');
      return;
    } catch {
      await adapter.session.remove(SESSION_KEY);
    }
  }
  const target = tab ?? (await adapter.getActiveTab());
  if (!target) return;
  await adapter.injectContentScript(target.id);
  const { ranked } = collectTabVideos(await invokeContent(adapter, target.id, 'all', 'report'));
  const primary = ranked[0];
  if (!primary) return;
  // Si el navegador no considera el atajo como gesto del usuario, el content script
  // muestra un botón sobre el video (ver content/overlay.ts).
  await invokeContent(adapter, target.id, [primary.frameId], 'enter', primary.id);
}
