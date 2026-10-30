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
The first argument (`argv[0]`) is the subcommand (`review` or `publish`); everything after it parses the same way flags do today. Implemented as plain indexing (`main()` takes `argv[0]` as the command, `argv.slice(1)` as the rest), not `parseArgs`'s `allowPositionals`: confirmed by hand that `parseArgs({ allowPositionals: true, strict: false })` with no `options` defined misparses a value-taking flag like `--from x.json` (it treats `--from` as a boolean `true` and `x.json` as a second positional), since the two subcommands' flag sets aren't known at that point. Plain indexing has no such ambiguity.

Each subcommand gets its own `parseArgs` option set, so a flag that belongs to the other command is rejected as unknown (`strict: true`, same as today) rather than silently ignored:
- `review`: `--gitlab-url`, `--project-id`, `--mr`, `--token`, `--model`, `--openai-base-url`, `--openai-api-key`, plus `--out` (findings file path, default `findings.json`).
- `publish`: `--gitlab-url`, `--project-id`, `--mr`, `--token`, `--fail-on`, plus `--from` (findings file path, default `findings.json`).

`review` does not accept `--fail-on`; `publish` does not accept `--model`/`--openai-base-url`/`--openai-api-key`. Both still read the matching environment variables as a fallback, exactly as today (CLI flag wins over environment variable — unchanged from the `gitlab-ai-code-review` change's precedence decision). `Config` (in `src/config.ts`) splits accordingly: `review` only needs `Config`'s `gitlab` + `openai` fields; `publish` only needs `gitlab` + `failOnSeverity`. Whether this becomes two narrower types or one `Config` type used partially is an implementation detail for `tasks.md`, not a spec-level concern.

### Auth: always a personal/project access token, never `CI_JOB_TOKEN`
The `gitlab-ai-code-review` change supported two token types: GitLab CI's own `CI_JOB_TOKEN` (sent under `JOB-TOKEN`, for zero-config production use), and a personal/project access token (sent under `PRIVATE-TOKEN`, for local manual runs), selected by `GITLAB_AUTH_HEADER`/`--auth-header`.

That zero-config argument no longer holds once `review`/`publish` are split: a pipeline running this tool already needs to set `OPENAI_API_KEY` as a CI/CD variable (OpenAI was never auto-injected by GitLab CI), so "never needs any manual secret setup" was already false. Given that, keeping two token types and a header-selection flag bought less than it cost: one fewer environment variable to document (`GITLAB_AUTH_HEADER` removed), one fewer CLI flag per command (`--auth-header` removed), and one fewer concept to explain (why there are two kinds of GitLab token).

Decision: both commands always send a personal/project access token under `PRIVATE-TOKEN`. `CI_JOB_TOKEN`/`GITLAB_AUTH_HEADER`/`--auth-header` are removed. The env var/flag carrying the token is renamed from `CI_JOB_TOKEN`/`--job-token` to `GITLAB_TOKEN`/`--token`, since the value is no longer ever a CI job token — keeping the old name would have been actively misleading. `GitLabClientOptions.jobToken` becomes `GitLabClientOptions.token`; `GitLabClient`'s `request()` hardcodes the `PRIVATE-TOKEN` header with no field to override it.

Trade-off accepted: a CI pipeline that runs this tool can no longer authenticate for free. Every pipeline needs a `GITLAB_TOKEN` CI/CD variable holding a real access token, the same setup step as `OPENAI_API_KEY` already required. See the `gitlab-mr-context` capability's `REMOVED`/`ADDED` requirements for the spec-level change.

### `src/index.ts` splits `runReview()` into `runReview()` (review-only) and `runPublish()` (publish-only)
`runReview(options): Promise<FindingsFile>` keeps the source-adapter-plus-engine logic, and returns the findings plus diff refs instead of publishing them. A thin wrapper writes that to the output file. `runPublish(options): Promise<boolean>` takes a `FindingsFile`, runs `GitLabSinkProvider.publish()`, then `decidePassFail()`, and returns the outcome. Both keep the existing dependency-injection shape (`client`/`provider` passed in), so the existing test patterns (fake `MergeRequestProvider`/`MergeRequestWriter`, `fauxProvider()`) carry over unchanged.

## Risks / Trade-offs

- [Risk] A person runs `publish` against a `findings.json` left over from reviewing a different merge request (stale file, wrong `--mr`). -> Mitigation: none by design (see Non-Goals) — GitLab's own API will reject mismatched `diffRefs` with a normal `GitLabApiError`, which already surfaces per-finding without stopping the whole batch (existing `review-output` behavior, unchanged).
- [Risk] Someone relies on the old single-command behavior (`node dist/index.js` with no subcommand) in an existing CI job. -> Mitigation: this is the proposal's one **BREAKING** change; `tasks.md` includes updating `README.md`'s CI example to the two-step form.
