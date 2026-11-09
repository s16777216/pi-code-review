import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { silentLogger, type Logger } from '../../logger.ts';
import { errorMessage } from '../errorMessage.ts';

/** The text of the two comments that a person can change
 * (`publish-output-templates` design). A template is plain text with
 * `${name}` placeholders. */
export interface CommentTemplates {
  /** One finding. */
  finding: string;
  /** The reply that explains a resolved discussion. */
  resolved: string;
}

/** A template that is not valid, or a template file or directory that cannot
 * be read. The message names the file or the directory and the cause. */
export class TemplateError extends Error {}

/** The templates that give the comments the text they had before templates. */
export const DEFAULT_TEMPLATES: CommentTemplates = {
  finding: '**[${severity}]** ${summary}',
  resolved: 'Resolved: ${reason}',
};

/** What each template file may fill, and the one placeholder it MUST hold
 * (Decision 3: a comment without it loses the content). */
const TEMPLATE_FILES = {
  finding: { file: 'finding.md', names: ['severity', 'summary', 'file', 'line'], main: 'summary' },
  resolved: { file: 'resolved.md', names: ['reason'], main: 'reason' },
} as const;

/** Either the escape `\${`, or `${name}`. The escape comes first in the
 * pattern, so `\${summary}` is never read as a placeholder. */
const TOKEN = /\\\$\{|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Fills a template in one pass (Decision 2). `${name}` with a name in
 * `values` becomes its value, and `\${` becomes `${`. Any other text stays
 * as it is. A value is never read again, so a value that holds `${name}`
 * stays as it is. */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(TOKEN, (token, name: string | undefined) => {
    if (name === undefined) return '${';
    return Object.hasOwn(values, name) ? values[name]! : token;
  });
}

/** The names in `${name}` placeholders of a template, without the escaped
 * ones, in the order of the text. */
function placeholderNames(template: string): string[] {
  return [...template.matchAll(TOKEN)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

/** Checks one template (Decision 3). Throws `TemplateError` when the main
 * placeholder is missing. Writes one `warn` line, and goes on, when the
 * template has a `${name}` that the file does not fill. */
function checkTemplate(
  template: string,
  rule: (typeof TEMPLATE_FILES)[keyof typeof TEMPLATE_FILES],
  logger: Logger,
): void {
  const found = placeholderNames(template);
  if (!found.includes(rule.main)) {
    throw new TemplateError(`The template ${rule.file} must contain \${${rule.main}}.`);
  }
  const allowed: readonly string[] = rule.names;
  const unknown = [...new Set(found.filter((name) => !allowed.includes(name)))].map((name) => `\${${name}}`);
  if (unknown.length > 0) {
    logger.warn(
      { file: rule.file, placeholders: unknown },
      `the template ${rule.file} holds text that looks like a placeholder but is not one; it stays as plain text. Write \\\${name} to silence this line`,
    );
  }
}

/** Reads one template file, or `undefined` when the directory does not have it. */
async function readTemplateFile(dir: string, file: string): Promise<string | undefined> {
  const path = join(dir, file);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new TemplateError(`Cannot read the template ${file} (${path}): ${errorMessage(error)}`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/(\r?\n)+$/, '');
  } catch {
    throw new TemplateError(`Cannot read the template ${file} (${path}): it is not valid UTF-8 text.`);
  }
}

/** Loads and checks the templates in `dir` (Decision 1 and 3). A file that
 * is not in the directory keeps its built-in template. With no directory, the
 * result is the built-in templates. Throws `TemplateError` for a directory
 * that does not exist, a file that cannot be read, or a missing main
 * placeholder. It calls no host API. */
export async function loadTemplates(
  dir: string | undefined,
  logger: Logger = silentLogger(),
): Promise<CommentTemplates> {
  if (dir === undefined) return DEFAULT_TEMPLATES;

  let isDirectory: boolean;
  try {
    isDirectory = (await stat(dir)).isDirectory();
  } catch (error) {
    throw new TemplateError(`Cannot read the template directory ${dir}: ${errorMessage(error)}`);
  }
  if (!isDirectory) throw new TemplateError(`The template directory ${dir} is not a directory.`);

  const templates: CommentTemplates = { ...DEFAULT_TEMPLATES };
  for (const kind of ['finding', 'resolved'] as const) {
    const rule = TEMPLATE_FILES[kind];
    const text = await readTemplateFile(dir, rule.file);
    if (text === undefined) continue;
    checkTemplate(text, rule, logger);
    templates[kind] = text;
  }
  return templates;
}
