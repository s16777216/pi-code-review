import type { Severity } from "./types.ts";

export type FailOnSeverity = Severity | "none";
export type GitLabAuthHeader = "JOB-TOKEN" | "PRIVATE-TOKEN";

const VALID_FAIL_ON_SEVERITY: FailOnSeverity[] = ["important", "nit", "none"];
const VALID_GITLAB_AUTH_HEADERS: GitLabAuthHeader[] = ["JOB-TOKEN", "PRIVATE-TOKEN"];

export interface Config {
  gitlab: {
    apiUrl: string;
    projectId: string;
    mergeRequestIid: string;
    jobToken: string;
    /** Header to send `jobToken` under. Defaults to `JOB-TOKEN` (the real CI job
     * token, used in production). Set `GITLAB_AUTH_HEADER=PRIVATE-TOKEN` to put a
     * personal/project access token in `jobToken` instead, for manual local runs
     * against a real GitLab project outside CI. */
    authHeader: GitLabAuthHeader;
  };
  openai: {
    apiKey: string;
    model: string;
    baseUrl: string;
  };
  failOnSeverity: FailOnSeverity;
}

export class ConfigError extends Error {}

/** CLI-argument values for every config value, each taking priority over
 * its matching environment variable: a CLI flag wins whenever it is given,
 * and the environment variable is used only when the flag is absent. A
 * person supplies these by hand for a local manual run against a real
 * GitLab project (see `src/index.ts`'s `--gitlab-url`, `--project-id`,
 * `--mr`, `--model`, `--openai-base-url`, `--fail-on`, `--auth-header`,
 * `--openai-api-key`, `--job-token` flags).
 *
 * `apiKey` and `jobToken` are secrets. Passing a secret as a CLI flag puts
 * it in shell history and in `ps`/`/proc/<pid>/cmdline` output for anyone
 * else on the machine to read for as long as the process runs. This is a
 * known, accepted trade-off for local convenience (pulling a secret from a
 * local secret manager into a one-off command), not a recommended default —
 * prefer the environment variable whenever that is practical. */
export interface ConfigOverrides {
  apiUrl?: string;
  projectId?: string;
  mergeRequestIid?: string;
  model?: string;
  openaiBaseUrl?: string;
  failOnSeverity?: string;
  authHeader?: string;
  apiKey?: string;
  jobToken?: string;
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

/** True when the pipeline is a merge request pipeline. Checked before `loadConfig()`,
 * since a non-MR pipeline should skip the review without needing the other variables.
 * A CLI `--mr` value wins over `CI_MERGE_REQUEST_IID` when both are present. */
export function isMergeRequestPipeline(overrides: ConfigOverrides = {}): boolean {
  return Boolean(overrides.mergeRequestIid ?? process.env.CI_MERGE_REQUEST_IID);
}

export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const failOnSeverity = (overrides.failOnSeverity ?? process.env.FAIL_ON_SEVERITY ?? "important") as FailOnSeverity;
  if (!VALID_FAIL_ON_SEVERITY.includes(failOnSeverity)) {
    throw new ConfigError(
      `Invalid FAIL_ON_SEVERITY value: "${failOnSeverity}". Must be one of ${VALID_FAIL_ON_SEVERITY.join(", ")}.`,
    );
  }

  const authHeader = (overrides.authHeader ?? process.env.GITLAB_AUTH_HEADER ?? "JOB-TOKEN") as GitLabAuthHeader;
  if (!VALID_GITLAB_AUTH_HEADERS.includes(authHeader)) {
    throw new ConfigError(
      `Invalid GITLAB_AUTH_HEADER value: "${authHeader}". Must be one of ${VALID_GITLAB_AUTH_HEADERS.join(", ")}.`,
    );
  }

  return {
    gitlab: {
      apiUrl: resolve("CI_API_V4_URL", overrides.apiUrl),
      projectId: resolve("CI_PROJECT_ID", overrides.projectId),
      mergeRequestIid: resolve("CI_MERGE_REQUEST_IID", overrides.mergeRequestIid),
      jobToken: resolve("CI_JOB_TOKEN", overrides.jobToken),
      authHeader,
    },
    openai: {
      apiKey: resolve("OPENAI_API_KEY", overrides.apiKey),
      model: resolve("OPENAI_MODEL", overrides.model),
      baseUrl: resolve("OPENAI_BASE_URL", overrides.openaiBaseUrl),
    },
    failOnSeverity,
  };
}
