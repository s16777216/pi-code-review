import type { FailOnSeverity } from './core/types.ts';
import { ConfigError, requireSetting } from './settings.ts';

const VALID_FAIL_ON_SEVERITY: FailOnSeverity[] = ['critical', 'high', 'medium', 'low', 'none'];
const DEFAULT_MAX_TOKENS = 32_000;
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** The settings of `review` that do not depend on the host. The host reads
 * its own settings (`CodeHost.connect`). */
export interface ReviewConfig {
  /** Optional language for finding summaries, e.g. "Traditional Chinese".
   * Undefined keeps the default (English) output. */
  language?: string;
  openai: {
    apiKey: string;
    model: string;
    baseUrl: string;
    maxTokens: number;
    /** The model's context window in tokens. `pi-ai` uses it to cap each
     * answer at `contextWindow - estimated input - 4096`, and the engine uses
     * it to refuse an input that leaves no room for an answer. */
    contextWindow: number;
  };
}

/** The settings of `publish` that do not depend on the host. */
export interface PublishConfig {
  failOnSeverity: FailOnSeverity;
}

export interface ReviewConfigOverrides {
  model?: string;
  openaiBaseUrl?: string;
  /** Secret. Passing it as a CLI flag puts it in shell history and in
   * `ps`/`/proc/<pid>/cmdline` output for as long as the process runs: an
   * accepted trade-off for local convenience, not a recommended default. */
  apiKey?: string;
  /** Raw string from the CLI flag; `loadReviewConfig()` parses and validates it. */
  maxTokens?: string;
  /** Raw string from the CLI flag; `loadReviewConfig()` parses and validates it. */
  contextWindow?: string;
  language?: string;
}

export interface PublishConfigOverrides {
  failOnSeverity?: string;
}

/** `--max-tokens`/`OPENAI_MAX_TOKENS` is optional with a default, unlike
 * every other OpenAI setting — the model still runs without it. A CLI flag
 * wins over the environment variable, same as everything else. */
function resolveMaxTokens(override: string | undefined): number {
  const raw = override ?? process.env.OPENAI_MAX_TOKENS;
  if (raw === undefined) {
    return DEFAULT_MAX_TOKENS;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`Invalid OPENAI_MAX_TOKENS value: "${raw}". Must be a positive integer.`);
  }
  return value;
}

/** `--context-window`/`OPENAI_CONTEXT_WINDOW` is optional with a default,
 * like `--max-tokens`. It must be larger than `maxTokens`: a smaller window
 * cannot hold the answer that `maxTokens` asks for. */
function resolveContextWindow(override: string | undefined, maxTokens: number): number {
  const raw = override ?? process.env.OPENAI_CONTEXT_WINDOW;
  if (raw === undefined) {
    if (DEFAULT_CONTEXT_WINDOW <= maxTokens) {
      throw new ConfigError(
        `The default context window (${DEFAULT_CONTEXT_WINDOW}) is not larger than OPENAI_MAX_TOKENS (${maxTokens}). Set OPENAI_CONTEXT_WINDOW.`,
      );
    }
    return DEFAULT_CONTEXT_WINDOW;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`Invalid OPENAI_CONTEXT_WINDOW value: "${raw}". Must be a positive integer.`);
  }
  if (value <= maxTokens) {
    throw new ConfigError(
      `Invalid OPENAI_CONTEXT_WINDOW value: ${value}. Must be larger than OPENAI_MAX_TOKENS (${maxTokens}).`,
    );
  }
  return value;
}

const MAX_LANGUAGE_LENGTH = 64;

/** `--language`/`REVIEW_LANGUAGE` is optional with no default. The value goes
 * into the system prompt as written, so it must stay one short name: not
 * empty, at most 64 characters, and no line break. */
function resolveLanguage(override: string | undefined): string | undefined {
  const raw = override ?? process.env.REVIEW_LANGUAGE;
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (value.length === 0) {
    throw new ConfigError('Invalid REVIEW_LANGUAGE value: it is empty. Unset it, or give a language name.');
  }
  if (value.length > MAX_LANGUAGE_LENGTH) {
    throw new ConfigError(`Invalid REVIEW_LANGUAGE value: it is longer than ${MAX_LANGUAGE_LENGTH} characters.`);
  }
  if (/[\r\n]/.test(value)) {
    throw new ConfigError('Invalid REVIEW_LANGUAGE value: it contains a line break.');
  }
  return value;
}

/** Resolves config for the `review` command: OpenAI and the language.
 * Never requires `FAIL_ON_SEVERITY` — `review` has no pass/fail concept.
 *
 * `readHostSettings` reads the host's own settings. It is called after
 * `--max-tokens` and `--language` and before the required OpenAI settings,
 * so the first bad setting is reported in the same order for every host. */
export function loadReviewConfig(overrides: ReviewConfigOverrides = {}, readHostSettings?: () => void): ReviewConfig {
  const maxTokens = resolveMaxTokens(overrides.maxTokens);
  const language = resolveLanguage(overrides.language);
  readHostSettings?.();
  return {
    ...(language === undefined ? {} : { language }),
    openai: {
      apiKey: requireSetting('OPENAI_API_KEY', overrides.apiKey),
      model: requireSetting('OPENAI_MODEL', overrides.model),
      baseUrl: requireSetting('OPENAI_BASE_URL', overrides.openaiBaseUrl),
      maxTokens,
      contextWindow: resolveContextWindow(overrides.contextWindow, maxTokens),
    },
  };
}

/** Resolves config for the `publish` command: the severity threshold. Never
 * requires `OPENAI_API_KEY`/`OPENAI_MODEL`/`OPENAI_BASE_URL` — `publish`
 * never contacts OpenAI. `readHostSettings` reads the host's own settings,
 * after the threshold is checked (see `loadReviewConfig`). */
export function loadPublishConfig(
  overrides: PublishConfigOverrides = {},
  readHostSettings?: () => void,
): PublishConfig {
  const failOnSeverity = (overrides.failOnSeverity ?? process.env.FAIL_ON_SEVERITY ?? 'high') as FailOnSeverity;
  if (!VALID_FAIL_ON_SEVERITY.includes(failOnSeverity)) {
    throw new ConfigError(
      `Invalid FAIL_ON_SEVERITY value: "${failOnSeverity}". Must be one of ${VALID_FAIL_ON_SEVERITY.join(', ')}.`,
    );
  }

  readHostSettings?.();
  return { failOnSeverity };
}
