import { ErrorCode, ExtensionError } from '../utils/errors.ts';

export interface PlaybackSnapshot {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
}

export type PlaybackState = 'playing' | 'paused';

export function takeSnapshot(video: HTMLVideoElement): PlaybackSnapshot {
  return { currentTime: video.currentTime, paused: video.paused, playbackRate: video.playbackRate };
}

export async function play(video: HTMLVideoElement): Promise<PlaybackState> {
  try {
    await video.play();
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    // AbortError: otra llamada (p. ej. pause) interrumpió el play(); no es un fallo real.
    if (name === 'NotAllowedError') throw new ExtensionError(ErrorCode.PlaybackBlocked);
    if (name !== 'AbortError') throw new ExtensionError(ErrorCode.Unknown, (error as Error)?.message);
  }
  return video.paused ? 'paused' : 'playing';
}

export function pause(video: HTMLVideoElement): PlaybackState {
  video.pause();
  return 'paused';
}

export function togglePlayback(video: HTMLVideoElement): Promise<PlaybackState> {
  return video.paused ? play(video) : Promise.resolve(pause(video));
}

/**
 * El PiP nativo usa el mismo elemento, por lo que la posición se conserva por diseño.
 * Esta comprobación detecta reinicios inesperados (p. ej. un reproductor que recrea el video).
 */
export function checkContinuity(
  before: PlaybackSnapshot,
  after: PlaybackSnapshot,
  toleranceSec = 1,
): { preserved: boolean; drift: number } {
  const drift = after.currentTime - before.currentTime;
  return { preserved: drift >= -toleranceSec, drift };
}
