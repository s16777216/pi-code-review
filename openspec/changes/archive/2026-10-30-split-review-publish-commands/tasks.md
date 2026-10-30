## 1. Findings file type and I/O

- [x] 1.1 Define a `FindingsFile` type (`diffRefs: GitLabDiffRefs`, `findings: Finding[]`) in `src/findingsFile.ts` (not `src/types.ts`: `types.ts` is deliberately platform-agnostic, and `GitLabDiffRefs` is GitLab-specific — see the new file's doc comment), and verify it compiles with `npm run build`
- [x] 1.2 Implement a `writeFindingsFile(path, data)` / `readFindingsFile(path)` pair (JSON read/write with a clear `FindingsFileError` on a missing or unparsable file) in `src/findingsFile.ts`, and verify with a unit test (`src/findingsFile.test.ts`) that a round-trip (write then read) returns the same data for both a populated and an empty findings list, and that reading a missing file and reading unparsable JSON both throw `FindingsFileError`

## 2. Split `runReview()` into review-only and publish-only functions

- [x] 2.1 Change `runReview(options)` in `src/index.ts` to stop before `GitLabSinkProvider.publish()`: build the `ReviewContext`, run `AgentReviewEngine`, and return `{ diffRefs, findings }` instead of a boolean, and verify with the existing `fauxProvider()`-based test (adjusted) that it returns findings without ever constructing a `GitLabSinkProvider`
- [x] 2.2 Add `runPublish(options)` that takes a `FindingsFile` plus a `MergeRequestWriter`, runs `GitLabSinkProvider.publish()`, then `decidePassFail(findings, config.failOnSeverity)`, and returns the boolean outcome, and verify with a fake `MergeRequestWriter` that publishing happens before the pass/fail decision is computed
- [x] 2.3 Verify the severity-blocks-publish risk directly: construct a findings file with an `important` finding, run `runPublish`, and confirm the fake writer's `createDiscussion` was called before `runPublish` resolves to `false`

## 3. CLI subcommands

- [x] 3.1 Add subcommand parsing to `src/index.ts`'s `main()`, with `review` and `publish` as the only valid first argument, and verify an unknown or missing subcommand produces a clear error. Implemented as plain `argv[0]`/`argv.slice(1)` indexing instead of `parseArgs`'s `allowPositionals`: confirmed by hand that `parseArgs({ allowPositionals: true, strict: false })` with no `options` misparses a value-taking flag like `--from x.json` (treats `--from` as boolean `true` and `x.json` as a second positional) — see the doc comment on `main()`.
- [x] 3.2 Split `parseCliOverrides()` into `parseReviewCliOptions()` and `parsePublishCliOptions()` (per `design.md`'s Decisions), and verify each rejects a flag belonging to the other command (`--fail-on`/`--from` on `review`, `--model`/`--openai-base-url`/`--openai-api-key` on `publish`)
- [x] 3.3 Wire the `review` subcommand (`runReviewCommand()`): parse its flags, call `runReview()`, write the findings file to `--out` (default `findings.json`), and exit 0 on success regardless of findings' severity (structurally guaranteed: `runReviewCommand` has no severity check in its own code path) — not independently unit-tested beyond that structural guarantee, since it wires a real `GitLabClient`/`openaiProvider()` with no injection point, consistent with how the pre-split `main()` was never unit-tested directly either (`runReview()` is where the logic is tested). Verified end-to-end in task 6.2.
- [x] 3.4 Wire the `publish` subcommand (`runPublishCommand()`): parse its flags, read the findings file from `--from` (default `findings.json`), call `runPublish()`, and exit with its boolean result (0 for pass, 1 for fail) — same testing approach and caveat as 3.3; `runPublish()`'s pass/fail behavior itself is covered by task 2.2/2.3's tests.

## 4. Update `Config`/`loadConfig` for the split

- [x] 4.1 Replaced the single `Config`/`ConfigOverrides`/`loadConfig` with `ReviewConfig`/`ReviewConfigOverrides`/`loadReviewConfig()` and `PublishConfig`/`PublishConfigOverrides`/`loadPublishConfig()` in `src/config.ts`, sharing a `GitlabConnectionConfig`/`GitlabConnectionOverrides`/`loadGitlabConnectionConfig()` for the fields both need. `loadReviewConfig()` never resolves `FAIL_ON_SEVERITY`; `loadPublishConfig()` never resolves any `OPENAI_*` variable. Verified with tests that each function does not throw when the other command's variables are unset.

## 5. Docs

- [x] 5.0 Prepare `package.json` for public npm publishing under `@s16777216/pi-code-review` (`publishConfig.access: public`, `license`, `repository`, `files` excluding `dist/**/*.test.js`, `prepublishOnly: npm run build`), add a root `LICENSE` (MIT), and update `README.md`'s Status/Installation/Running-in-GitLab-CI/Roadmap sections for npm-based distribution — verified with `npm pack --dry-run` showing no test files in the tarball and `npm run build && npm test` passing. Pulled forward ahead of the review/publish split since it was decided mid-change; not part of the original task breakdown.
- [x] 5.1 Rewrite `README.md`'s "Running in GitLab CI" and "Running locally" sections for the two-subcommand form (plus Configuration split into shared/`review`-only/`publish`-only tables, a new "The two commands" overview section, and a "Versioning" section documenting `npm run release`), and verify the flag names in the examples match `src/index.ts`'s actual option names — checked against `parseReviewCliOptions`/`parsePublishCliOptions` directly
- [x] 5.2 Checked `openspec/VERIFY.md` — verification commands (`npm run build`/`npm test`) are unchanged, no edit needed

## 6. Verification

- [x] 6.1 Ran `npm run build` and `npm test`: both pass, 82/82 tests, no regressions. Also manually exercised the compiled CLI (`node dist/index.js`, `node dist/index.js bogus`, `node dist/index.js review --fail-on nit`) to confirm the clear-error and exit-code behavior described in tasks 3.1-3.2.
- [x] 6.2 Run `review` then `publish` locally against a real GitLab project and a real OpenAI account (reusing the setup from the `gitlab-ai-code-review` change's task 8.2), and verify the findings file is produced by `review`, and that `publish` posts the same findings and returns the expected exit code — verified by the user

## 7. Drop `CI_JOB_TOKEN`/`JOB-TOKEN`, always use `PRIVATE-TOKEN`

Pulled forward mid-change, same as task 5.0 — decided after discussing whether `--auth-header` was worth keeping once `review`/`publish` already requires a manually-set CI/CD variable either way (see `design.md`'s "Auth" Decision and the `gitlab-mr-context` delta spec's REMOVED/ADDED requirements).

- [x] 7.1 Removed `GitLabAuthHeader`/`VALID_GITLAB_AUTH_HEADERS` and the `authHeader` field from `src/config.ts` and `src/gitlab/client.ts`; renamed `jobToken`/`CI_JOB_TOKEN`/`--job-token` to `token`/`GITLAB_TOKEN`/`--token` throughout; `GitLabClient.request()` now hardcodes the `PRIVATE-TOKEN` header. Verified with `npm run build` (clean) and `npm test` (79/79 passing, including a new test asserting `JOB-TOKEN` is never sent).
- [x] 7.2 Updated `src/config.test.ts`, `src/gitlab/client.test.ts`, `src/index.test.ts`, and `src/index.cli.test.ts` for the rename; removed the now-obsolete auth-header-specific tests.
- [x] 7.3 Manually verified the compiled CLI rejects `--auth-header` as an unknown option (`node dist/index.js review --auth-header PRIVATE-TOKEN` → exit 1, "Unknown option").
- [x] 7.4 Updated `README.md` (Requirements, Configuration table, new "Auth" section, CI yaml note, local-run examples) and `test_script.ps1` for the rename; grepped to confirm only intentional "this is NOT what we use" mentions of `CI_JOB_TOKEN`/`JOB-TOKEN` remain.
- [x] 7.5 Updated `proposal.md` (new BREAKING bullet, `gitlab-mr-context` added to Modified Capabilities), added `specs/gitlab-mr-context/spec.md` (REMOVED "Authenticate with the CI job token" / ADDED "Authenticate with a GitLab access token"), and updated `design.md`'s CLI-shape flag lists plus a new "Auth" Decision section.
