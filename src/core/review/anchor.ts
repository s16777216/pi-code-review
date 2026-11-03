import { createHash } from 'node:crypto';

/** A wording- and line-number-independent key for a finding's location: the
 * first 16 hex characters of SHA-256 over the file path, a line break, and the
 * line's text with leading and trailing white space removed. The same code at
 * a different line, or with different indentation, gets the same anchor. The
 * hash keeps the code text itself out of the comment marker. */
export function computeAnchor(file: string, lineText: string): string {
  return createHash('sha256').update(`${file}\n${lineText.trim()}`).digest('hex').slice(0, 16);
}
