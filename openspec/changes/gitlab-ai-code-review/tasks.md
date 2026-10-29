## 1. Project setup

- [x] 1.1 Confirm `package.json` and `tsconfig.json` match the design (TypeScript, Node.js, `pi-agent-core` and `pi-ai` dependencies) and verify `npm install` succeeds
- [x] 1.2 Add `src/config.ts` that reads and validates all environment variables (`CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_MERGE_REQUEST_IID`, `CI_JOB_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `FAIL_ON_SEVERITY`) and verify it throws a clear error for each missing required variable
- [x] 1.3 Add shared `src/types.ts` for `Severity` and diff line types (the `ReviewContext`/`Finding`/`ReviewEngine` interfaces themselves are added in task 4.0), and verify the project compiles with `npm run build`

## 2. GitLab MR context (`gitlab-mr-context` capability)

- [x] 2.1 Implement `src/gitlab/client.ts` with a function to fetch merge request metadata (title, description, diff refs) and verify it against a recorded/mocked API response
- [x] 2.2 Implement a function to fetch the merge request diff (per changed file: old path, new path, hunk text) and verify it parses a sample multi-file diff correctly
- [x] 2.3 Implement a function to fetch a file's full content at the head commit and verify it returns an error object (not a throw) on a 404
- [x] 2.4 Implement the `JOB-TOKEN` auth header on every request and verify a request is rejected with a clear error before any API call when `CI_JOB_TOKEN` is unset
- [x] 2.5 Implement the "skip when not an MR pipeline" check (`CI_MERGE_REQUEST_IID` unset) and verify the process exits 0 with a log message — the check itself (`isMergeRequestPipeline()`) was added and tested in task 1.2; wiring it to `process.exit(0)` happens in task 6.1 once `src/index.ts` exists
- [x] 2.6 Define `SourceProvider`/`SinkProvider` (`src/review/providers.ts`) and implement `GitLabSourceProvider implements SourceProvider` (`src/gitlab/sourceProvider.ts`), assembling a `ReviewContext` from `MergeRequestProvider`, and verify with a fake `MergeRequestProvider` (no `fetch` mock needed) that the built context's fields and `getFileContent` match the fixture

## 3. Diff line mapping

- [x] 3.1 Implement a unified-diff parser that maps each hunk line to its `new_line` number (added and context lines only) and verify it against a table of sample hunks with known line numbers
- [x] 3.2 Implement a lookup that, given a file path and a line number, confirms whether that line is a valid new-file line in the merge request's diff, and verify it rejects a line number outside any hunk

## 4. ReviewEngine (`ai-diff-review` capability)

- [x] 4.0 Define the `ReviewEngine` interface in `src/review/engine.ts` (alongside `SourceProvider`/`SinkProvider` in `src/review/providers.ts`, as a behavior contract rather than a data shape), with no import from `src/gitlab/`, and verify this with a manual review of imports — `ReviewContext`/`ChangedFileDiff`/`Finding` were already pulled forward into `src/types.ts` in task 2.6
- [x] 4.1 Implement `src/review/prompt.ts` to build the agent's input from a `ReviewContext`'s title, description, and every changed file's diff, and verify the built prompt contains all changed file paths from a hand-built `ReviewContext` fixture
- [x] 4.2 Implement the `get_file_content` agent tool (`src/review/agent.ts`), backed by `ReviewContext.getFileContent`, that only accepts paths from the context's changed files, and verify it returns an error result for any other path
- [x] 4.3 Wire up `pi-ai`'s `openaiProvider()` and `pi-agent-core`'s agent loop with the tool from 4.2 in `AgentReviewEngine` (`src/review/engine.ts`), and verify with `pi-ai`'s `fauxProvider()` that a scripted multi-turn response (tool call, then final text) runs through the real `Agent` loop and produces agent output text — no network call, but exercises the real library, not a hand-rolled fake
- [x] 4.4 Implement `src/review/findings.ts` to parse the agent's final output into `Finding[]` (file, line, severity, summary), and verify it rejects non-JSON or malformed output with a review-failure error
- [x] 4.5 Wire the diff line-mapping lookup (3.2) into finding validation, and verify a finding with an out-of-diff file or line is dropped before it reaches the output stage
- [x] 4.6 Implement `src/report/exitCode.ts` to compare `Finding[]` against `FAIL_ON_SEVERITY` (default `important`) and return a pass/fail outcome, and verify all three scenarios from the `ai-diff-review` spec (threshold met, not met, set to `none`)
- [x] 4.7 Verify end-to-end: a hand-built `ReviewContext` fixture with known injected bugs produces findings and a pass/fail outcome that match expectations in a local test run, with no GitLab API call involved

## 5. Review output (`review-output` capability)

- [x] 5.1 Implement `src/gitlab/client.ts` additions to post a merge request discussion at a given file/line position (`createDiscussion`, behind a new `MergeRequestWriter` interface), and verify the position payload includes `base_sha`, `start_sha`, `head_sha`, and `new_path`/`new_line`
- [x] 5.2 Implement per-finding discussion posting with error isolation (one failed post does not stop the others), and verify with a fake `MergeRequestWriter` that one failure does not stop the other finding's post, or the Code Quality report write
- [x] 5.3 Implement `src/report/codeQuality.ts` to build a GitLab Code Quality report from `Finding[]`, with the `important`/`nit`/`pre_existing` to `major`/`minor`/`info` severity mapping, and verify the output JSON matches GitLab's documented schema
- [x] 5.4 Implement `GitLabSinkProvider implements SinkProvider` (`src/gitlab/sinkProvider.ts`), wiring 5.1-5.3 behind `publish(findings)`, and verify with a fake `MergeRequestWriter` that `publish` posts one discussion per finding and writes the Code Quality report

## 6. CLI entrypoint

- [x] 6.1 Implement `src/index.ts` to run the full flow (GitLab source adapter builds `ReviewContext` -> `ReviewEngine` returns `Finding[]` -> GitLab sink adapter publishes -> pass/fail from `decidePassFail`), exported as a testable `runReview(options)` plus a thin `main()`/entrypoint-guard wrapper for the real GitLab client and `openaiProvider()`, and verify it end-to-end with a fake GitLab client and `pi-ai`'s `fauxProvider()`
- [x] 6.2 Add structured console logging for each stage (fetch, review, publish, result) and verify with a captured `console.log` that the output never contains the configured OpenAI API key or GitLab job token

## 7. Packaging

- [ ] 7.1 Add a `Dockerfile` that builds the TypeScript project and runs `dist/index.js`, and verify `docker build` succeeds and `docker run` (with required env vars) executes without a missing-module error
- [ ] 7.2 Add `templates/code-review.yml` as a GitLab CI/CD Component (`spec: inputs:` for `stage`, `image`, `fail_on_severity`), and verify `openspec`/`gitlab-ci-local` or a manual GitLab lint (`POST /ci/lint`) accepts the template
- [ ] 7.3 Add a short usage section to `README.md` showing the `include: component:` snippet and the required CI/CD variables (`OPENAI_API_KEY`, `OPENAI_MODEL`), and verify the snippet matches the component's actual input names

## 8. Verification

- [ ] 8.1 Run `npm run build` (the command in `openspec/VERIFY.md`) and verify it exits 0 with no type errors
- [ ] 8.2 Run the full flow against a real test GitLab project and a real OpenAI account on a merge request with at least one seeded bug, and verify an inline comment, a Code Quality report entry, and a non-zero exit code all appear for that bug
