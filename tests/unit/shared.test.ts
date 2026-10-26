import { describe, expect, it } from 'vitest';
import { isActionResult } from '../../src/shared/content-bridge.ts';
import { collectTabVideos } from '../../src/shared/frames.ts';
import type { FrameReport, VideoDescriptor } from '../../src/shared/types.ts';
import { ErrorCode, ExtensionError, fromPipDomException, isErrorCode, serializeError } from '../../src/utils/errors.ts';
import { formatTime } from '../../src/utils/format.ts';

const caps = { standard: true, standardEnabled: true, webkitPresentationMode: false, documentPip: false };
const video = (over: Partial<VideoDescriptor>): VideoDescriptor => ({
  id: 1, width: 640, height: 360, visibleArea: 230_400, duration: 60, currentTime: 0,
  paused: true, muted: false, readyState: 4, pipDisabled: false, inPip: false, ...over,
});
const report = (videos: VideoDescriptor[], isTopFrame = true): FrameReport => ({
  isTopFrame, capabilities: caps, videos, pipVideoId: null,
});

describe('combinación de frames', () => {
  it('une videos de varios frames con claves únicas y elige el principal', () => {
    const { ranked, pip, capabilities } = collectTabVideos([
      { frameId: 0, result: report([video({ id: 1 })]) },
      { frameId: 5, result: report([video({ id: 1, paused: false })], false) },
      { frameId: 6, result: undefined },
    ]);
    expect(ranked.map((v) => v.key)).toEqual(['5:1', '0:1']);
    expect(pip).toBeNull();
    expect(capabilities).toEqual(caps);
  });

  it('identifica el video en PiP', () => {
    const { pip } = collectTabVideos([{ frameId: 2, result: report([video({ id: 4, inPip: true })]) }]);
    expect(pip?.key).toBe('2:4');
  });
});

describe('errores', () => {
  it('serializa errores propios y ajenos', () => {
    expect(serializeError(new ExtensionError(ErrorCode.NoVideo)).code).toBe('NO_VIDEO');
    expect(serializeError(new Error('boom'))).toMatchObject({ code: 'UNKNOWN' });
    expect(serializeError('x').message).toContain('x');
  });

  it('NotAllowedError con PiP permitido = falta gesto; con PiP bloqueado = política', () => {
    const e = new DOMException('', 'NotAllowedError');
    expect(fromPipDomException(e, true).code).toBe(ErrorCode.NeedsUserGesture);
    expect(fromPipDomException(e, false).code).toBe(ErrorCode.PipDisabledByPolicy);
  });

  it('valida códigos y resultados', () => {
    expect(isErrorCode('NO_VIDEO')).toBe(true);
    expect(isErrorCode('nope')).toBe(false);
    expect(isActionResult({ ok: true, value: 1 })).toBe(true);
    expect(isActionResult({})).toBe(false);
  });
});

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [65, '1:05'],
    [3725, '1:02:05'],
    [null, 'en directo'],
    [Infinity, 'en directo'],
  ])('%s → %s', (input, out) => {
    expect(formatTime(input)).toBe(out);
  });
});
