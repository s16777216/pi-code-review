import type { Severity } from './core/types.ts';

export type FailOnSeverity = Severity | 'none';

const VALID_FAIL_ON_SEVERITY: FailOnSeverity[] = ['important', 'nit', 'none'];
const DEFAULT_MAX_TOKENS = 32_000;
const DEFAULT_CONTEXT_WINDOW = 128_000;

export class ConfigError extends Error {}

/** The GitLab connection fields both `review` and `publish` need. */
export interface GitlabConnectionConfig {
  apiUrl: string;
  projectId: string;
  mergeRequestIid: string;
  /** A GitLab personal or project access token (not a GitLab CI job token —
   * see `design.md`'s "Auth: always a personal/project access token"
   * decision), sent under the `PRIVATE-TOKEN` header. */
  token: string;
}

export interface ReviewConfig {
  gitlab: GitlabConnectionConfig;
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

export interface PublishConfig {
  gitlab: GitlabConnectionConfig;
  failOnSeverity: FailOnSeverity;
}

/** CLI-argument values for the GitLab connection fields, each taking
 * priority over its matching environment variable: a CLI flag wins whenever
 * it is given, and the environment variable is used only when the flag is
 * absent.
 *
 * `token` is a secret. Passing it as a CLI flag puts it in shell history
 * and in `ps`/`/proc/<pid>/cmdline` output for anyone else on the machine to
 * read for as long as the process runs. This is a known, accepted trade-off
 * for local convenience (pulling a secret from a local secret manager into a
 * one-off command), not a recommended default — prefer the environment
 * variable whenever that is practical. */
export interface GitlabConnectionOverrides {
  apiUrl?: string;
  projectId?: string;
  mergeRequestIid?: string;
  token?: string;
}

export interface ReviewConfigOverrides extends GitlabConnectionOverrides {
  model?: string;
  openaiBaseUrl?: string;
  /** Secret — see `GitlabConnectionOverrides`'s doc comment for the same trade-off. */
  apiKey?: string;
  /** Raw string from the CLI flag; `loadReviewConfig()` parses and validates it. */
  maxTokens?: string;
  /** Raw string from the CLI flag; `loadReviewConfig()` parses and validates it. */
  contextWindow?: string;
  language?: string;
}

export interface PublishConfigOverrides extends GitlabConnectionOverrides {
  failOnSeverity?: string;
}

/** Reads `override` if given, falling back to `envName`'s environment
 * variable only when `override` is not set. A CLI flag always wins over
 * its matching environment variable when both are present. */
function resolve(envName: string, override: string | undefined): string {
  const value = override ?? process.env[envName];
  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${envName}`);
  }
  return value;
}

/** True when the pipeline is a merge request pipeline. Checked before `loadReviewConfig()`,
 * since a non-MR pipeline should skip the review without needing the other variables.
 * A CLI `--mr` value wins over `CI_MERGE_REQUEST_IID` when both are present. */
export function isMergeRequestPipeline(overrides: { mergeRequestIid?: string } = {}): boolean {
  return Boolean(overrides.mergeRequestIid ?? process.env.CI_MERGE_REQUEST_IID);
}

function loadGitlabConnectionConfig(overrides: GitlabConnectionOverrides): GitlabConnectionConfig {
  return {
    apiUrl: resolve('CI_API_V4_URL', overrides.apiUrl),
    projectId: resolve('CI_PROJECT_ID', overrides.projectId),
    mergeRequestIid: resolve('CI_MERGE_REQUEST_IID', overrides.mergeRequestIid),
    token: resolve('GITLAB_TOKEN', overrides.token),
  };
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

/** Resolves config for the `review` command: GitLab connection + OpenAI.
 * Never requires `FAIL_ON_SEVERITY` — `review` has no pass/fail concept. */
export function loadReviewConfig(overrides: ReviewConfigOverrides = {}): ReviewConfig {
  const maxTokens = resolveMaxTokens(overrides.maxTokens);
  const language = resolveLanguage(overrides.language);
  return {
    gitlab: loadGitlabConnectionConfig(overrides),
    ...(language === undefined ? {} : { language }),
    openai: {
      apiKey: resolve('OPENAI_API_KEY', overrides.apiKey),
      model: resolve('OPENAI_MODEL', overrides.model),
      baseUrl: resolve('OPENAI_BASE_URL', overrides.openaiBaseUrl),
      maxTokens,
      contextWindow: resolveContextWindow(overrides.contextWindow, maxTokens),
    },
  };
}

/** Resolves config for the `publish` command: GitLab connection + the
 * severity threshold. Never requires `OPENAI_API_KEY`/`OPENAI_MODEL`/
 * `OPENAI_BASE_URL` — `publish` never contacts OpenAI. */
export function loadPublishConfig(overrides: PublishConfigOverrides = {}): PublishConfig {
  const failOnSeverity = (overrides.failOnSeverity ?? process.env.FAIL_ON_SEVERITY ?? 'important') as FailOnSeverity;
  if (!VALID_FAIL_ON_SEVERITY.includes(failOnSeverity)) {
    throw new ConfigError(
      `Invalid FAIL_ON_SEVERITY value: "${failOnSeverity}". Must be one of ${VALID_FAIL_ON_SEVERITY.join(', ')}.`,
    );
  }

  return {
    gitlab: loadGitlabConnectionConfig(overrides),
    failOnSeverity,
  };
}
