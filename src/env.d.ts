/** Constantes inyectadas en tiempo de compilación (ver scripts/build.ts). */
declare const __TARGET__: 'safari' | 'chrome';
declare const __DEV__: boolean;
declare const __E2E__: boolean;

/** API heredada de WebKit (Safari < 13.1 y como alternativa). */
interface HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void;
  readonly webkitPresentationMode?: 'inline' | 'picture-in-picture' | 'fullscreen';
}
