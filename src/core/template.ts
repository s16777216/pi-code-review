import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage } from './errorMessage.ts';

/** A template that is not valid, or a template file or directory that cannot
 * be read. The message names the file or the directory and the cause. */
export class TemplateError extends Error {}

/** Where the built-in template files are: `src/template` when the code runs
 * from source (`tsx`), and `dist/template` in the package, where the build
 * copies them (`publish-output-templates` design, Decision 6). */
export const BUILTIN_DIR = fileURLToPath(new URL('../template/', import.meta.url));

/** Either the escape `\${`, or `${name}`. The escape comes first in the
 * pattern, so `\${summary}` is never read as a placeholder. */
const TOKEN = /\\\$\{|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Fills a template in one pass (`publish-output-templates` design, Decision
 * 2). `${name}` with a name in `values` becomes its value, and `\${` becomes
 * `${`. Any other text stays as it is. A value is never read again, so a value
 * that holds `${name}` stays as it is. */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(TOKEN, (token, name: string | undefined) => {
    if (name === undefined) return '${';
    return Object.hasOwn(values, name) ? values[name]! : token;
  });
}

/** The names in `${name}` placeholders of a template, without the escaped
 * ones, in the order of the text. */
export function placeholderNames(template: string): string[] {
  return [...template.matchAll(TOKEN)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

/** Reads one template file, or `undefined` when the directory does not have
 * it. The text has LF line breaks and no line break at its end, so a Windows
 * checkout and a Linux checkout give the same text. */
export function readTemplateFile(dir: string, file: string): string | undefined {
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
