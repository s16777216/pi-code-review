import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate } from './template.ts';

const FINDING = { severity: 'high', summary: 'Null check missing', file: 'src/a.ts', line: '12' };

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

test('readTemplateFile gives LF text with no line break at the end, and undefined for a missing file', async () => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readTemplateFile } = await import('./template.ts');
  const dir = await mkdtemp(join(tmpdir(), 'tpl-'));
  try {
    await writeFile(join(dir, 'A.md'), 'a\r\nb\r\n\r\n');
    assert.equal(readTemplateFile(dir, 'A.md'), 'a\nb');
    assert.equal(readTemplateFile(dir, 'MISSING.md'), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
