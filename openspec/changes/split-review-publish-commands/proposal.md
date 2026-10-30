## Why

A local manual run of the tool today always runs the full flow: fetch the merge request, run the AI review, and publish the findings to GitLab. A person testing locally almost always wants only the first part — they want to see what the AI found, without posting real comments to a real merge request. Splitting the CLI into a `review` step and a separate `publish` step lets a local run stop after the review, and lets a CI pipeline run them as two steps with different retry needs.

## What Changes

- **BREAKING**: `node dist/index.js` (no subcommand) no longer runs the full flow. The CLI now has two subcommands: `review` and `publish`.
- `review` fetches the merge request context, runs the `ReviewEngine`, and writes the findings and the diff refs to a JSON file (default `findings.json`). It does not publish anything to GitLab, and it does not decide pass or fail. Its exit code reflects only whether the review itself completed (GitLab fetch, OpenAI call) — not the severity of what it found.
- `publish` reads a findings file (`--from`, default `findings.json`), publishes the findings to GitLab (inline comments and the Code Quality report, unchanged from today), and then decides pass or fail from `FAIL_ON_SEVERITY` against the findings it just published. Its exit code reflects that decision.
- The severity-threshold pass/fail decision moves from the `ai-diff-review` capability (the `ReviewEngine`) to the new CLI capability. The engine itself never had this as part of its own interface (`review()` already only returned `Finding[]`); only the spec requirement describing when the decision happens moves.
- `review` only accepts GitLab connection flags and OpenAI flags (`--model`, `--openai-base-url`, `--openai-api-key`). `publish` only accepts GitLab connection flags and `--fail-on`. Neither command accepts the other's flags.
- No validation that the merge request has not changed between `review` and `publish` (for example, new commits that would make the saved diff refs stale). This is an explicit non-goal for this change.
- **BREAKING**: Authentication drops GitLab CI's `CI_JOB_TOKEN`/`JOB-TOKEN` mechanism entirely. Both commands now always authenticate with a personal or project access token (`GITLAB_TOKEN` environment variable or `--token` flag), sent under the `PRIVATE-TOKEN` header — the same mechanism locally and in CI. `GITLAB_AUTH_HEADER`/`--auth-header` is removed; there is no header choice left to make.

## Capabilities

### New Capabilities
- `review-cli`: The two-command CLI split (`review`, `publish`), the findings-file interchange format between them, and the exit-code semantics of each command (review: process success; publish: the severity-threshold decision).

### Modified Capabilities
- `ai-diff-review`: Removes the "Decide the pass/fail outcome from a severity threshold" requirement. The `ReviewEngine` itself never decided this through its own interface; the decision's timing moves to the `review-cli` capability's `publish` command, so that publishing always happens before anything can block the pipeline on severity.
- `gitlab-mr-context`: Replaces "Authenticate with the CI job token" with "Authenticate with a GitLab access token". The system now always sends a personal/project access token under `PRIVATE-TOKEN`; it no longer supports `CI_JOB_TOKEN`/`JOB-TOKEN` at all.

## Impact

- `src/index.ts` changes from a single entrypoint to a CLI with two subcommands. `runReview()` splits into a review-only function and a publish-only function.
- New file format: a findings file (JSON) carrying `Finding[]` and the diff refs (`baseSha`/`startSha`/`headSha`) that `GitLabSinkProvider` needs to position inline comments.
- No GitLab CI/CD Component or Docker image: the tool distributes as a public npm package (`@s16777216/pi-code-review`), and a CI job installs it with `npm install -g`. `README.md`'s GitLab CI example changes from one job step to two (`review` then `publish`).
- `README.md` needs its usage examples rewritten for the two subcommands.
