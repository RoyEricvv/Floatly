import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectCapabilities, hasAnyPipSupport } from '../../src/core/capabilities.ts';
import { PipController } from '../../src/core/pip-controller.ts';
import type { PipCapabilities } from '../../src/shared/types.ts';
import { ErrorCode } from '../../src/utils/errors.ts';
import { installFakePip, makeVideo } from './helpers.ts';

const STANDARD: PipCapabilities = { standard: true, standardEnabled: true, webkitPresentationMode: false, documentPip: false };
const WEBKIT_ONLY: PipCapabilities = { standard: false, standardEnabled: false, webkitPresentationMode: true, documentPip: false };
const NONE: PipCapabilities = { standard: false, standardEnabled: false, webkitPresentationMode: false, documentPip: false };

let pip: ReturnType<typeof installFakePip>;
let controller: PipController | null = null;

beforeEach(() => {
  pip = installFakePip(document);
});
afterEach(() => {
  controller?.dispose();
  controller = null;
  pip.restore();
  document.body.innerHTML = '';
});

describe('detección de capacidades', () => {
  it('detecta la API estándar', () => {
    const caps = detectCapabilities(document);
    expect(caps.standard).toBe(true);
    expect(caps.standardEnabled).toBe(true);
    expect(hasAnyPipSupport(caps)).toBe(true);
  });

  it('sin ninguna API no hay soporte', () => {
    expect(hasAnyPipSupport(NONE)).toBe(false);
    expect(hasAnyPipSupport({ ...STANDARD, standardEnabled: false })).toBe(false);
  });
});

describe('activación de PiP (API estándar)', () => {
  it('entra en PiP y lo reporta como activo', async () => {
    const video = makeVideo(document);
    controller = new PipController(document, STANDARD);
    await expect(controller.enter(video)).resolves.toBe('standard');
    expect(controller.current()).toBe(video);
    expect(controller.isInPip(video)).toBe(true);
  });

  it('llama a requestPictureInPicture de forma síncrona (conserva el gesto del usuario)', () => {
    const video = makeVideo(document);
    controller = new PipController(document, STANDARD);
    void controller.enter(video);
    expect(pip.request).toHaveBeenCalledTimes(1);
  });

  it('no vuelve a solicitar si el video ya está en PiP', async () => {
    const video = makeVideo(document);
    controller = new PipController(document, STANDARD);
    await controller.enter(video);
    await controller.enter(video);
    expect(pip.request).toHaveBeenCalledTimes(1);
  });

  it('toggle entra y sale', async () => {
    const video = makeVideo(document);
    controller = new PipController(document, STANDARD);
    await expect(controller.toggle(video)).resolves.toBe('standard');
    await expect(controller.toggle(video)).resolves.toBe('exited');
    expect(controller.current()).toBeNull();
  });

  it('detecta el video en PiP dentro de un shadow root (el documento ve el host)', async () => {
    const host = document.createElement('x-player');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const video = makeVideo(document, { parent: shadow });
    Object.defineProperty(document, 'pictureInPictureElement', { get: () => host, configurable: true });
    Object.defineProperty(shadow, 'pictureInPictureElement', { get: () => video, configurable: true });
    controller = new PipController(document, STANDARD);
    expect(controller.current()).toBe(video);
  });
});

describe('manejo de errores', () => {
  it.each([
    ['NotAllowedError', ErrorCode.NeedsUserGesture],
    ['InvalidStateError', ErrorCode.VideoNotReady],
    ['NotSupportedError', ErrorCode.PipUnsupported],
    ['SecurityError', ErrorCode.PipDisabledByPolicy],
  ])('%s → %s', async (domError, code) => {
    pip.setReject(domError);
    controller = new PipController(document, STANDARD);
    await expect(controller.enter(makeVideo(document))).rejects.toMatchObject({ code });
  });

  it('respeta disablePictureInPicture del sitio sin llamar a la API', async () => {
    controller = new PipController(document, STANDARD);
    await expect(controller.enter(makeVideo(document, { pipDisabled: true }))).rejects.toMatchObject({
      code: ErrorCode.PipDisabledByPage,
    });
    expect(pip.request).not.toHaveBeenCalled();
  });

  it('video sin datos (readyState 0) → VIDEO_NOT_READY', async () => {
    controller = new PipController(document, STANDARD);
    await expect(controller.enter(makeVideo(document, { readyState: 0 }))).rejects.toMatchObject({
      code: ErrorCode.VideoNotReady,
    });
  });

  it('política de permisos bloqueando PiP → PIP_DISABLED_BY_POLICY', async () => {
    controller = new PipController(document, { ...STANDARD, standardEnabled: false });
    await expect(controller.enter(makeVideo(document))).rejects.toMatchObject({ code: ErrorCode.PipDisabledByPolicy });
  });

  it('navegador sin PiP → PIP_UNSUPPORTED', async () => {
    controller = new PipController(document, NONE);
    await expect(controller.enter(makeVideo(document))).rejects.toMatchObject({ code: ErrorCode.PipUnsupported });
  });
});

describe('cierre de la ventana flotante', () => {
  it('notifica entrada y salida, incluido el cierre con ✕ por el usuario', async () => {
    const video = makeVideo(document, { paused: false });
    controller = new PipController(document, STANDARD);
    const changes: (HTMLVideoElement | null)[] = [];
    controller.onChange((v) => changes.push(v));
    await controller.enter(video);
    pip.userClose();
    expect(changes).toEqual([video, null]);
    expect(controller.current()).toBeNull();
  });

  it('exit() sin PiP activo no hace nada', async () => {
    controller = new PipController(document, STANDARD);
    await expect(controller.exit()).resolves.toBeUndefined();
    expect(document.exitPictureInPicture).not.toHaveBeenCalled();
  });
});

describe('alternativa WebKit (webkitSetPresentationMode)', () => {
  function webkitVideo(accepts = true) {
    const video = makeVideo(document);
    let mode: 'inline' | 'picture-in-picture' | 'fullscreen' = 'inline';
    Object.defineProperty(video, 'webkitPresentationMode', { get: () => mode, configurable: true });
    video.webkitSupportsPresentationMode = () => true;
    video.webkitSetPresentationMode = vi.fn((next) => {
      if (!accepts) return;
      mode = next;
      video.dispatchEvent(new Event('webkitpresentationmodechanged'));
    });
    return video;
  }

  it('entra y sale usando la API heredada', async () => {
    const video = webkitVideo();
    controller = new PipController(document, WEBKIT_ONLY);
    await expect(controller.enter(video)).resolves.toBe('webkit');
    expect(controller.current()).toBe(video);
    await controller.exit();
    expect(video.webkitSetPresentationMode).toHaveBeenLastCalledWith('inline');
    expect(controller.current()).toBeNull();
  });

  it('si el modo no cambia (sin gesto) → NEEDS_USER_GESTURE', async () => {
    controller = new PipController(document, WEBKIT_ONLY, 20);
    await expect(controller.enter(webkitVideo(false))).rejects.toMatchObject({ code: ErrorCode.NeedsUserGesture });
  });
});
