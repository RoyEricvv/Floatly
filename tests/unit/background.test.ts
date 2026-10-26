import { describe, expect, it, vi } from 'vitest';
import type { BrowserAdapter } from '../../src/adapters/browser-adapter.ts';
import { startBackground, toggleFromShortcut } from '../../src/background/background-controller.ts';
import type { RuntimeMessage } from '../../src/shared/types.ts';

function fakeAdapter() {
  const store = new Map<string, unknown>();
  const listeners: {
    message?: (m: RuntimeMessage, s: { tabId?: number; frameId?: number; windowId?: number }) => void;
    command?: (c: string, t: { id: number } | null) => void;
    gone?: (id: number) => void;
  } = {};
  const adapter = {
    target: 'chrome',
    getActiveTab: vi.fn().mockResolvedValue({ id: 1 }),
    injectContentScript: vi.fn().mockResolvedValue(undefined),
    runInFrames: vi.fn(),
    focusTab: vi.fn(),
    setPipBadge: vi.fn().mockResolvedValue(undefined),
    session: {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
      remove: vi.fn(async (k: string) => void store.delete(k)),
    },
    sendMessage: vi.fn(),
    onMessage: (l: typeof listeners.message) => (listeners.message = l),
    onCommand: (l: typeof listeners.command) => (listeners.command = l),
    onTabGone: (l: typeof listeners.gone) => (listeners.gone = l),
    shortcuts: { configurable: true, open: vi.fn(), get: vi.fn() },
  };
  return { adapter: adapter as unknown as BrowserAdapter & typeof adapter, listeners, store };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('background', () => {
  it('guarda la pestaña con PiP activo, actualiza el badge y limpia al cerrar', async () => {
    const { adapter, listeners, store } = fakeAdapter();
    startBackground(adapter);
    listeners.message!({ type: 'pip-state', active: true }, { tabId: 4, frameId: 2, windowId: 9 });
    await tick();
    expect(adapter.setPipBadge).toHaveBeenCalledWith(4, true);
    expect(store.get('pipSession')).toEqual({ tabId: 4, frameId: 2, windowId: 9 });
    listeners.message!({ type: 'pip-state', active: false }, { tabId: 4, frameId: 2 });
    await tick();
    expect(store.has('pipSession')).toBe(false);
  });

  it('olvida la sesión si la pestaña se cierra o navega', async () => {
    const { adapter, listeners, store } = fakeAdapter();
    startBackground(adapter);
    store.set('pipSession', { tabId: 4, frameId: 0 });
    listeners.gone!(4);
    await tick();
    expect(store.has('pipSession')).toBe(false);
  });

  it('atajo: con PiP activo lo cierra', async () => {
    const { adapter, store } = fakeAdapter();
    store.set('pipSession', { tabId: 4, frameId: 2 });
    adapter.runInFrames.mockResolvedValue([{ frameId: 2, result: { ok: true } }]);
    await toggleFromShortcut(adapter, null);
    expect(adapter.runInFrames).toHaveBeenCalledTimes(1);
    expect(adapter.runInFrames.mock.calls[0]![3]).toEqual(['__videoFlotante', 'exit', []]);
  });

  it('atajo: sin PiP abre el video principal de la pestaña activa', async () => {
    const { adapter } = fakeAdapter();
    const v = { id: 3, width: 800, height: 450, visibleArea: 360_000, duration: 10, currentTime: 0, paused: false, muted: false, readyState: 4, pipDisabled: false, inPip: false };
    adapter.runInFrames
      .mockResolvedValueOnce([{ frameId: 0, result: { isTopFrame: true, capabilities: {}, videos: [v], pipVideoId: null } }])
      .mockResolvedValueOnce([{ frameId: 0, result: { ok: true, value: 'standard' } }]);
    await toggleFromShortcut(adapter, { id: 1 });
    expect(adapter.injectContentScript).toHaveBeenCalledWith(1);
    expect(adapter.runInFrames.mock.calls[1]![2]).toBeTypeOf('function');
    expect(adapter.runInFrames.mock.calls[1]![1]).toEqual([0]);
    expect(adapter.runInFrames.mock.calls[1]![3]).toEqual(['__videoFlotante', 'enter', [3]]);
  });
});
