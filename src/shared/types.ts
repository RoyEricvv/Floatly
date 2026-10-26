import type { ErrorCode } from '../utils/errors.ts';

/** Identificador local (por frame) de un elemento <video>. */
export type VideoId = number;

/** Capacidades de Picture-in-Picture detectadas en el documento. */
export interface PipCapabilities {
  /** HTMLVideoElement.requestPictureInPicture() existe. */
  standard: boolean;
  /** document.pictureInPictureEnabled (puede estar desactivado por Permissions-Policy). */
  standardEnabled: boolean;
  /** API heredada de WebKit: webkitSetPresentationMode('picture-in-picture'). */
  webkitPresentationMode: boolean;
  /** Document Picture-in-Picture API (solo informativo; el MVP no la usa). */
  documentPip: boolean;
}

/** Datos serializables de un video, sin URLs ni contenido de la página. */
export interface VideoDescriptor {
  id: VideoId;
  width: number;
  height: number;
  /** Área visible dentro del viewport, en px². */
  visibleArea: number;
  /** Segundos; null si es infinita (directo) o desconocida. */
  duration: number | null;
  currentTime: number;
  paused: boolean;
  muted: boolean;
  readyState: number;
  /** El sitio marcó el video con disablePictureInPicture. */
  pipDisabled: boolean;
  /** Este video está ahora mismo en Picture-in-Picture. */
  inPip: boolean;
}

/** Informe que devuelve cada frame donde corre el content script. */
export interface FrameReport {
  isTopFrame: boolean;
  capabilities: PipCapabilities;
  videos: VideoDescriptor[];
  pipVideoId: VideoId | null;
}

export interface SerializedError {
  code: ErrorCode;
  message: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: SerializedError; fallbackShown?: boolean };

/** Mensajes content script -> background. */
export type RuntimeMessage = { type: 'pip-state'; active: boolean };

/** Estado guardado por el background sobre la pestaña que tiene PiP activo. */
export interface PipSession {
  tabId: number;
  frameId: number;
  windowId?: number;
}
