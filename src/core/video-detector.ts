import type { VideoDescriptor, VideoId } from '../shared/types.ts';

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Asigna identificadores estables a los <video> sin modificar el DOM de la página
 * (no se añaden atributos) y sin impedir que el recolector libere los elementos.
 */
export class VideoRegistry {
  private readonly ids = new WeakMap<HTMLVideoElement, VideoId>();
  private readonly refs = new Map<VideoId, WeakRef<HTMLVideoElement>>();
  private nextId: VideoId = 1;

  idOf(video: HTMLVideoElement): VideoId {
    let id = this.ids.get(video);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(video, id);
      this.refs.set(id, new WeakRef(video));
    }
    return id;
  }

  get(id: VideoId): HTMLVideoElement | null {
    const video = this.refs.get(id)?.deref();
    if (!video || !video.isConnected) {
      this.refs.delete(id);
      return null;
    }
    return video;
  }
}

/** Busca <video> en el documento y en shadow roots abiertos (reproductores con Web Components). */
export function findVideos(root: Document | ShadowRoot): HTMLVideoElement[] {
  const found: HTMLVideoElement[] = [];
  const visit = (node: Document | ShadowRoot): void => {
    for (const video of node.querySelectorAll('video')) found.push(video);
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(root);
  return found;
}

export function visibleArea(rect: DOMRectReadOnly, viewport: Viewport): number {
  const w = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
  const h = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
  return Math.round(w * h);
}

export function describeVideo(
  video: HTMLVideoElement,
  id: VideoId,
  viewport: Viewport,
  inPip: boolean,
): VideoDescriptor {
  const rect = video.getBoundingClientRect();
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  return {
    id,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    visibleArea: visibleArea(rect, viewport),
    duration,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    paused: video.paused,
    muted: video.muted,
    readyState: video.readyState,
    pipDisabled: video.disablePictureInPicture === true || video.hasAttribute('disablepictureinpicture'),
    inPip,
  };
}

export class VideoDetector {
  readonly registry = new VideoRegistry();

  constructor(
    private readonly doc: Document,
    private readonly isInPip: (video: HTMLVideoElement) => boolean,
  ) {}

  scan(): VideoDescriptor[] {
    const view = this.doc.defaultView;
    const viewport: Viewport = {
      width: view?.innerWidth ?? 0,
      height: view?.innerHeight ?? 0,
    };
    return findVideos(this.doc).map((video) =>
      describeVideo(video, this.registry.idOf(video), viewport, this.isInPip(video)),
    );
  }

  get(id: VideoId): HTMLVideoElement | null {
    return this.registry.get(id);
  }
}
