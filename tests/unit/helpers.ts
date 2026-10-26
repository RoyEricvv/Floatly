import { vi } from 'vitest';

export interface VideoOptions {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  paused?: boolean;
  readyState?: number;
  duration?: number;
  currentTime?: number;
  muted?: boolean;
  pipDisabled?: boolean;
  parent?: Node;
}

/** <video> con estado y geometría controlables (happy-dom no reproduce ni hace layout). */
export function makeVideo(doc: Document, o: VideoOptions = {}): HTMLVideoElement {
  const video = doc.createElement('video');
  const state = { paused: o.paused ?? true, currentTime: o.currentTime ?? 0 };
  const { x = 0, y = 0, w = 640, h = 360 } = o;
  Object.defineProperties(video, {
    paused: { get: () => state.paused, configurable: true },
    currentTime: { get: () => state.currentTime, set: (t: number) => (state.currentTime = t), configurable: true },
    readyState: { value: o.readyState ?? 4, configurable: true },
    duration: { value: o.duration ?? 120, configurable: true },
    muted: { value: o.muted ?? false, writable: true, configurable: true },
    playbackRate: { value: 1, configurable: true },
  });
  if (o.pipDisabled) video.setAttribute('disablepictureinpicture', '');
  video.play = vi.fn(async () => {
    state.paused = false;
  });
  video.pause = vi.fn(() => {
    state.paused = true;
  });
  video.getBoundingClientRect = () =>
    ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
  (o.parent ?? doc.body).appendChild(video);
  return video;
}

export interface FakePipOptions {
  enabled?: boolean;
  /** Nombre del DOMException con el que rechaza requestPictureInPicture. */
  rejectWith?: string;
}

/** Simula la Picture-in-Picture API estándar sobre el documento de happy-dom. */
export function installFakePip(doc: Document, options: FakePipOptions = {}) {
  let current: HTMLVideoElement | null = null;
  const proto = doc.defaultView!.HTMLVideoElement.prototype as HTMLVideoElement;
  const original = Object.getOwnPropertyDescriptor(proto, 'requestPictureInPicture');
  const fake: { rejectWith: string | undefined; request: (video: HTMLVideoElement) => void } = {
    rejectWith: options.rejectWith,
    request: vi.fn<(video: HTMLVideoElement) => void>(),
  };
  Object.defineProperty(doc, 'pictureInPictureElement', { get: () => current, configurable: true });
  Object.defineProperty(doc, 'pictureInPictureEnabled', { value: options.enabled ?? true, configurable: true });
  const leave = (): void => {
    const video = current;
    current = null;
    video?.dispatchEvent(new Event('leavepictureinpicture', { bubbles: true }));
  };
  Object.defineProperty(doc, 'exitPictureInPicture', { value: vi.fn(async () => leave()), configurable: true });
  Object.defineProperty(proto, 'requestPictureInPicture', {
    configurable: true,
    value: function (this: HTMLVideoElement) {
      fake.request(this);
      if (fake.rejectWith) return Promise.reject(new DOMException('rechazado', fake.rejectWith));
      if (current && current !== this) leave();
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- simula el elemento en PiP
      current = this;
      this.dispatchEvent(new Event('enterpictureinpicture', { bubbles: true }));
      return Promise.resolve({});
    },
  });
  return {
    ...fake,
    /** Hace que requestPictureInPicture rechace con este DOMException. */
    setReject(name: string | undefined): void {
      fake.rejectWith = name;
    },
    get current() {
      return current;
    },
    /** El usuario cierra la ventana flotante con su botón ✕ (los navegadores pausan el video). */
    userClose(): void {
      current?.pause();
      leave();
    },
    restore(): void {
      if (original) Object.defineProperty(proto, 'requestPictureInPicture', original);
      else delete (proto as unknown as Record<string, unknown>).requestPictureInPicture;
      delete (doc as unknown as Record<string, unknown>).pictureInPictureElement;
      delete (doc as unknown as Record<string, unknown>).pictureInPictureEnabled;
      delete (doc as unknown as Record<string, unknown>).exitPictureInPicture;
    },
  };
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
