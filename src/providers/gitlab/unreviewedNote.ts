import type { Logger } from '../../logger.ts';
import { errorMessage } from '../../core/errorMessage.ts';
import type { UnreviewedFile } from '../../core/types.ts';
import type { MergeRequestWriter } from './client.ts';
import { UNREVIEWED_MARKER } from '../../core/publish/marker.ts';
import type { UnreviewedNote } from '../../core/publish/discussion.ts';

/** Keeps one general comment from this tool that lists the files too large
 * to review (`handle-omitted-diffs` design, Decision 5):
 *
 * | Files too large | Existing comment | Action       |
 * |-----------------|------------------|--------------|
 * | some            | none             | create it    |
 * | some            | same body        | nothing      |
 * | some            | other body       | update it    |
 * | none            | none             | nothing      |
 * | none            | lists files      | update it to say every file was reviewed |
 *
 * Generated files are not listed. `note` is the existing comment, or `null`
 * when there is none or the discussions could not be read; then the comment
 * is created when files are too large. A failure is logged at `warn`, and
 * the caller goes on. */
export async function publishUnreviewedNote(
  target: { client: MergeRequestWriter; mergeRequestIid: string; logger: Logger },
  unreviewedFiles: UnreviewedFile[],
  note: UnreviewedNote | null,
): Promise<void> {
  const { client, mergeRequestIid, logger } = target;
  const tooLarge = unreviewedFiles.filter((file) => file.reason === 'too_large').map((file) => file.path);
  if (tooLarge.length === 0 && note === null) return;

  const body = formatUnreviewedBody(tooLarge);
  if (note !== null && note.body === body) return;

  try {
    if (note === null) await client.createNote(mergeRequestIid, body);
    else await client.updateNote(mergeRequestIid, note.id, body);
  } catch (error) {
    logger.warn(
      { files: tooLarge, error: errorMessage(error) },
      'could not post the comment on files too large to review',
    );
  }
}

/** The body of the comment on files too large to review, or, with no file,
 * the note that every changed file was reviewed. */
function formatUnreviewedBody(paths: string[]): string {
  if (paths.length === 0) {
    return `${UNREVIEWED_MARKER}\nEvery changed file was reviewed in the latest review.`;
  }
  const list = paths.map((path) => `- \`${path}\``).join('\n');
  const what = paths.length === 1 ? 'this file' : 'these files';
  return `${UNREVIEWED_MARKER}\n**Not reviewed:** GitLab did not return the diff of ${what}, because it is too large. Review the change by hand.\n\n${list}`;
}
