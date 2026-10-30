import type { Severity } from "./types.ts";

export type FailOnSeverity = Severity | "none";

const VALID_FAIL_ON_SEVERITY: FailOnSeverity[] = ["important", "nit", "none"];

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
  openai: {
    apiKey: string;
    model: string;
    baseUrl: string;
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
    apiUrl: resolve("CI_API_V4_URL", overrides.apiUrl),
    projectId: resolve("CI_PROJECT_ID", overrides.projectId),
    mergeRequestIid: resolve("CI_MERGE_REQUEST_IID", overrides.mergeRequestIid),
    token: resolve("GITLAB_TOKEN", overrides.token),
  };
}

/** Resolves config for the `review` command: GitLab connection + OpenAI.
 * Never requires `FAIL_ON_SEVERITY` — `review` has no pass/fail concept. */
export function loadReviewConfig(overrides: ReviewConfigOverrides = {}): ReviewConfig {
  return {
    gitlab: loadGitlabConnectionConfig(overrides),
    openai: {
      apiKey: resolve("OPENAI_API_KEY", overrides.apiKey),
      model: resolve("OPENAI_MODEL", overrides.model),
      baseUrl: resolve("OPENAI_BASE_URL", overrides.openaiBaseUrl),
    },
  };
}

/** Resolves config for the `publish` command: GitLab connection + the
 * severity threshold. Never requires `OPENAI_API_KEY`/`OPENAI_MODEL`/
 * `OPENAI_BASE_URL` — `publish` never contacts OpenAI. */
export function loadPublishConfig(overrides: PublishConfigOverrides = {}): PublishConfig {
  const failOnSeverity = (overrides.failOnSeverity ?? process.env.FAIL_ON_SEVERITY ?? "important") as FailOnSeverity;
  if (!VALID_FAIL_ON_SEVERITY.includes(failOnSeverity)) {
    throw new ConfigError(
      `Invalid FAIL_ON_SEVERITY value: "${failOnSeverity}". Must be one of ${VALID_FAIL_ON_SEVERITY.join(", ")}.`,
    );
  }

  return {
    gitlab: loadGitlabConnectionConfig(overrides),
    failOnSeverity,
  };
}
