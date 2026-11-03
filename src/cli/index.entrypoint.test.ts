import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** `src/cli/index.ts`'s own `isEntrypoint` check decides whether running it directly
 * (`node src/cli/index.ts ...` / `node dist/cli/index.js ...`) actually calls `main()`.
 * A broken check fails silently — no exception, no log, just exit 0 having done
 * nothing — which is exactly what happened when `process.argv[1]` reached this
 * file through a symlink/junction (e.g. nvm-windows' "C:\Program Files\nodejs"
 * link) and no longer matched `import.meta.url`'s already-resolved path. Only a
 * real subprocess run exercises this; every other test in this package imports
 * `index.ts` as a module, which never touches `isEntrypoint` at all. */
test('running index.ts as a subprocess actually invokes main(), not just exits 0 silently', async () => {
  const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));

  const cleanEnv = { ...process.env };
  delete cleanEnv.CI_MERGE_REQUEST_IID;
  delete cleanEnv.CI_API_V4_URL;
  delete cleanEnv.CI_PROJECT_ID;
  delete cleanEnv.GITLAB_TOKEN;

  const { stderr } = await execFileAsync(process.execPath, ['--import', 'tsx', entrypoint, 'review'], {
    env: cleanEnv,
  });

  assert.match(stderr, /Not a merge request pipeline; skipping review\./);
});

/** The actual regression: a version manager (nvm-windows' "C:\Program Files\nodejs"
 * link is the real-world example) can put the repo behind a symlinked directory.
 * `process.argv[1]` keeps the literal, un-resolved symlink path, but `import.meta.url`
 * is already resolved by the ESM loader — so without `realpathSync` on `argv[1]`
 * first, this exact scenario makes `isEntrypoint` false and `main()` silently never
 * runs. The test above alone would pass even with that bug, since it never goes
 * through a symlink. */
test('running index.ts through a symlinked directory still invokes main() (regression: version-manager symlinks)', async () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const scratchDir = mkdtempSync(join(tmpdir(), 'picr-symlink-test-'));
  const linkPath = join(scratchDir, 'repo-link');
  symlinkSync(projectRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

  try {
    const entrypointThroughLink = join(linkPath, 'src', 'cli', 'index.ts');
    const cleanEnv = { ...process.env };
    delete cleanEnv.CI_MERGE_REQUEST_IID;
    delete cleanEnv.CI_API_V4_URL;
    delete cleanEnv.CI_PROJECT_ID;
    delete cleanEnv.GITLAB_TOKEN;

    const { stderr } = await execFileAsync(process.execPath, ['--import', 'tsx', entrypointThroughLink, 'review'], {
      env: cleanEnv,
    });

    assert.match(stderr, /Not a merge request pipeline; skipping review\./);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

/** `publish` must reject a bad findings file before it touches GitLab. The URL
 * below points at a closed local port, so if `publish` reached the network the
 * error would be a connection failure instead of the findings-file message. */
test('publish with an invalid findings file exits 2 and names the file, before any GitLab call', async () => {
  const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));
  const scratchDir = mkdtempSync(join(tmpdir(), 'picr-publish-invalid-'));
  const findingsPath = join(scratchDir, 'bad-findings.json');
  writeFileSync(findingsPath, JSON.stringify({ findings: [] }), 'utf8');

  try {
    await assert.rejects(
      () =>
        execFileAsync(
          process.execPath,
          [
            '--import',
            'tsx',
            entrypoint,
            'publish',
            '--gitlab-url',
            'http://127.0.0.1:9/api/v4',
            '--project-id',
            '1',
            '--mr',
            '1',
            '--token',
            'test-token',
            '--from',
            findingsPath,
          ],
          { env: { ...process.env } },
        ),
      (error: unknown) => {
        const { code, stderr } = error as { code: number; stderr: string };
        assert.equal(code, 2);
        assert.match(stderr, /bad-findings\.json/);
        assert.match(stderr, /"diffRefs"/);
        assert.doesNotMatch(stderr, /ECONNREFUSED|fetch failed/);
        return true;
      },
    );
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

/** The environment of this process without any setting the CLI reads, so a
 * subprocess test sees only the flags it passes. */
function envWithoutSettings(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    'CI_MERGE_REQUEST_IID',
    'CI_API_V4_URL',
    'CI_PROJECT_ID',
    'GITLAB_TOKEN',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_BASE_URL',
    'OPENAI_MAX_TOKENS',
    'OPENAI_CONTEXT_WINDOW',
    'REVIEW_LANGUAGE',
    'FAIL_ON_SEVERITY',
    'DEBUG',
  ]) {
    delete env[name];
  }
  return env;
}

/** Runs the entrypoint and returns its exit code and stderr. */
async function runEntrypoint(args: string[]): Promise<{ code: number; stderr: string }> {
  const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));
  try {
    const { stderr } = await execFileAsync(process.execPath, ['--import', 'tsx', entrypoint, ...args], {
      env: envWithoutSettings(),
    });
    return { code: 0, stderr };
  } catch (error) {
    const { code, stderr } = error as { code: number; stderr: string };
    return { code, stderr };
  }
}

test('publish exits 2 when a required setting is missing', async () => {
  const { code, stderr } = await runEntrypoint(['publish', '--gitlab-url', 'http://127.0.0.1:9/api/v4', '--mr', '1', '--token', 't']);

  assert.equal(code, 2);
  assert.match(stderr, /CI_PROJECT_ID|--project-id/);
});

test('an unknown command exits 2', async () => {
  const { code, stderr } = await runEntrypoint(['reveiw']);

  assert.equal(code, 2);
  assert.match(stderr, /Unknown command "reveiw"/);
});

test('review exits 2 and writes no findings file when GitLab is unreachable', async () => {
  const scratchDir = mkdtempSync(join(tmpdir(), 'picr-review-error-'));
  try {
    const { code, stderr } = await runEntrypoint(
      [
        'review',
        '--gitlab-url',
        'http://127.0.0.1:9/api/v4',
        '--project-id',
        '1',
        '--mr',
        '1',
        '--token',
        'test-token',
        '--openai-api-key',
        'test-key',
        '--model',
        'test-model',
        '--openai-base-url',
        'http://127.0.0.1:9/v1',
        '--out',
        join(scratchDir, 'findings.json'),
      ],
    );

    assert.equal(code, 2);
    assert.match(stderr, /ECONNREFUSED|fetch failed/);
    assert.equal(existsSync(join(scratchDir, 'findings.json')), false);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});
