import { requireSetting } from '../../settings.ts';

/** The GitLab fields that `publish` needs. It takes the project and the merge
 * request from the findings file (`publish-target-from-findings` design). */
export interface GitlabPublishConfig {
  apiUrl: string;
  /** A GitLab personal or project access token (not a GitLab CI job token —
   * see `design.md`'s "Auth: always a personal/project access token"
   * decision), sent under the `PRIVATE-TOKEN` header. */
  token: string;
}

/** The GitLab fields that `review` needs: the publish fields, plus the merge
 * request to read. */
export interface GitlabConnectionConfig extends GitlabPublishConfig {
  projectId: string;
  mergeRequestIid: string;
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

/** True when the pipeline is a merge request pipeline. Checked before `loadReviewConfig()`,
 * since a non-MR pipeline should skip the review without needing the other variables.
 * A CLI `--mr` value wins over `CI_MERGE_REQUEST_IID` when both are present. */
export function isMergeRequestPipeline(overrides: { mergeRequestIid?: string } = {}): boolean {
  return Boolean(overrides.mergeRequestIid ?? process.env.CI_MERGE_REQUEST_IID);
}

/** Reads the GitLab settings for `publish`, in this order: `CI_API_V4_URL`,
 * `GITLAB_TOKEN`. It never reads the project or the merge request. */
export function loadGitlabPublishConfig(overrides: GitlabConnectionOverrides): GitlabPublishConfig {
  return {
    apiUrl: requireSetting('CI_API_V4_URL', overrides.apiUrl),
    token: requireSetting('GITLAB_TOKEN', overrides.token),
  };
}

/** Reads the GitLab connection settings for `review`, in this order: `CI_API_V4_URL`,
 * `CI_PROJECT_ID`, `CI_MERGE_REQUEST_IID`, `GITLAB_TOKEN`. The first one
 * that is missing is named in the `ConfigError`. */
export function loadGitlabConnectionConfig(overrides: GitlabConnectionOverrides): GitlabConnectionConfig {
  return {
    apiUrl: requireSetting('CI_API_V4_URL', overrides.apiUrl),
    projectId: requireSetting('CI_PROJECT_ID', overrides.projectId),
    mergeRequestIid: requireSetting('CI_MERGE_REQUEST_IID', overrides.mergeRequestIid),
    token: requireSetting('GITLAB_TOKEN', overrides.token),
  };
}
