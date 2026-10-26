import type { BrowserAdapter, FrameResult } from '../adapters/browser-adapter.ts';
import { ErrorCode, messageFor } from '../utils/errors.ts';
import { CONTENT_API_KEY, type ContentApi, type ContentMethod } from './content-api.ts';
import type { ActionResult } from './types.ts';

type MethodResult<M extends ContentMethod> = Awaited<ReturnType<ContentApi[M]>>;

/**
 * Función autocontenida que se serializa y ejecuta en el frame (mundo aislado,
 * el mismo del content script). No puede referenciar nada externo.
 */
function callInFrame(key: string, method: string, args: unknown[]): unknown {
  const api = (globalThis as unknown as Record<string, Record<string, (...a: unknown[]) => unknown> | undefined>)[key];
  if (!api) return { ok: false, error: { code: 'PAGE_NOT_ACCESSIBLE', message: 'content script ausente' } };
  return api[method]!(...args);
}

/** Algunos motores podrían no esperar promesas devueltas por executeScript; se valida la forma. */
export function isActionResult(value: unknown): value is ActionResult<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';
}

export function unknownResult(): ActionResult<never> {
  return { ok: false, error: { code: ErrorCode.Unknown, message: messageFor(ErrorCode.Unknown) } };
}

/**
 * Invoca un método del content script. La llamada a executeScript ocurre de
 * forma síncrona (antes de cualquier await) para conservar el gesto del usuario.
 */
export function invokeContent<M extends ContentMethod>(
  adapter: BrowserAdapter,
  tabId: number,
  frames: readonly number[] | 'all',
  method: M,
  ...args: Parameters<ContentApi[M]>
): Promise<FrameResult<MethodResult<M>>[]> {
  return adapter.runInFrames(tabId, frames, callInFrame, [CONTENT_API_KEY, method, args]) as Promise<
    FrameResult<MethodResult<M>>[]
  >;
}
