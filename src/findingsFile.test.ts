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

async function readRaw(content: unknown): Promise<FindingsFile> {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const { writeFile } = await import('node:fs/promises');
  try {
    await writeFile(path, JSON.stringify(content), 'utf8');
    return await readFindingsFile(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const validRefs = { baseSha: 'base', startSha: 'start', headSha: 'head' };
const validFinding = { file: 'a.ts', line: 3, severity: 'important', summary: 'Off-by-one.' };

test('readFindingsFile rejects a file with no diffRefs, naming the file and the field', async () => {
  await assert.rejects(
    () => readRaw({ findings: [] }),
    (error: unknown) =>
      error instanceof FindingsFileError && /findings\.json/.test(error.message) && /"diffRefs"/.test(error.message),
  );
});

test('readFindingsFile rejects an empty headSha', async () => {
  await assert.rejects(
    () => readRaw({ diffRefs: { ...validRefs, headSha: '' }, findings: [] }),
    (error: unknown) => error instanceof FindingsFileError && /diffRefs\.headSha/.test(error.message),
  );
});

test('readFindingsFile rejects a top-level array', async () => {
  await assert.rejects(
    () => readRaw([validFinding]),
    (error: unknown) => error instanceof FindingsFileError && /top-level value is not an object/.test(error.message),
  );
});

test('readFindingsFile rejects a file with no findings array', async () => {
  await assert.rejects(
    () => readRaw({ diffRefs: validRefs }),
    (error: unknown) => error instanceof FindingsFileError && /"findings"/.test(error.message),
  );
});

test('readFindingsFile rejects a bad severity at index 2, naming the index and the field', async () => {
  await assert.rejects(
    () =>
      readRaw({
        diffRefs: validRefs,
        findings: [validFinding, validFinding, { ...validFinding, severity: 'critical' }],
      }),
    (error: unknown) =>
      error instanceof FindingsFileError && /index 2/.test(error.message) && /"severity"/.test(error.message),
  );
});

test('readFindingsFile rejects a non-integer line', async () => {
  await assert.rejects(
    () => readRaw({ diffRefs: validRefs, findings: [{ ...validFinding, line: '3' }] }),
    (error: unknown) => error instanceof FindingsFileError && /"line"/.test(error.message),
  );
});

test('readFindingsFile ignores unknown extra fields', async () => {
  const result = await readRaw({
    version: 2,
    diffRefs: { ...validRefs, extra: 'x' },
    findings: [{ ...validFinding, note: 'extra' }],
  });

  assert.deepEqual(result, { diffRefs: validRefs, findings: [validFinding] });
});
