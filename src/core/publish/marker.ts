/** Every comment this tool posts starts with an HTML comment that the host
 * does not render. It lets a later run tell its own discussions from a person's.
 * Detection checks only the prefix, so a later version can add data inside
 * the marker without breaking older readers. */
export const MARKER_PREFIX = '<!-- pi-code-review';
export const MARKER = '<!-- pi-code-review -->';

/** True when `body` starts with this tool's marker. */
export function hasMarker(body: string): boolean {
  return body.startsWith(MARKER_PREFIX);
}

/** `body` without a leading marker line, for showing a comment to the agent. */
export function stripMarker(body: string): string {
  if (!hasMarker(body)) return body;
  const end = body.indexOf('-->');
  return end === -1 ? body : body.slice(end + 3).replace(/^\r?\n/, '');
}

/** The marker of the review status comment: the general comment that tells a
 * failure, the warnings, and the files too large to review. The word
 * "unreviewed" stays from the first version of this comment, so the comment
 * of an older run is still found and updated. It has no `anchor=`, so the
 * anchor match never uses this comment. */
export const UNREVIEWED_MARKER = '<!-- pi-code-review unreviewed -->';
