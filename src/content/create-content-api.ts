import { PipController } from '../core/pip-controller.ts';
import { takeSnapshot, togglePlayback, checkContinuity, type PlaybackSnapshot } from '../core/playback-controller.ts';
import { VideoDetector } from '../core/video-detector.ts';
import { selectPrimaryVideo } from '../core/video-selector.ts';
import type { ContentApi } from '../shared/content-api.ts';
import type { ActionResult, VideoId } from '../shared/types.ts';
import { ErrorCode, ExtensionError, serializeError } from '../utils/errors.ts';
import { createLogger } from '../utils/logger.ts';
import { flashHighlight, showActivationButton } from './overlay.ts';

const log = createLogger('content');

export interface ContentDeps {
  /** Notifica cambios de estado del PiP (al background, para el badge y "regresar"). */
  onPipChange?: (active: boolean) => void;
}

function fail(error: unknown, fallbackShown = false): ActionResult<never> {
  return { ok: false, error: serializeError(error), ...(fallbackShown ? { fallbackShown } : {}) };
}

export function createContentApi(doc: Document, deps: ContentDeps = {}): ContentApi & { dispose(): void } {
  const pip = new PipController(doc);
  const detector = new VideoDetector(doc, (video) => pip.isInPip(video));
  let removeFallback: (() => void) | null = null;
  let snapshot: { video: HTMLVideoElement; state: PlaybackSnapshot } | null = null;

  pip.onChange((video) => {
    if (video) {
      snapshot ??= { video, state: takeSnapshot(video) };
    } else if (snapshot) {
      // Al cerrar la ventana flotante el navegador puede pausar el video; se respeta.
      const result = checkContinuity(snapshot.state, takeSnapshot(snapshot.video));
      if (!result.preserved) log.warn('el reproductor reinició la posición al salir de PiP', result);
      snapshot = null;
    }
    deps.onPipChange?.(video !== null);
  });

  const resolveVideo = (id: VideoId | null): HTMLVideoElement => {
    if (id !== null) {
      const video = detector.get(id);
      if (!video) throw new ExtensionError(ErrorCode.VideoNotFound);
      return video;
    }
    const current = pip.current();
    if (current) return current;
    const primary = selectPrimaryVideo(detector.scan());
    const video = primary ? detector.get(primary.id) : null;
    if (!video) throw new ExtensionError(ErrorCode.NoVideo);
    return video;
  };

  const enterVideo = async (video: HTMLVideoElement) => {
    removeFallback?.();
    removeFallback = null;
    const before = takeSnapshot(video);
    const method = await pip.enter(video);
    snapshot = { video, state: before };
    return method;
  };

  return {
    version: 1,

    report() {
      const current = pip.current();
      return {
        isTopFrame: doc.defaultView?.top === doc.defaultView,
        capabilities: pip.capabilities,
        videos: detector.scan(),
        pipVideoId: current ? detector.registry.idOf(current) : null,
      };
    },

    async enter(id) {
      let video: HTMLVideoElement;
      try {
        video = resolveVideo(id);
      } catch (error) {
        return fail(error);
      }
      try {
        return { ok: true, value: await enterVideo(video) };
      } catch (error) {
        if (error instanceof ExtensionError && error.code === ErrorCode.NeedsUserGesture) {
          // Sin activación del usuario: se ofrece un botón dentro de la página.
          video.scrollIntoView?.({ block: 'center', inline: 'nearest' });
          removeFallback = showActivationButton(video, () => {
            enterVideo(video).catch((e: unknown) => log.warn('PiP falló tras el clic en la página', e));
          });
          return fail(error, true);
        }
        return fail(error);
      }
    },

    async exit() {
      try {
        await pip.exit();
        return { ok: true, value: undefined };
      } catch (error) {
        return fail(error);
      }
    },

    async reveal(id) {
      try {
        const video = resolveVideo(id);
        if (pip.isInPip(video)) await pip.exit();
        video.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        return { ok: true, value: undefined };
      } catch (error) {
        return fail(error);
      }
    },

    async playPause(id) {
      try {
        return { ok: true, value: await togglePlayback(resolveVideo(id)) };
      } catch (error) {
        return fail(error);
      }
    },

    highlight(id) {
      try {
        flashHighlight(resolveVideo(id));
        return { ok: true, value: undefined };
      } catch (error) {
        return fail(error);
      }
    },

    dispose() {
      removeFallback?.();
      pip.dispose();
    },
  };
}
