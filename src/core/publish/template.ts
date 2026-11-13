import { statSync } from 'node:fs';
import { join } from 'node:path';
import { silentLogger, type Logger } from '../../logger.ts';
import { errorMessage } from '../errorMessage.ts';
import { BUILTIN_DIR, fillTemplate, placeholderNames, readTemplateFile, TemplateError } from '../template.ts';

export { fillTemplate, TemplateError };

/** The text of the two comments that a person can change
 * (`publish-output-templates` design). A template is plain text with
 * `${name}` placeholders. */
export interface CommentTemplates {
  /** One finding. */
  finding: string;
  /** The reply that explains a resolved discussion. */
  resolved: string;
}

/** What each template file may fill, and the one placeholder it MUST hold
 * (Decision 3: a comment without it loses the content). */
const TEMPLATE_FILES = {
  finding: { file: 'FINDING.md', names: ['severity', 'summary', 'file', 'line'], main: 'summary' },
  resolved: { file: 'RESOLVED.md', names: ['reason'], main: 'reason' },
} as const;

type TemplateKind = keyof typeof TEMPLATE_FILES;
const KINDS = Object.keys(TEMPLATE_FILES) as TemplateKind[];

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
