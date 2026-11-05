import type { Logger } from '../../logger.ts';
import { errorMessage } from '../errorMessage.ts';
import type { Finding, ReviewContext } from '../types.ts';
import type { BatchItem } from './batch.ts';
import type { ChangeSet } from './changedFile.ts';
import { ReviewFailureError } from './findings.ts';
import { buildBatchPrompt, buildWholePrompt } from './prompt.ts';

/** What one agent run covers: the whole change, or one batch of it
 * (`model-diffs-and-run-scopes` design, Decision 3). The engine runs a list of
 * scopes the same way and never asks which kind a scope is: each kind answers
 * for itself. */
export interface RunScope {
  /** A paragraph for the end of the system prompt, or `null`. */
  systemPromptParagraph(): string | null;
  /** The user prompt of the run. */
  prompt(context: ReviewContext, changes: ChangeSet): string;
  /** Fields for the debug and retry log lines of the run. */
  logFields(): { batch?: number };
  /** Drops the findings that are outside what this run covers. */
  filterFindings(findings: Finding[], changes: ChangeSet, logger: Logger): Finding[];
  /** The error to report when the run fails for good. */
  describeFailure(error: unknown): unknown;
}

/** A run over the whole change: the agent sees every diff. */
export class WholeChange implements RunScope {
  systemPromptParagraph(): null {
    return null;
  }

  prompt(context: ReviewContext, changes: ChangeSet): string {
    return buildWholePrompt(context, changes);
  }

  logFields(): { batch?: number } {
    return {};
  }

  filterFindings(findings: Finding[]): Finding[] {
    return findings;
  }

  describeFailure(error: unknown): unknown {
    return error;
  }
}

/** A run over one batch of a change that is too large for one run: the agent
 * sees the list of every file, but only this batch's diffs. `index` and
 * `count` start at 1. */
export class Batch implements RunScope {
  constructor(
    readonly items: readonly BatchItem[],
    readonly index: number,
    readonly count: number,
  ) {}

  systemPromptParagraph(): string {
    return `This change is too large for one review, so it is split into ${this.count} parts, and you review part ${this.index}. The prompt lists every changed file, but shows only the diffs of this part. Report only problems on the numbered lines of this part's diffs. When you need code from another part, read it with get_file_content.`;
  }

  prompt(context: ReviewContext, changes: ChangeSet): string {
    return buildBatchPrompt(context, changes, this.items, this.index, this.count);
  }

  logFields(): { batch: number } {
    return { batch: this.index };
  }

  /** Drops a finding that is on a line of the change's diff but not of this
   * batch's own items, with the reason `outside_batch` (`review-large-
   * changes-in-batches` design, Decision 5). A finding that is not on the
   * change's diff at all is left for the diff line check, which logs its own
   * reason. A file can have more than one item in a batch (its parts), so a
   * line is the batch's own when any item of that path has it. */
  filterFindings(findings: Finding[], changes: ChangeSet, logger: Logger): Finding[] {
    const ownItems = (path: string) => this.items.filter((item) => item.file.newPath === path);

    return findings.filter((finding) => {
      if (changes.isOmitted(finding.file)) return true; // dropped by `runChecks` as `diff_omitted`
      if (changes.lineCheck(finding.file, finding.line) !== 'ok') return true;
      if (ownItems(finding.file).some((item) => item.file.hasNewLine(finding.line))) return true;
      logger.warn(
        { file: finding.file, line: finding.line, batch: this.index, reason: 'outside_batch' },
        'discarded a finding that is outside its batch',
      );
      return false;
    });
  }

  describeFailure(error: unknown): ReviewFailureError {
    return new ReviewFailureError(`Batch ${this.index} of ${this.count} failed: ${errorMessage(error)}`);
  }
}
