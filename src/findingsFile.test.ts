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
    unreviewedFiles: [],
    resolved: [],
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
    unreviewedFiles: [],
    resolved: [],
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

  assert.deepEqual(result, { diffRefs: validRefs, findings: [validFinding], resolved: [], unreviewedFiles: [] });
});

test("readFindingsFile keeps a finding's relatesTo", async () => {
  const result = await readRaw({ diffRefs: validRefs, findings: [{ ...validFinding, relatesTo: 'd1' }] });
  assert.deepEqual(result.findings, [{ ...validFinding, relatesTo: 'd1' }]);
});

test('readFindingsFile round-trips fixed declarations', async () => {
  const result = await readRaw({
    diffRefs: validRefs,
    findings: [],
    resolved: [{ discussionId: 'd1', reason: 'Fixed.' }],
  });
  assert.deepEqual(result.resolved, [{ discussionId: 'd1', reason: 'Fixed.' }]);
});

test('readFindingsFile reads a file without "resolved" as no declarations', async () => {
  const result = await readRaw({ diffRefs: validRefs, findings: [] });
  assert.deepEqual(result.resolved, []);
});

test('readFindingsFile rejects an invalid fixed declaration', async () => {
  await assert.rejects(
    () => readRaw({ diffRefs: validRefs, findings: [], resolved: [{ discussionId: 'd1' }] }),
    (error: unknown) => error instanceof FindingsFileError && /"reason"/.test(error.message),
  );
});

test('readFindingsFile reads a file without "unreviewedFiles" as an empty list', async () => {
  const result = await readRaw({ diffRefs: validRefs, findings: [] });
  assert.deepEqual(result.unreviewedFiles, []);
});

test('readFindingsFile keeps valid unreviewed files', async () => {
  const unreviewedFiles = [
    { path: 'big.js', reason: 'too_large' },
    { path: 'yarn.lock', reason: 'generated' },
  ];
  const result = await readRaw({ diffRefs: validRefs, findings: [], unreviewedFiles });
  assert.deepEqual(result.unreviewedFiles, unreviewedFiles);
});

for (const [name, unreviewedFiles, field] of [
  ['not an array', 'big.js', /"unreviewedFiles" is not an array/],
  ['an entry that is not an object', ['big.js'], /index 0 is not an object/],
  ['an entry with no path', [{ reason: 'too_large' }], /index 0 is missing a "path"/],
  ['an entry with an unknown reason', [{ path: 'a', reason: 'huge' }], /index 0 has an invalid "reason"/],
] as const) {
  test(`readFindingsFile rejects unreviewed files: ${name}`, async () => {
    await assert.rejects(
      () => readRaw({ diffRefs: validRefs, findings: [], unreviewedFiles }),
      (error: unknown) => error instanceof FindingsFileError && field.test(error.message),
    );
  });
}
