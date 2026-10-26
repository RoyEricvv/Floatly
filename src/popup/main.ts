import { getAdapter, type TabRef } from '../adapters/index.ts';
import { hasAnyPipSupport } from '../core/capabilities.ts';
import { TOGGLE_COMMAND } from '../background/background-controller.ts';
import { invokeContent, isActionResult, unknownResult } from '../shared/content-bridge.ts';
import { collectTabVideos, type FrameVideo, type TabVideos } from '../shared/frames.ts';
import type { ActionResult, PipSession } from '../shared/types.ts';
import { ErrorCode, ExtensionError, messageFor, serializeError } from '../utils/errors.ts';
import { formatTime } from '../utils/format.ts';

const adapter = getAdapter();
const REFRESH_MS = 1000;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const ui = {
  pipState: $('pip-state'),
  otherTab: $('other-tab'),
  goOther: $<HTMLButtonElement>('go-other'),
  statusText: $('status-text'),
  statusMeta: $('status-meta'),
  pickerWrap: $('picker-wrap'),
  picker: $<HTMLSelectElement>('picker'),
  toggle: $<HTMLButtonElement>('toggle'),
  play: $<HTMLButtonElement>('play'),
  reveal: $<HTMLButtonElement>('reveal'),
  message: $('message'),
  caps: $('caps'),
  shortcut: $('shortcut'),
  shortcutConfig: $<HTMLButtonElement>('shortcut-config'),
};

let tab: TabRef | null = null;
let state: TabVideos = { ranked: [], pip: null, capabilities: null };
let selectedKey: string | null = null;
let otherSession: PipSession | null = null;

function showMessage(text: string | null, kind: 'error' | 'info' = 'error'): void {
  ui.message.hidden = !text;
  ui.message.textContent = text ?? '';
  ui.message.dataset.kind = kind;
}

function selectedVideo(): FrameVideo | null {
  return state.ranked.find((v) => v.key === selectedKey) ?? state.pip ?? state.ranked[0] ?? null;
}

function describe(v: FrameVideo): string {
  const time = v.duration === null ? formatTime(null) : `${formatTime(v.currentTime)} / ${formatTime(v.duration)}`;
  const frame = v.frameId === 0 ? '' : ' · en iframe';
  return `${v.width}×${v.height} · ${time} · ${v.paused ? 'en pausa' : 'reproduciendo'}${frame}`;
}

function renderPicker(): void {
  const many = state.ranked.length > 1;
  ui.pickerWrap.hidden = !many;
  if (!many) return;
  const keys = state.ranked.map((v) => v.key).join();
  if (ui.picker.dataset.keys !== keys) {
    ui.picker.replaceChildren(
      ...state.ranked.map((v, i) => {
        const option = document.createElement('option');
        option.value = v.key;
        option.textContent = `${i === 0 ? '★ ' : ''}Video ${i + 1} — ${v.width}×${v.height}${v.inPip ? ' (flotante)' : ''}`;
        return option;
      }),
    );
    ui.picker.dataset.keys = keys;
  }
  ui.picker.value = selectedVideo()?.key ?? '';
}

function render(): void {
  const video = selectedVideo();
  const pipHere = state.pip !== null;
  ui.pipState.dataset.active = String(pipHere);
  ui.pipState.textContent = pipHere ? 'PiP activo' : 'PiP inactivo';

  ui.otherTab.hidden = !(otherSession && otherSession.tabId !== tab?.id);

  if (!video) {
    ui.statusText.textContent = messageFor(ErrorCode.NoVideo);
    ui.statusMeta.textContent = 'Inicia el video en la página y vuelve a abrir este panel.';
  } else {
    const count = state.ranked.length;
    ui.statusText.textContent = video.inPip
      ? 'Reproduciendo en ventana flotante'
      : count > 1
        ? `${count} videos detectados`
        : 'Video detectado';
    ui.statusMeta.textContent = describe(video);
  }
  renderPicker();

  const supported = state.capabilities ? hasAnyPipSupport(state.capabilities) : false;
  ui.toggle.disabled = !video || (!video.inPip && (!supported || video.pipDisabled));
  ui.toggle.textContent = video?.inPip ? 'Cerrar ventana flotante' : 'Abrir ventana flotante';
  ui.play.disabled = !video;
  ui.play.textContent = video && !video.paused ? 'Pausar' : 'Reanudar';
  ui.reveal.disabled = !video?.inPip;

  const c = state.capabilities;
  ui.caps.textContent = c
    ? `PiP estándar: ${c.standard ? (c.standardEnabled ? 'sí' : 'bloqueado') : 'no'} · WebKit: ${c.webkitPresentationMode ? 'sí' : 'no'} · Document PiP: ${c.documentPip ? 'sí (no usado)' : 'no'}`
    : '';
}

async function refresh(): Promise<void> {
  if (!tab) return;
  try {
    state = collectTabVideos(await invokeContent(adapter, tab.id, 'all', 'report'));
  } catch (error) {
    state = { ranked: [], pip: null, capabilities: null };
    showMessage(serializeError(error).message);
  }
  otherSession = (await adapter.session.get<PipSession>('pipSession')) ?? null;
  if (selectedKey && !state.ranked.some((v) => v.key === selectedKey)) selectedKey = null;
  render();
  if (state.capabilities && !hasAnyPipSupport(state.capabilities)) {
    showMessage(messageFor(ErrorCode.PipUnsupported));
  } else if (selectedVideo()?.pipDisabled && !selectedVideo()?.inPip) {
    showMessage(messageFor(ErrorCode.PipDisabledByPage), 'info');
  }
}

async function handleResult(promise: Promise<{ result: unknown }[]>): Promise<void> {
  let result: ActionResult<unknown>;
  try {
    const [first] = await promise;
    result = isActionResult(first?.result) ? first.result : unknownResult();
  } catch (error) {
    result = { ok: false, error: serializeError(error) };
  }
  if (result.ok) showMessage(null);
  else if (result.fallbackShown) showMessage(result.error.message, 'info');
  else showMessage(result.error.message);
  await refresh();
}

// Cada manejador llama a executeScript sin await previo para conservar el gesto del usuario.
ui.toggle.addEventListener('click', () => {
  const video = selectedVideo();
  if (!tab || !video) return;
  void handleResult(
    video.inPip
      ? invokeContent(adapter, tab.id, [video.frameId], 'exit')
      : invokeContent(adapter, tab.id, [video.frameId], 'enter', video.id),
  );
});

ui.play.addEventListener('click', () => {
  const video = selectedVideo();
  if (tab && video) void handleResult(invokeContent(adapter, tab.id, [video.frameId], 'playPause', video.id));
});

ui.reveal.addEventListener('click', () => {
  const video = selectedVideo();
  if (tab && video) void handleResult(invokeContent(adapter, tab.id, [video.frameId], 'reveal', video.id));
});

ui.goOther.addEventListener('click', () => {
  const session = otherSession;
  if (!session) return;
  void (async () => {
    await adapter.focusTab({ id: session.tabId, windowId: session.windowId });
    await handleResult(invokeContent(adapter, session.tabId, [session.frameId], 'reveal', null));
    window.close();
  })().catch((error: unknown) => showMessage(serializeError(error).message));
});

ui.picker.addEventListener('change', () => {
  selectedKey = ui.picker.value;
  const video = selectedVideo();
  render();
  if (tab && video) void invokeContent(adapter, tab.id, [video.frameId], 'highlight', video.id).catch(() => {});
});

ui.shortcutConfig.addEventListener('click', () => void adapter.shortcuts.open());

async function resolveTab(): Promise<TabRef | null> {
  // Solo en el build de pruebas E2E: permite abrir el popup como pestaña apuntando a otra.
  if (__E2E__) {
    const id = Number(new URLSearchParams(location.search).get('tabId'));
    if (id > 0) return { id };
  }
  return adapter.getActiveTab();
}

async function init(): Promise<void> {
  ui.shortcutConfig.hidden = !adapter.shortcuts.configurable;
  void adapter.shortcuts.get(TOGGLE_COMMAND).then((s) => (ui.shortcut.textContent = s ?? 'sin asignar'));

  tab = await resolveTab();
  if (!tab) throw new ExtensionError(ErrorCode.NoActiveTab);
  await adapter.injectContentScript(tab.id);
  await refresh();
  setInterval(() => void refresh(), REFRESH_MS);
}

init().catch((error: unknown) => {
  ui.statusText.textContent = 'No disponible en esta página';
  ui.statusMeta.textContent = '';
  showMessage(serializeError(error).message);
});
