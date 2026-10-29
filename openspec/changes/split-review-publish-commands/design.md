## Context

See `proposal.md` - Why. Today `src/index.ts` has one entrypoint: `main()` calls `runReview()`, which builds a `ReviewContext`, runs `AgentReviewEngine`, calls `GitLabSinkProvider.publish()`, and decides pass/fail from `decidePassFail(findings, config.failOnSeverity)`. All of this already exists and is unit-tested; this change reshapes the CLI around it rather than rewriting the underlying `ReviewEngine`/`SourceProvider`/`SinkProvider` boundary.

## Goals / Non-Goals

**Goals:**
- A local run can stop after seeing the AI's findings, with no GitLab side effect.
- `review` and `publish` can run as two separate CI job steps later (this change does not build that CI wiring — see Non-Goals).

**Non-Goals:**
- Validating that the merge request has not changed between `review` and `publish` (for example, new commits that would make the saved `diffRefs` stale). `publish` uses whatever `diffRefs` the findings file carries, even if GitLab would reject them. A stale-`diffRefs` failure surfaces as a `GitLabApiError` from `createDiscussion`, same as any other GitLab API failure today.
- Building the two-job GitLab CI/CD Component wiring (passing `findings.json` as a CI artifact between a `review` job and a `publish` job). This change only builds the two CLI commands. Docker/CI-CD-Component packaging, deferred in the `gitlab-ai-code-review` change, is now superseded rather than just deferred: the tool publishes to the public npm registry as `@s16777216/pi-code-review` instead (see `package.json`'s `publishConfig`/`files`/`prepublishOnly`, and `README.md`'s Installation and Running in GitLab CI sections). A CI job installs the published package with `npm install -g`; there is no plan to build a Docker image or a `templates/*.yml` CI/CD Component.
- Changing anything about `GitLabSourceProvider`, `GitLabSinkProvider`, `AgentReviewEngine`, or the diff line-mapping logic. All of that is reused as-is; only `src/index.ts`'s orchestration and CLI parsing change.

## Decisions

### Findings file schema: `{ diffRefs, findings }`
```ts
interface FindingsFile {
  diffRefs: GitLabDiffRefs; // { baseSha, startSha, headSha }
  findings: Finding[];
}
```
`diffRefs` is the only thing `publish` cannot get anywhere else: `GitLabSinkProvider` needs it to position inline comments, and it originally comes from `GitLabSourceProvider.getDiffRefs()` during `review`. Everything else `publish` needs (the GitLab project/MR to post to, the job token) comes from its own CLI flags/environment variables, the same as `review`'s — the findings file does not duplicate `mergeRequestIid` or any connection detail, since `publish` already requires those independently to call the GitLab API.

Alternative considered: also store `mergeRequestIid` in the file and cross-check it against `publish`'s own `--mr` flag. Rejected for this change — no staleness validation is a stated non-goal, and a mismatch would be a user error that surfaces naturally (publish posts to the wrong MR, or GitLab rejects it) without needing a dedicated check.

### Severity-threshold decision moves to `publish`, not `review`
`decidePassFail()` (`src/report/exitCode.ts`) is unchanged — still a pure function of `Finding[]` and a threshold, still knows nothing about GitLab. What changes is which command calls it: `publish`, after `GitLabSinkProvider.publish()` completes, not `review`.

Rationale: if `review`'s exit code reflected severity and a CI pipeline's job graph stops on a failed job, an "important" finding would make `review` fail, and `publish` might never run — the findings would never actually reach the merge request, which defeats the point of finding them. Deciding pass/fail only after publishing guarantees the comments and the Code Quality report always exist before anything can block the pipeline.

This is why the "Decide the pass/fail outcome" requirement moves out of the `ai-diff-review` spec (see that capability's `REMOVED Requirements`) into `review-cli` instead of staying put: the decision was never really owned by the engine's own interface, and now it has an explicit new home.

### CLI shape: `node dist/index.js review` / `node dist/index.js publish --from <file>`
Node's built-in `parseArgs` (already used for the current flags) supports positional arguments via `allowPositionals: true`. The first positional argument is the subcommand (`review` or `publish`); everything else parses the same way flags do today.

Each subcommand gets its own `parseArgs` option set, so a flag that belongs to the other command is rejected as unknown (`strict: true`, same as today) rather than silently ignored:
- `review`: `--gitlab-url`, `--project-id`, `--mr`, `--job-token`, `--auth-header`, `--model`, `--openai-base-url`, `--openai-api-key`, plus `--out` (findings file path, default `findings.json`).
- `publish`: `--gitlab-url`, `--project-id`, `--mr`, `--job-token`, `--auth-header`, `--fail-on`, plus `--from` (findings file path, default `findings.json`).

`review` does not accept `--fail-on`; `publish` does not accept `--model`/`--openai-base-url`/`--openai-api-key`. Both still read the matching environment variables as a fallback, exactly as today (CLI flag wins over environment variable — unchanged from the `gitlab-ai-code-review` change's precedence decision). `Config` (in `src/config.ts`) splits accordingly: `review` only needs `Config`'s `gitlab` + `openai` fields; `publish` only needs `gitlab` + `failOnSeverity`. Whether this becomes two narrower types or one `Config` type used partially is an implementation detail for `tasks.md`, not a spec-level concern.

### `src/index.ts` splits `runReview()` into `runReview()` (review-only) and `runPublish()` (publish-only)
`runReview(options): Promise<FindingsFile>` keeps the source-adapter-plus-engine logic, and returns the findings plus diff refs instead of publishing them. A thin wrapper writes that to the output file. `runPublish(options): Promise<boolean>` takes a `FindingsFile`, runs `GitLabSinkProvider.publish()`, then `decidePassFail()`, and returns the outcome. Both keep the existing dependency-injection shape (`client`/`provider` passed in), so the existing test patterns (fake `MergeRequestProvider`/`MergeRequestWriter`, `fauxProvider()`) carry over unchanged.

## Risks / Trade-offs

- [Risk] A person runs `publish` against a `findings.json` left over from reviewing a different merge request (stale file, wrong `--mr`). -> Mitigation: none by design (see Non-Goals) — GitLab's own API will reject mismatched `diffRefs` with a normal `GitLabApiError`, which already surfaces per-finding without stopping the whole batch (existing `review-output` behavior, unchanged).
- [Risk] Someone relies on the old single-command behavior (`node dist/index.js` with no subcommand) in an existing CI job. -> Mitigation: this is the proposal's one **BREAKING** change; `tasks.md` includes updating `README.md`'s CI example to the two-step form.
