import type { Logger } from '../../logger.ts';
import type { SinkProvider } from '../../core/ports.ts';
import { Publisher } from '../../core/publish/publisher.ts';
import type { Finding, ResolvedDiscussion, UnreviewedFile } from '../../core/types.ts';
import type { GitLabDiffRefs, MergeRequestWriter } from './client.ts';
import { GitLabMergeRequest } from './mergeRequest.ts';

export interface GitLabSinkProviderOptions {
  client: MergeRequestWriter;
  mergeRequestIid: string;
  diffRefs: GitLabDiffRefs;
  /** Injectable for tests; defaults to logging via `logger.error`. */
  onDiscussionError?: (finding: Finding, error: unknown) => void;
  /** Defaults to a silent logger, so existing call sites and tests are unaffected. */
  logger?: Logger;
}

/** Publishes through the core `Publisher` on a `GitLabMergeRequest`. */
export class GitLabSinkProvider implements SinkProvider {
  constructor(private readonly options: GitLabSinkProviderOptions) {}

  async publish(
    findings: Finding[],
    resolved: ResolvedDiscussion[] = [],
    unreviewedFiles: UnreviewedFile[] = [],
  ): Promise<void> {
    const { client, mergeRequestIid, diffRefs, onDiscussionError, logger } = this.options;
    const publisher = new Publisher(new GitLabMergeRequest(client, mergeRequestIid, diffRefs), {
      ...(onDiscussionError ? { onDiscussionError } : {}),
      ...(logger ? { logger } : {}),
    });
    await publisher.publish(findings, resolved, unreviewedFiles);
  }
}
