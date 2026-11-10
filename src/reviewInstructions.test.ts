import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { changesInstructionsFile, MAX_INSTRUCTIONS_CHARS, resolveInstructions } from './reviewInstructions.ts';

/** pino levels: info is 30, warn is 40. */
const INFO = 30;
const WARN = 40;

function capturingLogger(): { logger: pino.Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = pino({ level: 'info' }, { write: (chunk: string) => void lines.push(JSON.parse(chunk)) });
  return { logger, lines };
}

/** Runs `run` in a temporary working directory that holds `files`. */
async function withCwd(
  files: Record<string, string | Buffer>,
  run: (cwd: string) => void | Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'instructions-'));
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(join(cwd, name), content);
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

const warnings = (lines: Record<string, unknown>[]) => lines.filter((line) => line.level === WARN);
const infos = (lines: Record<string, unknown>[]) => lines.filter((line) => line.level === INFO);

// --- reading and checking one source (task 1.1) ---

test('a usable file gives the trimmed text, its source, and its absolute path', async () => {
  await withCwd({ 'rules.md': '\n\n  Skip naming problems.  \n\n' }, (cwd) => {
    const result = resolveInstructions({ instructions: 'rules.md' }, undefined, {}, cwd);
    assert.equal(result?.text, 'Skip naming problems.');
    assert.equal(result?.source, '--instructions');
    assert.equal(result?.filePath, join(cwd, 'rules.md'));
  });
});

test('CRLF line breaks become LF', async () => {
  await withCwd({ 'rules.md': 'Rule one.\r\nRule two.\r\n' }, (cwd) => {
    assert.equal(resolveInstructions({ instructions: 'rules.md' }, undefined, {}, cwd)?.text, 'Rule one.\nRule two.');
  });
});

test('a text source gives its text and no file path', () => {
  const result = resolveInstructions({ instructionsText: ' Check SQL. ' }, undefined, {}, tmpdir());
  assert.equal(result?.text, 'Check SQL.');
  assert.equal(result?.source, '--instructions-text');
  assert.equal(result?.filePath, undefined);
});

test('a file that does not exist is not usable', async () => {
  await withCwd({}, (cwd) => {
    const { logger, lines } = capturingLogger();
    assert.equal(resolveInstructions({ instructions: 'missing.md' }, logger, {}, cwd), undefined);
    assert.equal(warnings(lines).length, 1);
    assert.equal(warnings(lines)[0]!.source, '--instructions');
    assert.match(String(warnings(lines)[0]!.reason), /missing\.md/);
  });
});

test('a file that is not UTF-8 text is not usable', async () => {
  await withCwd({ 'bad.md': Buffer.from([0xff, 0xfe, 0x41]) }, (cwd) => {
    const { logger, lines } = capturingLogger();
    assert.equal(resolveInstructions({ instructions: 'bad.md' }, logger, {}, cwd), undefined);
    assert.match(String(warnings(lines)[0]!.reason), /not valid UTF-8/);
  });
});

test('a text with only white space is not usable', () => {
  const { logger, lines } = capturingLogger();
  assert.equal(resolveInstructions({}, logger, { REVIEW_INSTRUCTIONS: ' \n\t \r\n ' }, tmpdir()), undefined);
  assert.equal(warnings(lines)[0]!.source, 'REVIEW_INSTRUCTIONS');
  assert.match(String(warnings(lines)[0]!.reason), /empty/);
});

test('a text with 8,000 characters is usable, and one with 8,001 is not', () => {
  const ok = resolveInstructions({ instructionsText: 'a'.repeat(MAX_INSTRUCTIONS_CHARS) }, undefined, {}, tmpdir());
  assert.equal(ok?.text.length, 8_000);

  const { logger, lines } = capturingLogger();
  const tooLong = resolveInstructions(
    { instructionsText: 'a'.repeat(MAX_INSTRUCTIONS_CHARS + 1) },
    logger,
    {},
    tmpdir(),
  );
  assert.equal(tooLong, undefined);
  assert.match(String(warnings(lines)[0]!.reason), /8001 characters.*8000|8,001|limit is 8000/);
});

test('the limit counts the trimmed text, not the white space around it', () => {
  const padded = `\n\n${'a'.repeat(MAX_INSTRUCTIONS_CHARS)}\n\n`;
  assert.equal(resolveInstructions({ instructionsText: padded }, undefined, {}, tmpdir())?.text.length, 8_000);
});

test('placeholders in the text stay as they are', () => {
  assert.equal(
    resolveInstructions({ instructionsText: 'Mention ${summary}.' }, undefined, {}, tmpdir())?.text,
    'Mention ${summary}.',
  );
});

// --- the order of priority (task 1.2) ---

test('the path flag wins over the other three sources', async () => {
  await withCwd({ 'flag.md': 'from flag', 'var.md': 'from var' }, (cwd) => {
    const result = resolveInstructions(
      { instructions: 'flag.md', instructionsText: 'from text flag' },
      undefined,
      { REVIEW_INSTRUCTIONS_FILE: 'var.md', REVIEW_INSTRUCTIONS: 'from text var' },
      cwd,
    );
    assert.deepEqual([result?.source, result?.text], ['--instructions', 'from flag']);
  });
});

test('the text flag wins over both variables', async () => {
  await withCwd({ 'var.md': 'from var' }, (cwd) => {
    const result = resolveInstructions(
      { instructionsText: 'from text flag' },
      undefined,
      { REVIEW_INSTRUCTIONS_FILE: 'var.md', REVIEW_INSTRUCTIONS: 'from text var' },
      cwd,
    );
    assert.deepEqual([result?.source, result?.text], ['--instructions-text', 'from text flag']);
  });
});

test('the file variable wins over the text variable', async () => {
  await withCwd({ 'var.md': 'from var' }, (cwd) => {
    const result = resolveInstructions(
      {},
      undefined,
      { REVIEW_INSTRUCTIONS_FILE: 'var.md', REVIEW_INSTRUCTIONS: 'from text var' },
      cwd,
    );
    assert.deepEqual([result?.source, result?.text], ['REVIEW_INSTRUCTIONS_FILE', 'from var']);
  });
});

test('the text variable is used when only it is set', () => {
  const result = resolveInstructions({}, undefined, { REVIEW_INSTRUCTIONS: 'from text var' }, tmpdir());
  assert.deepEqual([result?.source, result?.text], ['REVIEW_INSTRUCTIONS', 'from text var']);
});

test('a source that is not usable gives way to the next source', async () => {
  await withCwd({}, (cwd) => {
    const { logger, lines } = capturingLogger();
    const result = resolveInstructions(
      { instructions: 'missing.md' },
      logger,
      { REVIEW_INSTRUCTIONS: 'from text var' },
      cwd,
    );
    assert.deepEqual([result?.source, result?.text], ['REVIEW_INSTRUCTIONS', 'from text var']);
    assert.equal(warnings(lines).length, 1);
  });
});

test('a flag or a variable with an empty string is set but not usable', async () => {
  await withCwd({}, (cwd) => {
    const { logger, lines } = capturingLogger();
    const result = resolveInstructions(
      { instructions: '', instructionsText: '' },
      logger,
      { REVIEW_INSTRUCTIONS_FILE: '', REVIEW_INSTRUCTIONS: 'last resort' },
      cwd,
    );
    assert.equal(result?.source, 'REVIEW_INSTRUCTIONS');
    assert.deepEqual(
      warnings(lines).map((line) => line.source),
      ['--instructions', '--instructions-text', 'REVIEW_INSTRUCTIONS_FILE'],
    );
  });
});

test('no source: nothing is used, and a REVIEW_INSTRUCTIONS.md in the working directory is not read', async () => {
  await withCwd({ 'REVIEW_INSTRUCTIONS.md': 'Do not read me.' }, (cwd) => {
    const { logger, lines } = capturingLogger();
    assert.equal(resolveInstructions({}, logger, {}, cwd), undefined);
    assert.equal(lines.length, 0);
  });
});

test('when every set source is not usable, nothing is used and nothing throws', async () => {
  await withCwd({}, (cwd) => {
    const { logger, lines } = capturingLogger();
    const result = resolveInstructions({ instructions: 'missing.md' }, logger, { REVIEW_INSTRUCTIONS: '   ' }, cwd);
    assert.equal(result, undefined);
    assert.equal(warnings(lines).length, 2);
    assert.equal(infos(lines).length, 0);
  });
});

// --- the log lines (task 1.3) ---

test('the source in use writes one info line with the source and the number of characters', () => {
  const { logger, lines } = capturingLogger();
  resolveInstructions({ instructionsText: 'x'.repeat(120) }, logger, {}, tmpdir());
  assert.equal(infos(lines).length, 1);
  assert.equal(infos(lines)[0]!.source, '--instructions-text');
  assert.equal(infos(lines)[0]!.characters, 120);
  assert.match(String(infos(lines)[0]!.msg), /--instructions-text.*120 characters/);
  assert.equal(warnings(lines).length, 0);
});

test('each source that is not usable writes one warn line that names the source and the cause', () => {
  const { logger, lines } = capturingLogger();
  resolveInstructions(
    { instructionsText: '' },
    logger,
    { REVIEW_INSTRUCTIONS: 'a'.repeat(MAX_INSTRUCTIONS_CHARS + 1) },
    tmpdir(),
  );
  const found = warnings(lines);
  assert.equal(found.length, 2);
  assert.equal(found[0]!.source, '--instructions-text');
  assert.match(String(found[0]!.msg), /--instructions-text.*empty/);
  assert.equal(found[1]!.source, 'REVIEW_INSTRUCTIONS');
  assert.match(String(found[1]!.msg), /REVIEW_INSTRUCTIONS.*limit/);
});

test('no source set writes no log line', () => {
  const { logger, lines } = capturingLogger();
  resolveInstructions({}, logger, {}, tmpdir());
  assert.equal(lines.length, 0);
});

// --- the comparison with the changed files (task 1.4) ---

test('a changed file with the same path matches', () => {
  const cwd = join(tmpdir(), 'project');
  assert.equal(
    changesInstructionsFile(join(cwd, 'REVIEW_INSTRUCTIONS.md'), ['src/a.ts', 'REVIEW_INSTRUCTIONS.md'], cwd),
    true,
  );
});

test('an added file matches by its new path, and a renamed file by its old path', () => {
  const cwd = join(tmpdir(), 'project');
  const file = join(cwd, 'docs', 'review.md');
  assert.equal(changesInstructionsFile(file, [null, 'docs/review.md'], cwd), true);
  assert.equal(changesInstructionsFile(file, ['docs/other.md', 'docs/review.md'], cwd), true);
});

test('a file that the change request does not change does not match', () => {
  const cwd = join(tmpdir(), 'project');
  assert.equal(changesInstructionsFile(join(cwd, 'REVIEW_INSTRUCTIONS.md'), ['src/a.ts', 'README.md'], cwd), false);
  assert.equal(changesInstructionsFile(join(cwd, 'REVIEW_INSTRUCTIONS.md'), [], cwd), false);
});

test('backslash separators in a changed path match', () => {
  const cwd = join(tmpdir(), 'project');
  assert.equal(changesInstructionsFile(join(cwd, 'docs', 'review.md'), ['docs\\review.md'], cwd), true);
});

test('a file outside the working directory never matches', () => {
  const cwd = join(tmpdir(), 'project');
  const outside = join(tmpdir(), 'elsewhere', 'review.md');
  assert.equal(changesInstructionsFile(outside, ['../elsewhere/review.md', 'review.md'], cwd), false);
});

test('a working directory that is not the project root can miss a match, or match another file with the same relative path', () => {
  const cwd = join(tmpdir(), 'project', 'tools');
  const file = join(cwd, 'rules.md');
  // The changed paths are relative to the project root. This file is "tools/rules.md" there, but the
  // program compares "rules.md". It misses the real change, and it matches a file at the root that
  // only has the same name. The warning is a log line, so a wrong match does no harm.
  assert.equal(changesInstructionsFile(file, ['tools/rules.md'], cwd), false);
  assert.equal(changesInstructionsFile(file, ['rules.md'], cwd), true);
});
