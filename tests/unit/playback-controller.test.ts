import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkContinuity, pause, play, takeSnapshot, togglePlayback } from '../../src/core/playback-controller.ts';
import { ErrorCode } from '../../src/utils/errors.ts';
import { makeVideo } from './helpers.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('control de reproducción', () => {
  it('pausa y reanuda', async () => {
    const video = makeVideo(document, { paused: false });
    expect(pause(video)).toBe('paused');
    await expect(play(video)).resolves.toBe('playing');
    await expect(togglePlayback(video)).resolves.toBe('paused');
    await expect(togglePlayback(video)).resolves.toBe('playing');
  });

  it('autoplay bloqueado → PLAYBACK_BLOCKED', async () => {
    const video = makeVideo(document);
    video.play = vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError'));
    await expect(play(video)).rejects.toMatchObject({ code: ErrorCode.PlaybackBlocked });
  });

  it('AbortError (play interrumpido) no se considera fallo', async () => {
    const video = makeVideo(document);
    video.play = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'));
    await expect(play(video)).resolves.toBe('paused');
  });
});

describe('conservación del tiempo', () => {
  it('snapshot y continuidad', () => {
    const video = makeVideo(document, { currentTime: 42 });
    const before = takeSnapshot(video);
    video.currentTime = 50;
    expect(checkContinuity(before, takeSnapshot(video))).toEqual({ preserved: true, drift: 8 });
    video.currentTime = 0;
    expect(checkContinuity(before, takeSnapshot(video)).preserved).toBe(false);
  });
});
