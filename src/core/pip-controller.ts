import type { PipCapabilities } from '../shared/types.ts';
import { ErrorCode, ExtensionError, fromPipDomException } from '../utils/errors.ts';
import { detectCapabilities } from './capabilities.ts';

export type PipMethod = 'standard' | 'webkit';
export type PipChangeListener = (video: HTMLVideoElement | null) => void;

const PIP_EVENTS = ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged'] as const;

function isVideo(el: Element | null | undefined): el is HTMLVideoElement {
  return !!el && el.tagName === 'VIDEO';
}

/**
 * Controla la ventana flotante nativa del navegador. Mover y redimensionar la
 * ventana lo gestiona el sistema operativo; aquí solo se entra y se sale.
 */
export class PipController {
  private webkitVideo: WeakRef<HTMLVideoElement> | null = null;
  private readonly listeners = new Set<PipChangeListener>();
  private readonly onPipEvent = (): void => {
    const video = this.current();
    for (const listener of this.listeners) listener(video);
  };

  constructor(
    private readonly doc: Document,
    readonly capabilities: PipCapabilities = detectCapabilities(doc),
    private readonly webkitTimeoutMs = 1500,
  ) {
    for (const type of PIP_EVENTS) doc.addEventListener(type, this.onPipEvent, true);
  }

  /** Video actualmente en PiP en este documento (atraviesa shadow roots, donde el elemento se reasigna al host). */
  current(): HTMLVideoElement | null {
    let el: Element | null = this.doc.pictureInPictureElement ?? null;
    while (el && !isVideo(el) && el.shadowRoot) {
      el = el.shadowRoot.pictureInPictureElement ?? null;
    }
    if (isVideo(el)) return el;
    const webkit = this.webkitVideo?.deref();
    if (webkit && webkit.webkitPresentationMode === 'picture-in-picture') return webkit;
    return null;
  }

  isInPip(video: HTMLVideoElement): boolean {
    return this.current() === video;
  }

  /**
   * Entra en PiP. requestPictureInPicture() se invoca de forma síncrona, sin
   * esperas previas, para no perder la activación transitoria del usuario.
   */
  enter(video: HTMLVideoElement): Promise<PipMethod> {
    if (this.isInPip(video)) return Promise.resolve(this.webkitVideo?.deref() === video ? 'webkit' : 'standard');
    if (video.disablePictureInPicture || video.hasAttribute('disablepictureinpicture')) {
      return Promise.reject(new ExtensionError(ErrorCode.PipDisabledByPage));
    }

    const caps = this.capabilities;
    if (caps.standard) {
      if (!caps.standardEnabled && !caps.webkitPresentationMode) {
        return Promise.reject(new ExtensionError(ErrorCode.PipDisabledByPolicy));
      }
      if (caps.standardEnabled) {
        if (video.readyState === 0) return Promise.reject(new ExtensionError(ErrorCode.VideoNotReady));
        return video.requestPictureInPicture().then(
          () => 'standard' as const,
          (error: unknown) => {
            throw fromPipDomException(error, caps.standardEnabled);
          },
        );
      }
    }
    if (caps.webkitPresentationMode) return this.enterWebkit(video);
    return Promise.reject(new ExtensionError(ErrorCode.PipUnsupported));
  }

  private enterWebkit(video: HTMLVideoElement): Promise<PipMethod> {
    if (!video.webkitSupportsPresentationMode?.('picture-in-picture')) {
      return Promise.reject(new ExtensionError(ErrorCode.PipUnsupported));
    }
    try {
      video.webkitSetPresentationMode?.('picture-in-picture');
    } catch (error) {
      return Promise.reject(fromPipDomException(error, true));
    }
    this.webkitVideo = new WeakRef(video);
    return new Promise((resolve, reject) => {
      const done = (): void => {
        clearTimeout(timer);
        video.removeEventListener('webkitpresentationmodechanged', check);
      };
      const check = (): void => {
        if (video.webkitPresentationMode === 'picture-in-picture') {
          done();
          resolve('webkit');
        }
      };
      const timer = setTimeout(() => {
        done();
        if (video.webkitPresentationMode === 'picture-in-picture') resolve('webkit');
        else reject(new ExtensionError(ErrorCode.NeedsUserGesture));
      }, this.webkitTimeoutMs);
      video.addEventListener('webkitpresentationmodechanged', check);
      check();
    });
  }

  async exit(): Promise<void> {
    const video = this.current();
    if (!video) return;
    if (this.webkitVideo?.deref() === video && video.webkitPresentationMode === 'picture-in-picture') {
      video.webkitSetPresentationMode?.('inline');
      this.webkitVideo = null;
      return;
    }
    if (this.doc.pictureInPictureElement) await this.doc.exitPictureInPicture();
  }

  toggle(video: HTMLVideoElement): Promise<PipMethod | 'exited'> {
    if (this.isInPip(video)) return this.exit().then(() => 'exited' as const);
    return this.enter(video);
  }

  onChange(listener: PipChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const type of PIP_EVENTS) this.doc.removeEventListener(type, this.onPipEvent, true);
    this.listeners.clear();
  }
}
