import type { PipCapabilities } from '../shared/types.ts';

export function detectCapabilities(doc: Document): PipCapabilities {
  const win = doc.defaultView;
  const proto = win?.HTMLVideoElement?.prototype as HTMLVideoElement | undefined;
  return {
    standard: typeof proto?.requestPictureInPicture === 'function',
    standardEnabled: doc.pictureInPictureEnabled === true,
    webkitPresentationMode:
      typeof proto?.webkitSupportsPresentationMode === 'function' &&
      typeof proto?.webkitSetPresentationMode === 'function',
    documentPip: win !== null && 'documentPictureInPicture' in win,
  };
}

export function hasAnyPipSupport(caps: PipCapabilities): boolean {
  return (caps.standard && caps.standardEnabled) || caps.webkitPresentationMode;
}
