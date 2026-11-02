import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** `src/index.ts`'s own `isEntrypoint` check decides whether running it directly
 * (`node src/index.ts ...` / `node dist/index.js ...`) actually calls `main()`.
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
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const scratchDir = mkdtempSync(join(tmpdir(), 'picr-symlink-test-'));
  const linkPath = join(scratchDir, 'repo-link');
  symlinkSync(projectRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

  try {
    const entrypointThroughLink = join(linkPath, 'src', 'index.ts');
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
