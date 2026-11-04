import type { CodeHost, HostFlags } from '../../core/ports.ts';
import { GitLabClient, type GitLabDiffRefs } from './client.ts';
import {
  isMergeRequestPipeline,
  loadGitlabConnectionConfig,
  type GitlabConnectionConfig,
  type GitlabConnectionOverrides,
} from './config.ts';
import { parseGitLabDiffRefs } from './diffRefs.ts';
import { GitLabMergeRequest } from './mergeRequest.ts';

/** The GitLab CLI flags, and the settings they set. */
const FLAGS = {
  'gitlab-url': 'apiUrl',
  'project-id': 'projectId',
  mr: 'mergeRequestIid',
  token: 'token',
} as const satisfies Record<string, keyof GitlabConnectionOverrides>;

function toOverrides(flags: HostFlags): GitlabConnectionOverrides {
  const overrides: GitlabConnectionOverrides = {};
  for (const [flag, setting] of Object.entries(FLAGS)) {
    const value = flags[flag];
    if (value !== undefined) overrides[setting] = value;
  }
  return overrides;
}

/** GitLab as a `CodeHost` (`introduce-code-host` design, Decision 2). The
 * snapshot in the findings file is the merge request's diff refs. */
export const gitlabHost: CodeHost<GitLabDiffRefs, GitlabConnectionConfig> = {
  flags: Object.fromEntries(Object.keys(FLAGS).map((flag) => [flag, { type: 'string' as const }])),

  isChangeRequest(flags) {
    return isMergeRequestPipeline(toOverrides(flags));
  },

  readSettings(flags) {
    return loadGitlabConnectionConfig(toOverrides(flags));
  },

  async connect(settings, logger) {
    const client = await GitLabClient.create({
      apiUrl: settings.apiUrl,
      projectId: settings.projectId,
      token: settings.token,
      logger,
    });
    return {
      openChangeRequest: () => new GitLabMergeRequest(client, settings.mergeRequestIid),
      restore: (snapshot) => new GitLabMergeRequest(client, settings.mergeRequestIid, snapshot),
    };
  },

  parseSnapshot: parseGitLabDiffRefs,
};
