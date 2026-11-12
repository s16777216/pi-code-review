import type { FailureCategory, ReviewWarning, UnreviewedFile, WarningCode } from '../types.ts';
import { UNREVIEWED_MARKER } from './marker.ts';

// The text of the review status comment (`harden-run-failures` design,
// Decision 6). The texts are fixed. The only content that comes from the
// findings file is the file paths. The text of an error never gets here.

/** What `review` tells `publish` about the quality of the review. */
export interface ReviewStatus {
  /** Set when the review failed. */
  failed?: { category: FailureCategory };
  warnings: ReviewWarning[];
}

const FAILURE_SENTENCES: Record<FailureCategory, string> = {
  model_failed: 'A model call failed after 3 tries.',
  output_cut: 'The model output was cut at the token limit, also after one retry with a larger limit.',
  too_large: 'The change is too large for the context window of the model.',
  other: 'The review stopped because of an error. See the job log.',
};

/** The warning texts, in the order in which the comment shows them. A code
 * with a list of files has the `lead` text, and then the paths. */
const WARNING_ORDER: readonly WarningCode[] = ['deduplication_failed', 'verification_failed', 'verification_skipped'];

const WARNING_LEADS: Record<WarningCode, string> = {
  deduplication_failed: 'The step that removes duplicate findings failed. Some comments may repeat.',
  verification_failed: 'The check of the findings failed for these files. Their findings are not verified:',
  verification_skipped: 'These files are too large for the check of the findings. Their findings are not verified:',
};

const REVIEWED_SENTENCE = 'Every changed file was reviewed in the latest review.';

export function failureText(category: FailureCategory): string {
  return `**Review failed:** ${FAILURE_SENTENCES[category]} No finding was posted.`;
}

function pathList(paths: string[]): string {
  return paths.map((path) => `- \`${path}\``).join('\n');
}

/** One text for each warning code that the list has. */
export function warningTexts(warnings: ReviewWarning[]): string[] {
  const texts: string[] = [];
  for (const code of WARNING_ORDER) {
    const ofCode = warnings.filter((warning) => warning.code === code);
    if (ofCode.length === 0) continue;
    if (code === 'deduplication_failed') {
      texts.push(`**Warning:** ${WARNING_LEADS[code]}`);
      continue;
    }
    const paths = ofCode.map((warning) => warning.file ?? '').filter((path) => path.length > 0);
    texts.push(`**Warning:** ${WARNING_LEADS[code]}\n\n${pathList(paths)}`);
  }
  return texts;
}

/** The paths of the files that the host left out because they are too large. */
export function tooLargePaths(unreviewedFiles: UnreviewedFile[]): string[] {
  return unreviewedFiles.filter((file) => file.reason === 'too_large').map((file) => file.path);
}

/** True when the comment has something to report: a failure, a warning, or a
 * file too large. Without any, the comment is only updated if it exists. */
export function hasStatusToReport(status: ReviewStatus, unreviewedFiles: UnreviewedFile[]): boolean {
  return status.failed !== undefined || status.warnings.length > 0 || tooLargePaths(unreviewedFiles).length > 0;
}

/** The body of the review status comment: the marker line, then the failure
 * text, the warning texts, and the list of files too large, each as its own
 * paragraph. The body ends with the sentence that every changed file was
 * reviewed when the review did not fail and no file is too large. A body for
 * a file too large, or for a clean review, equals the body of the comment
 * that older versions posted. */
export function formatStatusBody(status: ReviewStatus, unreviewedFiles: UnreviewedFile[]): string {
  const parts: string[] = [];
  if (status.failed !== undefined) parts.push(failureText(status.failed.category));
  parts.push(...warningTexts(status.warnings));

  const tooLarge = tooLargePaths(unreviewedFiles);
  if (tooLarge.length > 0) {
    const what = tooLarge.length === 1 ? 'this file' : 'these files';
    parts.push(
      `**Not reviewed:** GitLab did not return the diff of ${what}, because it is too large. Review the change by hand.\n\n${pathList(tooLarge)}`,
    );
  }
  if (status.failed === undefined && tooLarge.length === 0) parts.push(REVIEWED_SENTENCE);

  return `${UNREVIEWED_MARKER}\n${parts.join('\n\n')}`;
}
