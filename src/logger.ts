import pino from 'pino';

export type Logger = pino.Logger;

/** Paths `pino`'s own redact feature masks, regardless of what a call site
 * logs. This is the structural guarantee that a secret never reaches log
 * output, even if a future call site logs a whole options object instead of
 * picking individual fields. */
const REDACT_PATHS = ['headers["PRIVATE-TOKEN"]', '*.headers["PRIVATE-TOKEN"]', 'apiKey', '*.apiKey'];

/** Receives each `info` and `warn` line: the level, the message, and the
 * fields without the redacted keys (`export-review-traces` design, Decision 6). */
export type LogSink = (level: string, message: string, fields: Record<string, unknown>) => void;

/** The fields without `headers` and `apiKey`, the keys that `REDACT_PATHS` masks. */
function withoutSecrets(fields: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'headers' && key !== 'apiKey'));
}

/** The one logger every command builds. `info` (the default) shows normal
 * progress messages; `--debug` raises the level to `debug` to also show
 * GitLab request details and the AI prompt/response. Always pretty-printed
 * to stderr, so every log line — progress and debug alike — looks and
 * behaves the same way. */
export function buildLogger(debug: boolean, sink?: LogSink): Logger {
  return pino({
    level: debug ? 'debug' : 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    ...(sink === undefined
      ? {}
      : {
          hooks: {
            logMethod(args, method, level) {
              if (level === pino.levels.values.info || level === pino.levels.values.warn) {
                const [first, second] = args as unknown[];
                if (typeof first === 'string') sink(pino.levels.labels[level]!, first, {});
                else if (typeof first === 'object' && first !== null) {
                  sink(pino.levels.labels[level]!, typeof second === 'string' ? second : '', withoutSecrets(first));
                }
              }
              return method.apply(this, args);
            },
          },
        }),
    transport: { target: 'pino-pretty', options: { destination: 2 } },
  });
}

/** A no-op logger for library classes' default when no logger is injected —
 * mainly for tests that construct `GitLabClient`/`AgentReviewEngine`/
 * `GitLabSinkProvider` directly and don't care about log output. The CLI
 * always passes a real logger built by `buildLogger()`. */
export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}
