import { describe, expect, it } from 'vitest';
import { isCandidate, rankVideos, selectPrimaryVideo } from '../../src/core/video-selector.ts';
import type { VideoDescriptor } from '../../src/shared/types.ts';

const v = (over: Partial<VideoDescriptor>): VideoDescriptor => ({
  id: 1,
  width: 640,
  height: 360,
  visibleArea: 640 * 360,
  duration: 300,
  currentTime: 0,
  paused: true,
  muted: false,
  readyState: 4,
  pipDisabled: false,
  inPip: false,
  ...over,
});

describe('selección del video principal', () => {
  it('devuelve null sin videos', () => {
    expect(selectPrimaryVideo([])).toBeNull();
  });

  it('descarta miniaturas', () => {
    expect(isCandidate(v({ width: 120, height: 68 }))).toBe(false);
    expect(selectPrimaryVideo([v({ width: 100, height: 50, visibleArea: 5000 })])).toBeNull();
  });

  it('prefiere el video que se está reproduciendo frente a uno mayor en pausa', () => {
    const big = v({ id: 1, width: 1000, height: 560, visibleArea: 1000 * 560 });
    const playing = v({ id: 2, paused: false });
    expect(selectPrimaryVideo([big, playing])?.id).toBe(2);
  });

  it('a igualdad de estado, prefiere el de mayor área visible', () => {
    const small = v({ id: 1, visibleArea: 100_000 });
    const large = v({ id: 2, visibleArea: 400_000 });
    expect(selectPrimaryVideo([small, large])?.id).toBe(2);
  });

  it('penaliza vistas previas silenciadas y videos fuera de pantalla', () => {
    const preview = v({ id: 1, paused: false, muted: true, visibleArea: 300_000 });
    const main = v({ id: 2, paused: false, visibleArea: 250_000 });
    const offscreen = v({ id: 3, paused: false, visibleArea: 0 });
    expect(rankVideos([preview, main, offscreen]).map((x) => x.id)).toEqual([2, 1, 3]);
  });

  it('el video que ya está en PiP siempre es el principal', () => {
    const pip = v({ id: 9, inPip: true, width: 0, height: 0, visibleArea: 0 });
    expect(selectPrimaryVideo([v({ id: 1, paused: false }), pip])?.id).toBe(9);
  });

  it('el orden es estable ante empates', () => {
    expect(rankVideos([v({ id: 1 }), v({ id: 2 })]).map((x) => x.id)).toEqual([1, 2]);
  });
});
