import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { errorMessage } from './core/errorMessage.ts';
import { silentLogger, type Logger } from './logger.ts';

/** The most characters that review instructions can have, counted as the
 * length of the JavaScript string after the text is trimmed
 * (`add-review-instructions` design, Decision 4). */
export const MAX_INSTRUCTIONS_CHARS = 8_000;

/** The name of an instructions source, as the logs and the specs write it. */
export type InstructionsSourceName =
  '--instructions' | '--instructions-text' | 'REVIEW_INSTRUCTIONS_FILE' | 'REVIEW_INSTRUCTIONS';

/** The flag values of `review`. `undefined` means the flag is not given. */
export interface InstructionsFlags {
  /** `--instructions`: a file path. */
  instructions?: string;
  /** `--instructions-text`: the text itself. */
  instructionsText?: string;
}

/** The review instructions that the review uses. */
export interface ResolvedInstructions {
  /** The text, trimmed, with LF line breaks. */
  text: string;
  /** The instructions source that gave the text. */
  source: InstructionsSourceName;
  /** For a path source, the absolute path of the file. A text source has none. */
  filePath?: string;
}

interface Candidate {
  name: InstructionsSourceName;
  kind: 'path' | 'text';
  /** `undefined` when the flag or the variable is not set. */
  value: string | undefined;
}

/** What the program found in one source: the text, or why it cannot use it. */
type Attempt = { ok: true; text: string; filePath?: string } | { ok: false; reason: string };

/** Reads the text of a path source. Never throws. */
function readFileText(value: string, cwd: string): Attempt {
  if (value.trim().length === 0) return { ok: false, reason: 'the path is an empty string' };
  const filePath = resolve(cwd, value);
  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    return { ok: false, reason: `cannot read the file "${value}": ${errorMessage(error)}` };
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), filePath };
  } catch {
    return { ok: false, reason: `the file "${value}" is not valid UTF-8 text` };
  }
}

/** Checks the text of a source: LF line breaks, no white space at the start
 * and the end, not empty, and at most `MAX_INSTRUCTIONS_CHARS` characters. */
function checkText(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) return { ok: false, reason: 'the text is empty' };
  if (text.length > MAX_INSTRUCTIONS_CHARS) {
    return {
      ok: false,
      reason: `the text has ${text.length} characters, and the limit is ${MAX_INSTRUCTIONS_CHARS}`,
    };
  }
  return { ok: true, text };
}

/** Picks the review instructions (`add-review-instructions` design,
 * Decision 2). The sources, in order of priority, are `--instructions`,
 * `--instructions-text`, `REVIEW_INSTRUCTIONS_FILE`, and
 * `REVIEW_INSTRUCTIONS`. A flag or a variable is set when it is present, even
 * with an empty value. The first usable source wins. A source that is set but
 * not usable writes one `warn` log line and the program tries the next one.
 * The program reads no file that no flag and no variable names. It never
 * throws: when no source is usable, it returns `undefined` and the review runs
 * as it did before this feature. */
export function resolveInstructions(
  flags: InstructionsFlags,
  logger: Logger = silentLogger(),
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): ResolvedInstructions | undefined {
  const candidates: Candidate[] = [
    { name: '--instructions', kind: 'path', value: flags.instructions },
    { name: '--instructions-text', kind: 'text', value: flags.instructionsText },
    { name: 'REVIEW_INSTRUCTIONS_FILE', kind: 'path', value: env.REVIEW_INSTRUCTIONS_FILE },
    { name: 'REVIEW_INSTRUCTIONS', kind: 'text', value: env.REVIEW_INSTRUCTIONS },
  ];

  for (const { name, kind, value } of candidates) {
    if (value === undefined) continue;

    const attempt: Attempt = kind === 'path' ? readFileText(value, cwd) : { ok: true, text: value };
    const checked = attempt.ok ? checkText(attempt.text) : attempt;
    if (!checked.ok) {
      logger.warn(
        { source: name, reason: checked.reason },
        `review instructions source ${name} is not usable (${checked.reason}); trying the next source`,
      );
      continue;
    }

    const filePath = attempt.ok ? attempt.filePath : undefined;
    logger.info(
      { source: name, characters: checked.text.length },
      `Using review instructions from ${name} (${checked.text.length} characters).`,
    );
    return { text: checked.text, source: name, ...(filePath === undefined ? {} : { filePath }) };
  }
  return undefined;
}

/** The path of a file relative to `cwd`, with the forward slash as the
 * separator. Returns `undefined` when the file is `cwd` itself or is outside it. */
export function relativeToCwd(filePath: string, cwd: string = process.cwd()): string | undefined {
  const relativePath = relative(cwd, filePath).replace(/\\/g, '/');
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    return undefined;
  }
  return relativePath;
}

/** True when the file of a path source is one of the files that the change
 * request changes (Decision 5). The comparison uses the path of the file
 * relative to `cwd` (see `relativeToCwd`) against the new path and the old
 * path of each changed file. A file outside `cwd` never matches. If `cwd` is
 * not the root of the project, the comparison can miss a changed file, or
 * match another file that has the same relative path. The warning is only a
 * log line, so a wrong match does no harm. */
export function changesInstructionsFile(
  filePath: string,
  changedPaths: readonly (string | null)[],
  cwd: string = process.cwd(),
): boolean {
  const relativePath = relativeToCwd(filePath, cwd);
  if (relativePath === undefined) {
    return false;
  }
  return changedPaths.some((path) => path !== null && path.replace(/\\/g, '/') === relativePath);
}
