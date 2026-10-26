import type { FrameResult } from '../adapters/browser-adapter.ts';
import { rankVideos } from '../core/video-selector.ts';
import type { FrameReport, PipCapabilities, VideoDescriptor } from './types.ts';

export interface FrameVideo extends VideoDescriptor {
  frameId: number;
  /** Clave única en la pestaña: `${frameId}:${id}`. */
  key: string;
}

export interface TabVideos {
  /** Ordenados: el primero es el video principal. */
  ranked: FrameVideo[];
  pip: FrameVideo | null;
  capabilities: PipCapabilities | null;
}

function isFrameReport(value: unknown): value is FrameReport {
  return typeof value === 'object' && value !== null && Array.isArray((value as FrameReport).videos);
}

export function collectTabVideos(results: readonly FrameResult<unknown>[]): TabVideos {
  const all: FrameVideo[] = [];
  let capabilities: PipCapabilities | null = null;
  for (const { frameId, result } of results) {
    if (!isFrameReport(result)) continue;
    if (result.isTopFrame || capabilities === null) capabilities = result.capabilities;
    for (const v of result.videos) all.push({ ...v, frameId, key: `${frameId}:${v.id}` });
  }
  return { ranked: rankVideos(all), pip: all.find((v) => v.inPip) ?? null, capabilities };
}
