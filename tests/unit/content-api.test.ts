import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentApi } from '../../src/content/create-content-api.ts';
import { ErrorCode } from '../../src/utils/errors.ts';
import { installFakePip, makeVideo } from './helpers.ts';

let pip: ReturnType<typeof installFakePip>;
let api: ReturnType<typeof createContentApi>;
const onPipChange = vi.fn();

beforeEach(() => {
  pip = installFakePip(document);
  onPipChange.mockClear();
  api = createContentApi(document, { onPipChange });
});
afterEach(() => {
  api.dispose();
  pip.restore();
  document.body.innerHTML = '';
});

const overlay = () => document.querySelector('video-flotante-overlay');

describe('content API', () => {
  it('report() sin videos', () => {
    expect(api.report()).toMatchObject({ isTopFrame: true, videos: [], pipVideoId: null });
  });

  it('enter(null) elige el video principal y notifica el cambio', async () => {
    makeVideo(document, { w: 200, h: 120 });
    const main = makeVideo(document, { w: 1280, h: 720, paused: false });
    await expect(api.enter(null)).resolves.toEqual({ ok: true, value: 'standard' });
    expect(pip.current).toBe(main);
    expect(onPipChange).toHaveBeenLastCalledWith(true);
    expect(api.report().pipVideoId).not.toBeNull();
  });

  it('enter(id) usa el video elegido en el selector', async () => {
    makeVideo(document, { w: 1280, h: 720, paused: false });
    const second = makeVideo(document, { w: 640, h: 360 });
    const id = api.report().videos[1]!.id;
    await api.enter(id);
    expect(pip.current).toBe(second);
  });

  it('sin videos → NO_VIDEO', async () => {
    await expect(api.enter(null)).resolves.toMatchObject({ ok: false, error: { code: ErrorCode.NoVideo } });
  });

  it('id inexistente → VIDEO_NOT_FOUND', async () => {
    await expect(api.enter(999)).resolves.toMatchObject({ ok: false, error: { code: ErrorCode.VideoNotFound } });
  });

  it('sin gesto del usuario muestra un botón dentro de la página como alternativa', async () => {
    vi.useFakeTimers();
    try {
      makeVideo(document);
      pip.setReject('NotAllowedError');
      const result = await api.enter(null);
      expect(result).toMatchObject({ ok: false, fallbackShown: true, error: { code: ErrorCode.NeedsUserGesture } });
      expect(overlay()).not.toBeNull();
      vi.advanceTimersByTime(13_000);
      expect(overlay()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('conserva tiempo y estado de reproducción al entrar y salir', async () => {
    const video = makeVideo(document, { paused: false, currentTime: 73.2 });
    await api.enter(null);
    video.currentTime = 80;
    await api.exit();
    expect(video.currentTime).toBe(80);
    expect(video.paused).toBe(false);
    expect(onPipChange).toHaveBeenLastCalledWith(false);
  });

  it('cierre con ✕ por el usuario: estado limpio y notificación', async () => {
    makeVideo(document, { paused: false });
    await api.enter(null);
    pip.userClose();
    expect(api.report().pipVideoId).toBeNull();
    expect(onPipChange).toHaveBeenLastCalledWith(false);
  });

  it('reveal() sale del PiP y desplaza la página hasta el video', async () => {
    const video = makeVideo(document, { paused: false });
    video.scrollIntoView = vi.fn();
    await api.enter(null);
    await expect(api.reveal(null)).resolves.toEqual({ ok: true, value: undefined });
    expect(pip.current).toBeNull();
    expect(video.scrollIntoView).toHaveBeenCalled();
    expect(video.paused).toBe(false);
  });

  it('playPause() alterna la reproducción del video en PiP', async () => {
    const video = makeVideo(document, { paused: false });
    await api.enter(null);
    await expect(api.playPause(null)).resolves.toEqual({ ok: true, value: 'paused' });
    expect(video.paused).toBe(true);
    await expect(api.playPause(null)).resolves.toEqual({ ok: true, value: 'playing' });
  });

  it('highlight() dibuja un recuadro temporal', () => {
    makeVideo(document);
    const id = api.report().videos[0]!.id;
    expect(api.highlight(id).ok).toBe(true);
    expect(overlay()).not.toBeNull();
  });
});
