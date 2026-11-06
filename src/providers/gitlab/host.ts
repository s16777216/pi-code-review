import type { CodeHost, HostFlags } from '../../core/ports.ts';
import { GitLabClient, type GitLabDiffRefs } from './client.ts';
import {
  isMergeRequestPipeline,
  loadGitlabConnectionConfig,
  loadGitlabPublishConfig,
  type GitlabConnectionConfig,
  type GitlabConnectionOverrides,
  type GitlabPublishConfig,
} from './config.ts';
import { parseGitLabDiffRefs } from './diffRefs.ts';
import { GitLabMergeRequest } from './mergeRequest.ts';
import { parseGitLabSource, type GitLabSource } from './source.ts';

/** The GitLab CLI flags of `review`, and the settings they set. */
const REVIEW_FLAGS = {
  'gitlab-url': 'apiUrl',
  'project-id': 'projectId',
  mr: 'mergeRequestIid',
  token: 'token',
} as const satisfies Record<string, keyof GitlabConnectionOverrides>;

/** The GitLab CLI flags of `publish`. The project and the merge request come
 * from the findings file, so there is no flag for them. */
const PUBLISH_FLAGS = {
  'gitlab-url': 'apiUrl',
  token: 'token',
} as const satisfies Record<string, keyof GitlabConnectionOverrides>;

function toOverrides(
  flags: HostFlags,
  known: Record<string, keyof GitlabConnectionOverrides>,
): GitlabConnectionOverrides {
  const overrides: GitlabConnectionOverrides = {};
  for (const [flag, setting] of Object.entries(known)) {
    const value = flags[flag];
    if (value !== undefined) overrides[setting] = value;
  }
  return overrides;
}

function declare(known: Record<string, unknown>): Record<string, { type: 'string' }> {
  return Object.fromEntries(Object.keys(known).map((flag) => [flag, { type: 'string' as const }]));
}

/** GitLab as a `CodeHost` (`introduce-code-host` design, Decision 2). The
 * snapshot in the findings file is the merge request's diff refs. The source
 * is its project and its IID (`publish-target-from-findings` design). */
export const gitlabHost: CodeHost<GitLabDiffRefs, GitLabSource, GitlabConnectionConfig, GitlabPublishConfig> = {
  reviewFlags: declare(REVIEW_FLAGS),
  publishFlags: declare(PUBLISH_FLAGS),

  isChangeRequest(flags) {
    return isMergeRequestPipeline(toOverrides(flags, REVIEW_FLAGS));
  },

  readReviewSettings(flags) {
    return loadGitlabConnectionConfig(toOverrides(flags, REVIEW_FLAGS));
  },

  readPublishSettings(flags) {
    return loadGitlabPublishConfig(toOverrides(flags, PUBLISH_FLAGS));
  },

  async openChangeRequest(settings, logger) {
    const client = await GitLabClient.create({
      apiUrl: settings.apiUrl,
      projectId: settings.projectId,
      token: settings.token,
      logger,
    });
    return {
      changeRequest: new GitLabMergeRequest(client, settings.mergeRequestIid),
      source: { host: 'gitlab', projectId: settings.projectId, mergeRequestIid: settings.mergeRequestIid },
    };
  },

  async restore(settings, source, snapshot, logger) {
    const client = await GitLabClient.create({
      apiUrl: settings.apiUrl,
      projectId: source.projectId,
      token: settings.token,
      logger,
    });
    return new GitLabMergeRequest(client, source.mergeRequestIid, snapshot);
  },

  parseSnapshot: parseGitLabDiffRefs,
  parseSource: parseGitLabSource,
};
