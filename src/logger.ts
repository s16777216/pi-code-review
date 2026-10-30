import pino from 'pino';

export type Logger = pino.Logger;

/** Paths `pino`'s own redact feature masks, regardless of what a call site
 * logs. This is the structural guarantee that a secret never reaches debug
 * output, even if a future call site logs a whole options object instead of
 * picking individual fields. */
const REDACT_PATHS = ['headers["PRIVATE-TOKEN"]', '*.headers["PRIVATE-TOKEN"]', 'apiKey', '*.apiKey'];

/** Returns a silent logger when `debug` is false (the default), or a
 * `pino-pretty`-rendered logger at `debug` level when true. */
export function buildLogger(debug: boolean): Logger {
  if (!debug) {
    return pino({ level: 'silent' });
  }

  return pino({
    level: 'debug',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    transport: { target: 'pino-pretty', options: { destination: 2 } },
  });
}
