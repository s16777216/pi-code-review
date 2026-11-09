import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** Where the built-in template files are: `src/template` when the code runs
 * from source (`tsx`), and `dist/template` in the package, where the build
 * copies them (Decision 6). */
const BUILTIN_DIR = fileURLToPath(new URL('../../template/', import.meta.url));

/** What each template file may fill, and the one placeholder it MUST hold
 * (Decision 3: a comment without it loses the content). */
const TEMPLATE_FILES = {
  finding: { file: 'FINDING.md', names: ['severity', 'summary', 'file', 'line'], main: 'summary' },
  resolved: { file: 'RESOLVED.md', names: ['reason'], main: 'reason' },
} as const;

type TemplateKind = keyof typeof TEMPLATE_FILES;
const KINDS = Object.keys(TEMPLATE_FILES) as TemplateKind[];

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
 * template has a `${name}` that the file does not fill. `subject` names the
 * template in the messages, for example `The template FINDING.md`. */
function checkTemplate(template: string, kind: TemplateKind, subject: string, logger: Logger): void {
  const rule = TEMPLATE_FILES[kind];
  const found = placeholderNames(template);
  if (!found.includes(rule.main)) {
    throw new TemplateError(`${subject} must contain \${${rule.main}}.`);
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

/** Reads one template file, or `undefined` when the directory does not have
 * it. The text has LF line breaks and no line break at its end, so a Windows
 * checkout and a Linux checkout give the same comment text. */
function readTemplateFile(dir: string, file: string): string | undefined {
  const path = join(dir, file);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new TemplateError(`Cannot read the template ${file} (${path}): ${errorMessage(error)}`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n/g, '\n').replace(/\n+$/, '');
  } catch {
    throw new TemplateError(`Cannot read the template ${file} (${path}): it is not valid UTF-8 text.`);
  }
}

/** Reads the built-in templates from `builtinDir` and checks them with the
 * same rules as a person's templates. A file that is missing or not valid is
 * a defect of the package, not of the user, so this throws `TemplateError`
 * that names the file, and never uses other text (Decision 3). */
export function readBuiltinTemplates(builtinDir: string = BUILTIN_DIR): CommentTemplates {
  const templates = {} as CommentTemplates;
  for (const kind of KINDS) {
    const { file } = TEMPLATE_FILES[kind];
    const text = readTemplateFile(builtinDir, file);
    if (text === undefined) {
      throw new TemplateError(
        `The built-in template ${file} is missing from the package (${join(builtinDir, file)}). This is a defect of the package.`,
      );
    }
    checkTemplate(text, kind, `The built-in template ${file}`, silentLogger());
    templates[kind] = text;
  }
  return templates;
}

let cachedBuiltin: CommentTemplates | undefined;

/** The built-in templates, read once. This is the default of `Publisher`. */
export function builtinTemplates(): CommentTemplates {
  cachedBuiltin ??= readBuiltinTemplates();
  return cachedBuiltin;
}

/** Loads and checks the templates (Decision 1 and 3). The built-in files load
 * first. A file with the same name in `dir` then replaces the built-in file.
 * With no directory, the result is the built-in templates. Throws
 * `TemplateError` for a built-in file that is missing or not valid, a
 * directory that does not exist, a file that cannot be read, or a missing main
 * placeholder. It calls no host API. `builtinDir` is for tests. */
export async function loadTemplates(
  dir: string | undefined,
  logger: Logger = silentLogger(),
  builtinDir: string = BUILTIN_DIR,
): Promise<CommentTemplates> {
  const templates = readBuiltinTemplates(builtinDir);
  if (dir === undefined) return templates;

  let isDirectory: boolean;
  try {
    isDirectory = statSync(dir).isDirectory();
  } catch (error) {
    throw new TemplateError(`Cannot read the template directory ${dir}: ${errorMessage(error)}`);
  }
  if (!isDirectory) throw new TemplateError(`The template directory ${dir} is not a directory.`);

  for (const kind of KINDS) {
    const { file } = TEMPLATE_FILES[kind];
    const text = readTemplateFile(dir, file);
    if (text === undefined) continue;
    checkTemplate(text, kind, `The template ${file}`, logger);
    templates[kind] = text;
  }
  return templates;
}
