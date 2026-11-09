import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { DEFAULT_TEMPLATES, fillTemplate, loadTemplates, TemplateError } from './template.ts';

const FINDING = { severity: 'high', summary: 'Null check missing', file: 'src/a.ts', line: '12' };

/** A logger that keeps what it writes, so a test can read the `warn` lines. */
function capturingLogger(): { logger: pino.Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = pino({ level: 'info' }, { write: (chunk: string) => void lines.push(JSON.parse(chunk)) });
  return { logger, lines };
}

async function withDir(files: Record<string, string | Buffer>, run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'templates-'));
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- fillTemplate (task 1.1) ---

test('fillTemplate fills every placeholder of a finding', () => {
  assert.equal(
    fillTemplate('${severity}: ${summary} (${file}:${line})', FINDING),
    'high: Null check missing (src/a.ts:12)',
  );
});

test('fillTemplate fills the same placeholder each time it appears', () => {
  assert.equal(fillTemplate('${summary} / ${summary}', FINDING), 'Null check missing / Null check missing');
});

test('fillTemplate turns the escape into a literal ${', () => {
  assert.equal(fillTemplate('\\${summary} and ${summary}', FINDING), '${summary} and Null check missing');
});

test('fillTemplate keeps a backslash that is not before ${', () => {
  assert.equal(
    fillTemplate('C:\\dir\\file and \\d+ and ${summary}', FINDING),
    'C:\\dir\\file and \\d+ and Null check missing',
  );
  assert.equal(fillTemplate('C:\\dir\\${summary}', FINDING), 'C:\\dir${summary}');
});

test('fillTemplate keeps braces, a lone $, and $name as plain text', () => {
  assert.equal(
    fillTemplate('costs $5 { "text": "${summary}" } $HOME $', FINDING),
    'costs $5 { "text": "Null check missing" } $HOME $',
  );
});

test('fillTemplate keeps a ${name} that the file does not fill, and does not read the environment', () => {
  process.env.PUBLISH_TEMPLATE_TEST_VAR = 'secret';
  try {
    assert.equal(
      fillTemplate('${PUBLISH_TEMPLATE_TEST_VAR} ${HOME} ${reason} ${summary}', FINDING),
      '${PUBLISH_TEMPLATE_TEST_VAR} ${HOME} ${reason} Null check missing',
    );
  } finally {
    delete process.env.PUBLISH_TEMPLATE_TEST_VAR;
  }
});

test('fillTemplate does not fill a placeholder that a value holds', () => {
  assert.equal(fillTemplate('${summary}', { ...FINDING, summary: 'uses ${severity}' }), 'uses ${severity}');
});

test('fillTemplate treats a name like toString as an unknown name', () => {
  assert.equal(fillTemplate('${toString} ${constructor}', FINDING), '${toString} ${constructor}');
});

test('the built-in templates give the text from before templates', () => {
  assert.equal(fillTemplate(DEFAULT_TEMPLATES.finding, FINDING), '**[high]** Null check missing');
  assert.equal(
    fillTemplate(DEFAULT_TEMPLATES.resolved, { reason: 'The check was added' }),
    'Resolved: The check was added',
  );
});

// --- the check (task 1.2) ---

test('loadTemplates rejects finding.md without ${summary}', async () => {
  await withDir({ 'finding.md': '${severity} only' }, async (dir) => {
    await assert.rejects(loadTemplates(dir), (error) => {
      assert.ok(error instanceof TemplateError);
      assert.match(error.message, /finding\.md/);
      assert.match(error.message, /\$\{summary\}/);
      return true;
    });
  });
});

test('loadTemplates rejects resolved.md without ${reason}', async () => {
  await withDir({ 'resolved.md': 'Done ${summary}' }, async (dir) => {
    await assert.rejects(loadTemplates(dir), (error) => {
      assert.ok(error instanceof TemplateError);
      assert.match(error.message, /resolved\.md/);
      assert.match(error.message, /\$\{reason\}/);
      return true;
    });
  });
});

test('loadTemplates does not count an escaped main placeholder', async () => {
  await withDir({ 'finding.md': '\\${summary}' }, async (dir) => {
    await assert.rejects(loadTemplates(dir), /finding\.md.*\$\{summary\}/);
  });
});

test('loadTemplates writes one warn line for an unknown ${name} and goes on', async () => {
  const { logger, lines } = capturingLogger();
  await withDir({ 'finding.md': '${summary} ${severty} ${severty} ${HOME}' }, async (dir) => {
    const templates = await loadTemplates(dir, logger);
    assert.equal(templates.finding, '${summary} ${severty} ${severty} ${HOME}');
  });
  const warnings = lines.filter((line) => line.level === 40);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]!.file, 'finding.md');
  assert.deepEqual(warnings[0]!.placeholders, ['${severty}', '${HOME}']);
});

test('loadTemplates writes no warn line for an escaped ${name}', async () => {
  const { logger, lines } = capturingLogger();
  await withDir({ 'finding.md': '${summary} \\${HOME}' }, async (dir) => {
    await loadTemplates(dir, logger);
  });
  assert.equal(lines.length, 0);
});

test('loadTemplates writes a warn line for the other file placeholder', async () => {
  const { logger, lines } = capturingLogger();
  await withDir({ 'resolved.md': '${reason} ${summary}' }, async (dir) => {
    await loadTemplates(dir, logger);
  });
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0]!.placeholders, ['${summary}']);
});

// --- loadTemplates (task 1.3) ---

test('loadTemplates with no directory gives the built-in templates', async () => {
  assert.deepEqual(await loadTemplates(undefined), DEFAULT_TEMPLATES);
});

test('loadTemplates reads both files and removes the line breaks at the end', async () => {
  await withDir({ 'finding.md': '- ${summary}\r\n\r\n', 'resolved.md': '已修正:${reason}\n' }, async (dir) => {
    assert.deepEqual(await loadTemplates(dir), { finding: '- ${summary}', resolved: '已修正:${reason}' });
  });
});

test('loadTemplates keeps the built-in template for a missing file', async () => {
  await withDir({ 'finding.md': '- ${summary}' }, async (dir) => {
    assert.deepEqual(await loadTemplates(dir), { finding: '- ${summary}', resolved: DEFAULT_TEMPLATES.resolved });
  });
  await withDir({}, async (dir) => {
    assert.deepEqual(await loadTemplates(dir), DEFAULT_TEMPLATES);
  });
});

test('loadTemplates rejects a directory that does not exist, and names it', async () => {
  const missing = join(tmpdir(), 'templates-that-do-not-exist');
  await assert.rejects(loadTemplates(missing), (error) => {
    assert.ok(error instanceof TemplateError);
    assert.ok(error.message.includes(missing));
    return true;
  });
});

test('loadTemplates rejects a path that is a file and not a directory', async () => {
  await withDir({ 'plain.txt': 'x' }, async (dir) => {
    await assert.rejects(loadTemplates(join(dir, 'plain.txt')), TemplateError);
  });
});

test('loadTemplates rejects a file that is not valid UTF-8', async () => {
  await withDir({ 'finding.md': Buffer.from([0xff, 0xfe, 0x24, 0x7b]) }, async (dir) => {
    await assert.rejects(loadTemplates(dir), /finding\.md.*UTF-8/);
  });
});

test('loadTemplates rejects a template file that cannot be read, and names it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'templates-'));
  try {
    // A directory named finding.md cannot be read as a file on any platform.
    await mkdir(join(dir, 'finding.md'));
    await assert.rejects(loadTemplates(dir), /finding\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
