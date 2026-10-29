import { writeFile } from 'node:fs/promises';
import { buildCodeQualityReport } from '../report/codeQuality.ts';
import type { SinkProvider } from '../review/providers.ts';
import type { Finding } from '../types.ts';
import type { GitLabDiffRefs, MergeRequestWriter } from './client.ts';

export interface GitLabSinkProviderOptions {
  client: MergeRequestWriter;
  mergeRequestIid: string;
  diffRefs: GitLabDiffRefs;
  /** Where to write the Code Quality report artifact. */
  codeQualityReportPath: string;
  /** Injectable for tests; defaults to `node:fs/promises`' `writeFile`. */
  writeReport?: (path: string, contents: string) => Promise<void>;
  /** Injectable for tests; defaults to `console.error`. */
  onDiscussionError?: (finding: Finding, error: unknown) => void;
}

export class GitLabSinkProvider implements SinkProvider {
  constructor(private readonly options: GitLabSinkProviderOptions) {}

  async publish(findings: Finding[]): Promise<void> {
    await Promise.all(findings.map((finding) => this.postDiscussion(finding)));
    await this.writeCodeQualityReport(findings);
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
      (onDiscussionError ?? defaultOnDiscussionError)(finding, error);
    }
  }

  private async writeCodeQualityReport(findings: Finding[]): Promise<void> {
    const report = buildCodeQualityReport(findings);
    const write = this.options.writeReport ?? ((path, contents) => writeFile(path, contents, 'utf8'));
    await write(this.options.codeQualityReportPath, JSON.stringify(report, null, 2));
  }
}

function formatDiscussionBody(finding: Finding): string {
  return `**[${finding.severity}]** ${finding.summary}`;
}

function defaultOnDiscussionError(finding: Finding, error: unknown): void {
  console.error(
    `Failed to post a discussion for ${finding.file}:${finding.line}: ${error instanceof Error ? error.message : String(error)}`,
  );
}
