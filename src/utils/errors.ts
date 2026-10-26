export const ErrorCode = {
  NoVideo: 'NO_VIDEO',
  VideoNotFound: 'VIDEO_NOT_FOUND',
  PipUnsupported: 'PIP_UNSUPPORTED',
  PipDisabledByPolicy: 'PIP_DISABLED_BY_POLICY',
  PipDisabledByPage: 'PIP_DISABLED_BY_PAGE',
  NeedsUserGesture: 'NEEDS_USER_GESTURE',
  VideoNotReady: 'VIDEO_NOT_READY',
  PlaybackBlocked: 'PLAYBACK_BLOCKED',
  PageNotAccessible: 'PAGE_NOT_ACCESSIBLE',
  NoActiveTab: 'NO_ACTIVE_TAB',
  Unknown: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const MESSAGES: Record<ErrorCode, string> = {
  NO_VIDEO: 'No se detectó ningún video HTML5 en esta página.',
  VIDEO_NOT_FOUND: 'El video seleccionado ya no está en la página. Vuelve a abrir el panel.',
  PIP_UNSUPPORTED: 'Este navegador no admite Picture-in-Picture para este video.',
  PIP_DISABLED_BY_POLICY: 'La página tiene Picture-in-Picture desactivado mediante su política de permisos.',
  PIP_DISABLED_BY_PAGE: 'El sitio desactivó Picture-in-Picture para este video (disablePictureInPicture).',
  NEEDS_USER_GESTURE:
    'El navegador exige un clic directo en la página. Pulsa el botón «Abrir ventana flotante» que apareció sobre el video.',
  VIDEO_NOT_READY: 'El video todavía no está listo (sin datos o sin pista de imagen). Inicia la reproducción e inténtalo de nuevo.',
  PLAYBACK_BLOCKED: 'El navegador bloqueó la reproducción. Haz clic en el video para iniciarla.',
  PAGE_NOT_ACCESSIBLE:
    'La extensión no puede acceder a esta página (páginas internas del navegador, tiendas de extensiones o sitios sin permiso).',
  NO_ACTIVE_TAB: 'No se encontró una pestaña activa.',
  UNKNOWN: 'Ocurrió un error inesperado.',
};

export class ExtensionError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = 'ExtensionError';
    this.code = code;
  }
}

export function messageFor(code: ErrorCode): string {
  return MESSAGES[code];
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in MESSAGES;
}

/** Convierte cualquier error en un objeto clonable para cruzar el límite del executeScript. */
export function serializeError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof ExtensionError) return { code: error.code, message: error.message };
  const text = error instanceof Error ? error.message : String(error);
  return { code: ErrorCode.Unknown, message: `${MESSAGES.UNKNOWN} ${text}`.trim() };
}

/** Traduce los DOMException de requestPictureInPicture() a nuestros códigos. */
export function fromPipDomException(error: unknown, policyEnabled: boolean): ExtensionError {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
      return new ExtensionError(policyEnabled ? ErrorCode.NeedsUserGesture : ErrorCode.PipDisabledByPolicy);
    case 'InvalidStateError':
      return new ExtensionError(ErrorCode.VideoNotReady);
    case 'NotSupportedError':
      return new ExtensionError(ErrorCode.PipUnsupported);
    case 'SecurityError':
      return new ExtensionError(ErrorCode.PipDisabledByPolicy);
    default:
      return new ExtensionError(ErrorCode.Unknown, error instanceof Error ? error.message : String(error));
  }
}
