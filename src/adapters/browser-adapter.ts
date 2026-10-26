import type { RuntimeMessage } from '../shared/types.ts';
import { ErrorCode, ExtensionError } from '../utils/errors.ts';

/** Namespace WebExtensions. Safari expone `browser` (y `chrome`); Chrome expone `chrome`. Ambos con promesas en MV3. */
export type ExtensionApi = typeof chrome;

export type BrowserTarget = 'safari' | 'chrome';

export const CONTENT_SCRIPT_FILE = 'content.js';

export interface TabRef {
  id: number;
  windowId?: number;
}

export interface FrameResult<R> {
  frameId: number;
  result: R | undefined;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Único punto de contacto con las APIs de extensión. El código de core/ no las usa. */
export interface BrowserAdapter {
  readonly target: BrowserTarget;
  getActiveTab(): Promise<TabRef | null>;
  injectContentScript(tabId: number): Promise<void>;
  runInFrames<A extends unknown[], R>(
    tabId: number,
    frames: readonly number[] | 'all',
    func: (...args: A) => R,
    args: A,
  ): Promise<FrameResult<Awaited<R>>[]>;
  focusTab(tab: TabRef): Promise<void>;
  setPipBadge(tabId: number, active: boolean): Promise<void>;
  readonly session: KeyValueStore;
  sendMessage(message: RuntimeMessage): Promise<void>;
  onMessage(listener: (message: RuntimeMessage, sender: { tabId?: number; frameId?: number; windowId?: number }) => void): void;
  onCommand(listener: (command: string, tab: TabRef | null) => void): void;
  onTabGone(listener: (tabId: number) => void): void;
  readonly shortcuts: { configurable: boolean; open(): Promise<void>; get(command: string): Promise<string | null> };
}

export interface AdapterOptions {
  target: BrowserTarget;
  api: ExtensionApi;
  /** Página de configuración de atajos, si el navegador tiene una. */
  shortcutSettingsUrl: string | null;
}

function toTabRef(tab: chrome.tabs.Tab | undefined): TabRef | null {
  return tab?.id !== undefined && tab.id >= 0 ? { id: tab.id, windowId: tab.windowId } : null;
}

/** Errores de inyección (chrome://, App Store, páginas sin permiso) -> PAGE_NOT_ACCESSIBLE. */
export function mapInjectionError(error: unknown): ExtensionError {
  const detail = error instanceof Error ? error.message : String(error);
  return new ExtensionError(ErrorCode.PageNotAccessible, detail);
}

function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    set: async (key, value) => void map.set(key, value),
    remove: async (key) => void map.delete(key),
  };
}

function sessionStore(api: ExtensionApi): KeyValueStore {
  // storage.session sobrevive a la suspensión del service worker y se borra al cerrar el navegador.
  const area = api.storage?.session;
  if (!area) return memoryStore();
  return {
    get: async <T>(key: string) => (await area.get(key))[key] as T | undefined,
    set: (key, value) => area.set({ [key]: value }),
    remove: (key) => area.remove(key),
  };
}

export function createWebExtensionAdapter({ target, api, shortcutSettingsUrl }: AdapterOptions): BrowserAdapter {
  return {
    target,

    async getActiveTab() {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      return toTabRef(tab);
    },

    async injectContentScript(tabId) {
      try {
        await api.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT_FILE] });
      } catch (error) {
        throw mapInjectionError(error);
      }
    },

    async runInFrames(tabId, frames, func, args) {
      const targetSpec: chrome.scripting.InjectionTarget =
        frames === 'all' ? { tabId, allFrames: true } : { tabId, frameIds: [...frames] };
      let results: chrome.scripting.InjectionResult<unknown>[];
      try {
        results = await api.scripting.executeScript({
          target: targetSpec,
          func: func as (...a: unknown[]) => unknown,
          args: args as unknown[],
        });
      } catch (error) {
        throw mapInjectionError(error);
      }
      return (results ?? []).map((r) => ({ frameId: r.frameId ?? 0, result: r.result as never }));
    },

    async focusTab(tab) {
      await api.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined) await api.windows.update(tab.windowId, { focused: true });
    },

    async setPipBadge(tabId, active) {
      try {
        await api.action.setBadgeText({ tabId, text: active ? 'PiP' : '' });
        if (active) await api.action.setBadgeBackgroundColor({ tabId, color: '#2f6fed' });
      } catch {
        // La pestaña pudo cerrarse; el badge es decorativo.
      }
    },

    session: sessionStore(api),

    async sendMessage(message) {
      try {
        await api.runtime.sendMessage(message);
      } catch {
        // Sin receptor (background suspendido o recargado): no es crítico.
      }
    },

    onMessage(listener) {
      api.runtime.onMessage.addListener((message: RuntimeMessage, sender: chrome.runtime.MessageSender) => {
        listener(message, { tabId: sender.tab?.id, frameId: sender.frameId, windowId: sender.tab?.windowId });
        return false;
      });
    },

    onCommand(listener) {
      api.commands?.onCommand.addListener((command: string, tab?: chrome.tabs.Tab) => listener(command, toTabRef(tab)));
    },

    onTabGone(listener) {
      api.tabs.onRemoved.addListener((tabId) => listener(tabId));
      api.tabs.onUpdated.addListener((tabId, info) => {
        if (info.status === 'loading') listener(tabId);
      });
    },

    shortcuts: {
      configurable: shortcutSettingsUrl !== null,
      async open() {
        if (shortcutSettingsUrl) await api.tabs.create({ url: shortcutSettingsUrl });
      },
      async get(command) {
        try {
          const all = (await api.commands?.getAll()) ?? [];
          return all.find((c) => c.name === command)?.shortcut || null;
        } catch {
          return null;
        }
      },
    },
  };
}
