import { silentLogger, type Logger } from '../../logger.ts';
import type { SinkProvider } from '../../core/review/providers.ts';
import type { Finding } from '../../core/types.ts';
import type { GitLabDiffRefs, MergeRequestWriter } from './client.ts';

export interface GitLabSinkProviderOptions {
  client: MergeRequestWriter;
  mergeRequestIid: string;
  diffRefs: GitLabDiffRefs;
  /** Injectable for tests; defaults to logging via `logger.error`. */
  onDiscussionError?: (finding: Finding, error: unknown) => void;
  /** Defaults to a silent logger, so existing call sites and tests are unaffected. */
  logger?: Logger;
}

export class GitLabSinkProvider implements SinkProvider {
  private readonly logger: Logger;

  constructor(private readonly options: GitLabSinkProviderOptions) {
    this.logger = options.logger ?? silentLogger();
  }

  async publish(findings: Finding[]): Promise<void> {
    await Promise.all(findings.map((finding) => this.postDiscussion(finding)));
  }

  private async postDiscussion(finding: Finding): Promise<void> {
    const { client, mergeRequestIid, diffRefs, onDiscussionError } = this.options;
    try {
      await client.createDiscussion(mergeRequestIid, formatDiscussionBody(finding), {
        ...diffRefs,
        oldPath: finding.file,
        newPath: finding.file,
        newLine: finding.line,
      });
    } catch (error) {
      if (onDiscussionError) {
        onDiscussionError(finding, error);
      } else {
        this.logger.error(
          { file: finding.file, line: finding.line, error: error instanceof Error ? error.message : String(error) },
          'failed to post discussion',
        );
      }
    }
  }
}

function formatDiscussionBody(finding: Finding): string {
  return `**[${finding.severity}]** ${finding.summary}`;
}
