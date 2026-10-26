import type { VideoDescriptor } from '../shared/types.ts';

/** Por debajo de este tamaño se considera miniatura, anuncio o vista previa. */
export const MIN_WIDTH = 160;
export const MIN_HEIGHT = 90;

export function isCandidate(v: VideoDescriptor): boolean {
  if (v.inPip) return true;
  return v.width >= MIN_WIDTH && v.height >= MIN_HEIGHT;
}

/**
 * Heurística del "video principal": área visible, reproducción en curso,
 * datos cargados y audio activo. Las vistas previas silenciadas puntúan menos.
 */
export function scoreVideo(v: VideoDescriptor): number {
  if (!isCandidate(v)) return 0;
  if (v.inPip) return Number.MAX_SAFE_INTEGER;
  let score = Math.max(v.visibleArea, 1);
  if (!v.paused) score *= 3;
  if (v.readyState >= 2) score *= 1.5;
  else if (v.readyState === 0) score *= 0.25;
  if (v.muted) score *= 0.6;
  if (v.duration !== null && v.duration < 5) score *= 0.3;
  if (v.pipDisabled) score *= 0.1;
  return score;
}

/** Ordena de mayor a menor probabilidad de ser el video principal (orden estable). */
export function rankVideos<T extends VideoDescriptor>(videos: readonly T[]): T[] {
  return videos
    .map((v, index) => ({ v, index, score: scoreVideo(v) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.v);
}

export function selectPrimaryVideo<T extends VideoDescriptor>(videos: readonly T[]): T | null {
  return rankVideos(videos)[0] ?? null;
}
