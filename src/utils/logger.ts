/** Logger mínimo: solo escribe en desarrollo y nunca envía datos fuera del navegador. */
export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(scope: string, enabled: boolean = __DEV__): Logger {
  const prefix = `[video-flotante:${scope}]`;
  return {
    debug: (...args) => {
      if (enabled) console.debug(prefix, ...args);
    },
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
