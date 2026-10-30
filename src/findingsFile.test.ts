import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FindingsFileError, readFindingsFile, writeFindingsFile, type FindingsFile } from './findingsFile.ts';

test('writeFindingsFile then readFindingsFile round-trips the same data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const data: FindingsFile = {
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    findings: [{ file: 'a.ts', line: 3, severity: 'important', summary: 'Off-by-one.' }],
  };

  try {
    await writeFindingsFile(path, data);
    const result = await readFindingsFile(path);
    assert.deepEqual(result, data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeFindingsFile round-trips an empty findings list', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const data: FindingsFile = {
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    findings: [],
  };

  try {
    await writeFindingsFile(path, data);
    const result = await readFindingsFile(path);
    assert.deepEqual(result, data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readFindingsFile throws a clear FindingsFileError for a missing file', async () => {
  await assert.rejects(() => readFindingsFile('/does/not/exist/findings.json'), FindingsFileError);
});

test('readFindingsFile throws a clear FindingsFileError for unparsable JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const { writeFile } = await import('node:fs/promises');

  try {
    await writeFile(path, 'not json', 'utf8');
    await assert.rejects(() => readFindingsFile(path), FindingsFileError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
