import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FindingsFileError, readFindingsFile, writeFindingsFile, type FindingsFile } from './findingsFile.ts';
import { gitlabHost } from './providers/index.ts';

/** The findings file stores the host's snapshot and source; these tests use GitLab's. */
const parseGitLabDiffRefs = (value: unknown) => gitlabHost.parseSnapshot(value);
const parseGitLabSource = (value: unknown) => gitlabHost.parseSource(value);
type GitLabDiffRefs = ReturnType<typeof parseGitLabDiffRefs>;
type GitLabSource = ReturnType<typeof parseGitLabSource>;

const validSource = { host: 'gitlab', projectId: '12', mergeRequestIid: '7' } as const;

test('writeFindingsFile then readFindingsFile round-trips the same data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const data: FindingsFile<GitLabDiffRefs, GitLabSource> = {
    unreviewedFiles: [],
    warnings: [],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: validSource,
    findings: [{ file: 'a.ts', line: 3, severity: 'high', summary: 'Off-by-one.' }],
  };

  try {
    await writeFindingsFile(path, data);
    const result = await readFindingsFile(path, parseGitLabDiffRefs, parseGitLabSource);
    assert.deepEqual(result, data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeFindingsFile round-trips an empty findings list', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const data: FindingsFile<GitLabDiffRefs, GitLabSource> = {
    unreviewedFiles: [],
    warnings: [],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: validSource,
    findings: [],
  };

  try {
    await writeFindingsFile(path, data);
    const result = await readFindingsFile(path, parseGitLabDiffRefs, parseGitLabSource);
    assert.deepEqual(result, data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readFindingsFile throws a clear FindingsFileError for a missing file', async () => {
  await assert.rejects(
    () => readFindingsFile('/does/not/exist/findings.json', parseGitLabDiffRefs, parseGitLabSource),
    FindingsFileError,
  );
});

test('readFindingsFile throws a clear FindingsFileError for unparsable JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const { writeFile } = await import('node:fs/promises');

  try {
    await writeFile(path, 'not json', 'utf8');
    await assert.rejects(() => readFindingsFile(path, parseGitLabDiffRefs, parseGitLabSource), FindingsFileError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function readRaw(content: unknown): Promise<FindingsFile<GitLabDiffRefs, GitLabSource>> {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const { writeFile } = await import('node:fs/promises');
  try {
    const withSource =
      typeof content === 'object' && content !== null && !Array.isArray(content)
        ? { source: validSource, ...content }
        : content;
    await writeFile(path, JSON.stringify(withSource), 'utf8');
    return await readFindingsFile(path, parseGitLabDiffRefs, parseGitLabSource);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const validRefs = { baseSha: 'base', startSha: 'start', headSha: 'head' };
const validFinding = { file: 'a.ts', line: 3, severity: 'high', summary: 'Off-by-one.' };

test('readFindingsFile rejects a file with no diffRefs, naming the file and the field', async () => {
  await assert.rejects(
    () => readRaw({ findings: [] }),
    (error: unknown) =>
      error instanceof FindingsFileError && /findings\.json/.test(error.message) && /"diffRefs"/.test(error.message),
  );
});

test('readFindingsFile rejects a file with no source, naming the file and the field', async () => {
  await assert.rejects(
    () => readRaw({ diffRefs: validRefs, source: undefined, findings: [] }),
    (error: unknown) =>
      error instanceof FindingsFileError && /findings.json/.test(error.message) && /"source"/.test(error.message),
  );
});

test('readFindingsFile rejects an empty projectId and an empty mergeRequestIid', async () => {
  for (const field of ['projectId', 'mergeRequestIid']) {
    await assert.rejects(
      () => readRaw({ diffRefs: validRefs, source: { ...validSource, [field]: '' }, findings: [] }),
      (error: unknown) => error instanceof FindingsFileError && error.message.includes(`source.${field}`),
    );
  }
});

test('readFindingsFile rejects a source from another host', async () => {
  await assert.rejects(
    () => readRaw({ diffRefs: validRefs, source: { ...validSource, host: 'github' }, findings: [] }),
    (error: unknown) =>
      error instanceof FindingsFileError && /findings.json/.test(error.message) && /"github"/.test(error.message),
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
        findings: [validFinding, validFinding, { ...validFinding, severity: 'severe' }],
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
    source: { ...validSource, extra: 'x' },
    findings: [{ ...validFinding, note: 'extra' }],
  });

  assert.deepEqual(result, {
    diffRefs: validRefs,
    source: validSource,
    findings: [validFinding],
    resolved: [],
    unreviewedFiles: [],
    warnings: [],
  });
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

// --- warnings and failed (`harden-run-failures`) ---

test('readFindingsFile reads a file without "warnings" and "failed" as no warnings and no failure', async () => {
  const result = await readRaw({ diffRefs: validRefs, findings: [] });
  assert.deepEqual(result.warnings, []);
  assert.equal('failed' in result, false);
});

test('readFindingsFile keeps valid warnings', async () => {
  const warnings = [
    { code: 'deduplication_failed' },
    { code: 'verification_failed', file: 'src/a.ts' },
    { code: 'verification_skipped', file: 'src/b.ts' },
  ];
  const result = await readRaw({ diffRefs: validRefs, findings: [], warnings });
  assert.deepEqual(result.warnings, warnings);
});

test('readFindingsFile keeps a valid failure', async () => {
  const result = await readRaw({ diffRefs: validRefs, findings: [], failed: { category: 'output_cut' } });
  assert.deepEqual(result.failed, { category: 'output_cut' });
});

test('readFindingsFile does not keep the text of an error in a failure', async () => {
  const result = await readRaw({
    diffRefs: validRefs,
    findings: [],
    failed: { category: 'other', message: 'http://internal-host/v1 refused' },
  });
  assert.deepEqual(result.failed, { category: 'other' });
});

for (const [name, extra, field] of [
  ['an unknown category', { failed: { category: 'network' } }, /"failed" has an invalid "category"/],
  ['a failure that is not an object', { failed: 'output_cut' }, /"failed" is not an object/],
  ['warnings that are not an array', { warnings: 'x' }, /"warnings" is not an array/],
  ['a warning that is not an object', { warnings: ['x'] }, /index 0 is not an object/],
  ['an unknown warning code', { warnings: [{ code: 'x' }] }, /index 0 has an invalid "code"/],
  [
    'a verification warning with no file',
    { warnings: [{ code: 'verification_failed' }] },
    /index 0 with the code "verification_failed" is missing a "file"/,
  ],
  [
    'a skipped warning with an empty file',
    { warnings: [{ code: 'verification_skipped', file: '' }] },
    /index 0 with the code "verification_skipped" is missing a "file"/,
  ],
] as const) {
  test(`readFindingsFile rejects ${name}`, async () => {
    await assert.rejects(
      () => readRaw({ diffRefs: validRefs, findings: [], ...extra }),
      (error: unknown) => error instanceof FindingsFileError && field.test(error.message),
    );
  });
}

test('writeFindingsFile then readFindingsFile round-trips a failed review', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'findings-file-test-'));
  const path = join(dir, 'findings.json');
  const data: FindingsFile<GitLabDiffRefs, GitLabSource> = {
    unreviewedFiles: [],
    warnings: [{ code: 'verification_failed', file: 'a.ts' }],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: validSource,
    findings: [],
    failed: { category: 'model_failed' },
  };

  try {
    await writeFindingsFile(path, data);
    assert.deepEqual(await readFindingsFile(path, parseGitLabDiffRefs, parseGitLabSource), data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
