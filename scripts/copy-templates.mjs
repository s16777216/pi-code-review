// Copies the built-in comment templates next to the compiled code.
// `tsc` copies no `.md` file, and the package publishes only `dist`, so
// `dist/core/publish/template.js` could not find `../../template` without
// this step (`publish-output-templates` design, Decision 6).
// It names the two files on purpose: `src/template` also holds files that
// are not built-in templates, such as `REVIEW_PROMPT.md`.
import { copyFile, mkdir } from 'node:fs/promises';
import { stdout } from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const FILES = ['FINDING.md', 'RESOLVED.md'];

const from = new URL('../src/template/', import.meta.url);
const to = new URL('../dist/template/', import.meta.url);

await mkdir(to, { recursive: true });
for (const file of FILES) {
  await copyFile(new URL(file, from), new URL(file, to));
}
stdout.write(`Copied ${FILES.join(', ')} to ${fileURLToPath(to)}\n`);
