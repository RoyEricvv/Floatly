import { describe, expect, it, vi } from 'vitest';
import { CONTENT_SCRIPT_FILE, type ExtensionApi } from '../../src/adapters/browser-adapter.ts';
import { createChromeAdapter } from '../../src/adapters/chrome-adapter.ts';
import { createSafariAdapter } from '../../src/adapters/safari-adapter.ts';
import { ErrorCode } from '../../src/utils/errors.ts';

function fakeApi(over: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = {};
  const api = {
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 7, windowId: 2 }]),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    windows: { update: vi.fn().mockResolvedValue({}) },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ frameId: 0, result: 'r0' }, { frameId: 3, result: 'r3' }]) },
    action: { setBadgeText: vi.fn().mockResolvedValue(undefined), setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined) },
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined), onMessage: { addListener: vi.fn() } },
    commands: {
      onCommand: { addListener: vi.fn() },
      getAll: vi.fn().mockResolvedValue([{ name: 'toggle-pip', shortcut: '⌥⇧P' }]),
    },
    storage: {
      session: {
        get: vi.fn(async (k: string) => ({ [k]: store[k] })),
        set: vi.fn(async (o: Record<string, unknown>) => Object.assign(store, o)),
        remove: vi.fn(async (k: string) => void delete store[k]),
      },
    },
    ...over,
  };
  return api as typeof api & ExtensionApi;
}

describe('adaptador Safari', () => {
  it('prefiere el namespace browser sobre chrome', () => {
    const browserApi = fakeApi();
    const chromeApi = fakeApi();
    const adapter = createSafariAdapter({ browser: browserApi, chrome: chromeApi } as never);
    void adapter.getActiveTab();
    expect(browserApi.tabs.query).toHaveBeenCalled();
    expect(chromeApi.tabs.query).not.toHaveBeenCalled();
    expect(adapter.target).toBe('safari');
  });

  it('usa chrome si browser no existe y no ofrece pantalla de atajos', () => {
    const adapter = createSafariAdapter({ chrome: fakeApi() } as never);
    expect(adapter.shortcuts.configurable).toBe(false);
  });

  it('falla de forma explícita sin API de extensiones', () => {
    expect(() => createSafariAdapter({} as never)).toThrow();
  });
});

describe('adaptador Chrome', () => {
  it('atajos configurables en chrome://extensions/shortcuts', async () => {
    const api = fakeApi();
    const adapter = createChromeAdapter({ chrome: api } as never);
    expect(adapter.shortcuts.configurable).toBe(true);
    await adapter.shortcuts.open();
    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
    await expect(adapter.shortcuts.get('toggle-pip')).resolves.toBe('⌥⇧P');
  });
});

describe('comportamiento común de los adaptadores', () => {
  const adapters = {
    safari: (api: ExtensionApi) => createSafariAdapter({ browser: api } as never),
    chrome: (api: ExtensionApi) => createChromeAdapter({ chrome: api } as never),
  };

  for (const [name, create] of Object.entries(adapters)) {
    describe(name, () => {
      it('getActiveTab', async () => {
        await expect(create(fakeApi()).getActiveTab()).resolves.toEqual({ id: 7, windowId: 2 });
      });

      it('inyecta el content script en todos los frames', async () => {
        const api = fakeApi();
        await create(api).injectContentScript(7);
        expect(api.scripting.executeScript).toHaveBeenCalledWith({
          target: { tabId: 7, allFrames: true },
          files: [CONTENT_SCRIPT_FILE],
        });
      });

      it('páginas no accesibles → PAGE_NOT_ACCESSIBLE', async () => {
        const api = fakeApi();
        api.scripting.executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));
        await expect(create(api).injectContentScript(7)).rejects.toMatchObject({ code: ErrorCode.PageNotAccessible });
      });

      it('runInFrames apunta a frames concretos y devuelve resultados por frame', async () => {
        const api = fakeApi();
        const fn = (a: number) => a;
        const results = await create(api).runInFrames(7, [3], fn, [1]);
        expect(api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7, frameIds: [3] }, func: fn, args: [1] });
        expect(results).toEqual([
          { frameId: 0, result: 'r0' },
          { frameId: 3, result: 'r3' },
        ]);
      });

      it('badge PiP por pestaña', async () => {
        const api = fakeApi();
        const adapter = create(api);
        await adapter.setPipBadge(7, true);
        await adapter.setPipBadge(7, false);
        expect(api.action.setBadgeText).toHaveBeenNthCalledWith(1, { tabId: 7, text: 'PiP' });
        expect(api.action.setBadgeText).toHaveBeenNthCalledWith(2, { tabId: 7, text: '' });
      });

      it('focusTab activa la pestaña y su ventana', async () => {
        const api = fakeApi();
        await create(api).focusTab({ id: 7, windowId: 2 });
        expect(api.tabs.update).toHaveBeenCalledWith(7, { active: true });
        expect(api.windows.update).toHaveBeenCalledWith(2, { focused: true });
      });

      it('almacenamiento de sesión, con respaldo en memoria si storage.session no existe', async () => {
        for (const api of [fakeApi(), fakeApi({ storage: undefined })]) {
          const { session } = create(api);
          await session.set('k', { a: 1 });
          await expect(session.get('k')).resolves.toEqual({ a: 1 });
          await session.remove('k');
          await expect(session.get('k')).resolves.toBeUndefined();
        }
      });

      it('sendMessage no lanza si no hay receptor', async () => {
        const api = fakeApi();
        api.runtime.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
        await expect(create(api).sendMessage({ type: 'pip-state', active: true })).resolves.toBeUndefined();
      });
    });
  }
});
