import type { PlaybackState } from '../core/playback-controller.ts';
import type { PipMethod } from '../core/pip-controller.ts';
import type { ActionResult, FrameReport, VideoId } from './types.ts';

/** Nombre global (en el mundo aislado de la extensión, invisible para la página). */
export const CONTENT_API_KEY = '__videoFlotante';

/** API que el content script expone para popup y background vía scripting.executeScript. */
export interface ContentApi {
  readonly version: 1;
  report(): FrameReport;
  /** id null = video principal de este frame. */
  enter(id: VideoId | null): Promise<ActionResult<PipMethod>>;
  exit(): Promise<ActionResult>;
  /** Regresa al reproductor original: sale del PiP y desplaza la página hasta el video. */
  reveal(id: VideoId | null): Promise<ActionResult>;
  playPause(id: VideoId | null): Promise<ActionResult<PlaybackState>>;
  highlight(id: VideoId): ActionResult;
}

export type ContentMethod = Exclude<keyof ContentApi, 'version'>;
