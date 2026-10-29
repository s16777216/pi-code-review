## 1. Findings file type and I/O

- [ ] 1.1 Define a `FindingsFile` type (`diffRefs: GitLabDiffRefs`, `findings: Finding[]`) in `src/types.ts` or `src/index.ts`, and verify it compiles with `npm run build`
- [ ] 1.2 Implement a `writeFindingsFile(path, data)` / `readFindingsFile(path)` pair (JSON read/write with a clear error on a missing or unparsable file), and verify with a unit test that a round-trip (write then read) returns the same data, and that reading a missing file throws a clear error

## 2. Split `runReview()` into review-only and publish-only functions

- [ ] 2.1 Change `runReview(options)` in `src/index.ts` to stop before `GitLabSinkProvider.publish()`: build the `ReviewContext`, run `AgentReviewEngine`, and return `{ diffRefs, findings }` instead of a boolean, and verify with the existing `fauxProvider()`-based test (adjusted) that it returns findings without ever constructing a `GitLabSinkProvider`
- [ ] 2.2 Add `runPublish(options)` that takes a `FindingsFile` plus a `MergeRequestWriter`, runs `GitLabSinkProvider.publish()`, then `decidePassFail(findings, config.failOnSeverity)`, and returns the boolean outcome, and verify with a fake `MergeRequestWriter` that publishing happens before the pass/fail decision is computed
- [ ] 2.3 Verify the severity-blocks-publish risk directly: construct a findings file with an `important` finding, run `runPublish`, and confirm the fake writer's `createDiscussion` was called before `runPublish` resolves to `false`

## 3. CLI subcommands

- [ ] 3.1 Add `allowPositionals: true` subcommand parsing to `src/index.ts`'s argument handling, with `review` and `publish` as the only valid first positional, and verify an unknown or missing subcommand produces a clear error
- [ ] 3.2 Split `parseCliOverrides()` into a `review`-specific and a `publish`-specific flag set (per `design.md`'s Decisions), and verify each rejects a flag belonging to the other command (`--fail-on` on `review`, `--model`/`--openai-base-url`/`--openai-api-key` on `publish`)
- [ ] 3.3 Wire the `review` subcommand: parse its flags, call `runReview()`, write the findings file to `--out` (default `findings.json`), and exit 0 on success regardless of findings' severity; exit non-zero only on a thrown error, and verify both cases with a test
- [ ] 3.4 Wire the `publish` subcommand: parse its flags, read the findings file from `--from` (default `findings.json`), call `runPublish()`, and exit with its boolean result (0 for pass, 1 for fail), and verify with a test using a findings file with and without an `important` finding

## 4. Update `Config`/`loadConfig` for the split

- [ ] 4.1 Adjust `Config`/`loadConfig` (`src/config.ts`) so `review` only resolves the fields it needs (`gitlab` connection + `openai`) and `publish` only resolves what it needs (`gitlab` connection + `failOnSeverity`), without requiring the other command's environment variables, and verify with a test that running `publish` does not throw when `OPENAI_API_KEY`/`OPENAI_MODEL`/`OPENAI_BASE_URL` are unset

## 5. Docs

- [x] 5.0 Prepare `package.json` for public npm publishing under `@s16777216/pi-code-review` (`publishConfig.access: public`, `license`, `repository`, `files` excluding `dist/**/*.test.js`, `prepublishOnly: npm run build`), add a root `LICENSE` (MIT), and update `README.md`'s Status/Installation/Running-in-GitLab-CI/Roadmap sections for npm-based distribution — verified with `npm pack --dry-run` showing no test files in the tarball and `npm run build && npm test` passing. Pulled forward ahead of the review/publish split since it was decided mid-change; not part of the original task breakdown.
- [ ] 5.1 Rewrite `README.md`'s "Running in GitLab CI" and "Running locally" sections for the two-subcommand form, and verify the flag names in the examples match `src/index.ts`'s actual option names
- [ ] 5.2 Update `openspec/VERIFY.md` if the verification commands change (they should not — `npm run build`/`npm test` stay the same)

## 6. Verification

- [ ] 6.1 Run `npm run build` and `npm test` and verify both pass with no regressions in the existing test suite
- [ ] 6.2 Run `review` then `publish` locally against a real GitLab project and a real OpenAI account (reusing the setup from the `gitlab-ai-code-review` change's task 8.2), and verify the findings file is produced by `review`, and that `publish` posts the same findings and returns the expected exit code
