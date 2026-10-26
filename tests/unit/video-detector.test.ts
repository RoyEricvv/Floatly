import { afterEach, describe, expect, it } from 'vitest';
import { VideoDetector, findVideos, visibleArea } from '../../src/core/video-detector.ts';
import { makeVideo } from './helpers.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findVideos', () => {
  it('encuentra videos del documento y de shadow roots abiertos', () => {
    makeVideo(document);
    const host = document.createElement('custom-player');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    makeVideo(document, { parent: shadow });
    expect(findVideos(document)).toHaveLength(2);
  });

  it('devuelve lista vacía si no hay videos', () => {
    document.body.innerHTML = '<p>sin video</p><audio></audio>';
    expect(findVideos(document)).toEqual([]);
  });
});

describe('visibleArea', () => {
  const rect = (left: number, top: number, w: number, h: number) =>
    ({ left, top, right: left + w, bottom: top + h, width: w, height: h }) as DOMRect;

  it('recorta contra el viewport', () => {
    expect(visibleArea(rect(0, 0, 100, 100), { width: 1000, height: 1000 })).toBe(10000);
    expect(visibleArea(rect(-50, 0, 100, 100), { width: 1000, height: 1000 })).toBe(5000);
    expect(visibleArea(rect(0, 2000, 100, 100), { width: 1000, height: 1000 })).toBe(0);
  });
});

describe('VideoDetector', () => {
  it('describe cada video con ids estables y sin tocar el DOM', () => {
    const video = makeVideo(document, { w: 1280, h: 720, duration: 90, currentTime: 12.5, paused: false });
    const detector = new VideoDetector(document, () => false);
    const [first] = detector.scan();
    expect(first).toMatchObject({
      width: 1280,
      height: 720,
      duration: 90,
      currentTime: 12.5,
      paused: false,
      readyState: 4,
      pipDisabled: false,
      inPip: false,
    });
    expect(detector.scan()[0]!.id).toBe(first!.id);
    expect(detector.get(first!.id)).toBe(video);
    expect(video.attributes.length).toBe(0);
  });

  it('marca duración infinita (directo) como null y detecta disablePictureInPicture', () => {
    makeVideo(document, { duration: Infinity, pipDisabled: true });
    const [v] = new VideoDetector(document, () => false).scan();
    expect(v!.duration).toBeNull();
    expect(v!.pipDisabled).toBe(true);
  });

  it('get() devuelve null si el video se eliminó de la página', () => {
    const video = makeVideo(document);
    const detector = new VideoDetector(document, () => false);
    const [v] = detector.scan();
    video.remove();
    expect(detector.get(v!.id)).toBeNull();
  });
});
