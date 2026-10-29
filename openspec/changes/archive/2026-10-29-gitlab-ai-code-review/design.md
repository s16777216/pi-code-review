## Context

See `proposal.md` - Why. This design covers a new, standalone Node.js/TypeScript tool. It has no existing code to integrate with. The tool runs once per GitLab merge request pipeline, as a single CI job with no persistent state between runs.

GitLab CI gives the job these facts for free: `CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_MERGE_REQUEST_IID` (only set on a merge-request pipeline), and `CI_JOB_TOKEN`.

## Goals / Non-Goals

**Goals:**
- Run as one short-lived CI job per merge request, with no external state store.
- Keep the OpenAI integration on a well-documented, first-class path.

**Non-Goals:**
- Multi-round review convergence (round caps, diff-only re-review, no-repeat findings). The source article covers this as a later optimization; this change ships a single review pass per pipeline run.
- Security-specific review. This change produces correctness/bug findings only; a separate tool or job can cover security review.
- Risk-tiered human approval routing. This change only gates the CI job's exit code; it does not decide who must approve the merge request.
- A second platform adapter. GitHub and Gitea adapters are planned (see the `SourceProvider`/`SinkProvider` decision below), but this change builds and ships only the GitLab adapter. It does not build a GitHub adapter, a Gitea adapter, or a local-CLI adapter.
- Docker image and GitLab CI/CD Component packaging. Deferred to a follow-up change — see the Packaging decision below. This change ships a Node.js CLI, documented in `README.md`, runnable directly with `node` in a hand-written CI job step or locally.

## Decisions

### Engine/adapter boundary: `ReviewEngine` is platform-agnostic; GitLab is an adapter
The `ai-diff-review` capability is a `ReviewEngine`. It has no GitLab-specific code. It takes a `ReviewContext`:

```ts
interface ChangedFileDiff {
  oldPath: string | null
  newPath: string | null
  hunks: string // unified diff text for this file
}

interface ReviewContext {
  title: string
  description: string
  changedFiles: ChangedFileDiff[]
  getFileContent(path: string): Promise<string | { error: string }>
}

interface ReviewEngine {
  review(context: ReviewContext): Promise<Finding[]>
}
```

The engine also owns the severity-gated exit-code decision (compare `Finding[]` against `FAIL_ON_SEVERITY`): that decision only needs `Finding[]` and a threshold, not anything GitLab-specific.

GitLab support is two adapters around this boundary:
- The `gitlab-mr-context` capability is the source adapter. It builds a `ReviewContext` from a merge request.
- The `review-output` capability is the sink adapter. It takes the engine's `Finding[]` and publishes them to GitLab (inline comments, Code Quality report). It does not decide the exit code.

Rationale: the GitLab API calls (diff fetch, file fetch, discussion posting, Code Quality format) are the parts most likely to need a sibling implementation later (GitHub, a local `git diff`, a different CI system). Isolating them behind `ReviewContext` in and `Finding[]` out means the engine, the prompt, the agent wiring, and the severity gate are reusable without a GitLab dependency, and can be tested with a hand-built `ReviewContext` instead of a mocked GitLab API.

Alternative considered: keep the exit-code decision in the GitLab sink adapter (`review-output`), next to the other publishing logic. Rejected because the decision itself (`Finding[]` + threshold -> exit code) has nothing to do with GitLab; keeping it there would force a future non-GitLab adapter to re-implement the same comparison.

### `SourceProvider`/`SinkProvider`: the host-agnostic boundary, one level above the GitLab REST wrapper
GitHub and Gitea support are planned. GitLab, GitHub, and Gitea diff APIs do not share a common shape (for example, GitLab's `diff_refs` has three SHAs; GitHub's compare API has two), so sharing `MergeRequestProvider` itself across hosts would mean forcing GitLab's shape onto hosts that do not have it. Instead, the shared boundary sits one level up, at `ReviewContext`/`Finding[]`, which is already host-agnostic by construction (see the `ReviewEngine` decision above). Two small interfaces make that boundary explicit:

```ts
interface SourceProvider {
  buildReviewContext(): Promise<ReviewContext>
}

interface SinkProvider {
  publish(findings: Finding[]): Promise<void>
}
```

`GitLabSourceProvider implements SourceProvider` (`src/gitlab/sourceProvider.ts`) is the only implementation this change ships. It takes a `MergeRequestProvider` and a merge request IID, and assembles a `ReviewContext` from `getMergeRequest` + `getMergeRequestDiff`, with `ReviewContext.getFileContent` proxying to `MergeRequestProvider.getFileContent` at the merge request's head SHA. A future `GitHubSourceProvider` or `GiteaSourceProvider` would implement the same `SourceProvider` interface over its own REST client, with no shared base class, because the two providers would share no implementation — only the `ReviewContext` shape they both produce. The equivalent `GitLabSinkProvider implements SinkProvider` is built in task 5.x (the `review-output` capability).

The engine (and the CLI entrypoint that wires it up) depends on `SourceProvider`/`SinkProvider`/`ReviewEngine`, never on `GitLabClient` or `MergeRequestProvider` directly.

### Agent runtime: `pi-agent-core` + `pi-ai`, not `libfx`
Both were evaluated against this project's actual shape: a one-shot, stateless review per CI job.

- `pi-agent-core`/`pi-ai` is pure TypeScript/JavaScript, with no native addon. This removes a multi-arch Docker build risk. OpenAI is a first-class, documented provider (`openaiProvider()`).
- `libfx` is built around durable sessions, checkpoints, and a queue (features for a long-running agent process). None of that is needed for a job that starts, reviews one merge request, and exits. `libfx`'s OpenAI path is an undocumented extrapolation of its generic OpenAI-compatible custom-provider mechanism, and its own docs describe the project as experimental with frequent breaking changes.

Trade-off accepted: if a future change wants a persistent review agent (for example, one that holds a conversation with the merge request author across multiple pushes), this decision would need revisiting.

**Concrete wiring** (`AgentReviewEngine`, `src/review/engine.ts`): `pi-agent-core`'s `Agent` is constructed with a `streamFn` that calls `provider.streamSimple(model, context, { ...options, apiKey })`. `openaiProvider()`'s factory hardcodes `baseUrl: "https://api.openai.com/v1"` and has no parameter to override it, but each `Model` object carries its own `baseUrl` field independently of the provider. The CLI entrypoint (task 6.1) builds its own `Model<"openai-responses">` literal with `baseUrl` set from `OPENAI_BASE_URL`, rather than looking one up from the provider's built-in catalog — this is what makes the required, no-default `OPENAI_BASE_URL` variable (see the `ai-diff-review` spec) actually take effect. `apiKey` is passed per request, not read from `OPENAI_API_KEY` by the provider's own auth resolution, so the engine does not depend on `pi-ai`'s credential-store machinery at all.

Tests (`engine.test.ts`) use `pi-ai`'s `fauxProvider()` + `fauxAssistantMessage()`/`fauxToolCall()` instead of a hand-mocked `fetch`. This runs the real `Agent` loop (multi-turn, real tool execution) against a scripted response sequence, which exercises the actual library code the production path uses, not just our own code around it.

### `GitLabClient` is accessed through a `MergeRequestProvider` interface
`src/gitlab/client.ts` exports a `MergeRequestProvider` interface (`getMergeRequest`, `getMergeRequestDiff`, `getFileContent`) alongside the concrete `GitLabClient` implementation. The source adapter (`gitlab-mr-context`) and the sink adapter (`review-output`) depend on `MergeRequestProvider`, not on `GitLabClient` directly. Their tests can pass a hand-written fake instead of mocking `fetch`. This mirrors the `ReviewContext`/`ReviewEngine` boundary: explicit interfaces at module edges, even where TypeScript's structural typing would not strictly require one.

This stays a plain `interface`, not an `abstract class`: the three methods share no common implementation, so there is nothing for a base class to provide. An interface also keeps fakes trivial in tests (a plain object literal satisfies it) without introducing a runtime base class that invites shared state later.

`GitLabClient` itself uses a private constructor plus a `static async create()` factory, instead of a public constructor or a separate `initialize()` step. Today's setup (validate the job token, store three strings) happens to be synchronous, but the factory means a future setup step that needs to `await` something (for example, resolving a project path to its numeric ID) can be added without changing the call shape, and without ever exposing a half-constructed instance.

### GitLab integration: REST API with `CI_JOB_TOKEN`, not a webhook or GitLab CLI
The job already runs inside the merge request's own pipeline, so it has the job token and the merge request IID without any extra setup. This requires the project to allow job tokens to call the merge requests API ("Limit access _to this project_" setting), which is documented as a one-time setup step for adopters.

**Local manual runs.** `CI_JOB_TOKEN`, `CI_API_V4_URL`, `CI_PROJECT_ID`, and `CI_MERGE_REQUEST_IID` only exist inside a real CI job; none can be obtained ahead of time to run the tool by hand against a real GitLab project.

Every config value has a matching CLI flag (parsed by `parseCliOverrides()` in `src/index.ts`, with Node's built-in `node:util.parseArgs`): `--gitlab-url`/`--project-id`/`--mr` for `CI_API_V4_URL`/`CI_PROJECT_ID`/`CI_MERGE_REQUEST_IID`, `--model`/`--openai-base-url`/`--fail-on`/`--auth-header` for `OPENAI_MODEL`/`OPENAI_BASE_URL`/`FAIL_ON_SEVERITY`/`GITLAB_AUTH_HEADER`, and `--openai-api-key`/`--job-token` for `OPENAI_API_KEY`/`CI_JOB_TOKEN`. Every flag wins over its matching environment variable when both are given; the environment variable is used only when the flag is absent. `GITLAB_AUTH_HEADER`/`--auth-header` (default `JOB-TOKEN`) is what lets a local run put a personal or project access token in `CI_JOB_TOKEN`/`--job-token`, sent under the `PRIVATE-TOKEN` header GitLab expects for that token type instead of `JOB-TOKEN`.

`--openai-api-key` and `--job-token` are an accepted, explicitly-requested exception to "secrets stay environment-variable-only": a secret passed as a CLI flag sits in shell history and in `ps`/`/proc/<pid>/cmdline` output for anyone else on the machine to read for the life of the process, which an environment variable does not. The flags exist anyway, for pulling a secret from a local secret manager into a one-off local command; `loadConfig()`'s doc comment and `parseCliOverrides()`'s doc comment both carry this warning.

None of this changes production behavior: a real CI job sets `OPENAI_API_KEY`/`CI_JOB_TOKEN`/`CI_API_V4_URL`/`CI_PROJECT_ID`/`CI_MERGE_REQUEST_IID` as CI/CD variables and never passes these flags, so with no CLI flags given, the tool reads every value from its environment variable exactly as the `gitlab-mr-context` spec requires, under `JOB-TOKEN` by default.

### Diff line mapping: only report findings on added or context lines
GitLab's inline comment position needs `old_line`, `new_line`, or both, depending on whether the target line is added, removed, or unchanged context. Supporting removed-line comments correctly needs both SHAs and careful line-type tracking for limited extra value. This design restricts findings to lines that exist in the new file version (added or context lines in `new_path`), which covers the large majority of real review comments and keeps the diff parser and the position payload simple.

### Finding severity to Code Quality severity mapping
GitLab's Code Quality format expects `info`, `minor`, `major`, `blocker`, or `critical`. This design maps:
- `important` -> `major`
- `nit` -> `minor`
- `pre_existing` -> `info`

### Review scope: diff plus affected files via an on-demand tool
The `ReviewContext`'s title, description, and diff hunks go directly into the agent's prompt. Full file content is not preloaded; the agent calls a `get_file_content` tool, backed by `ReviewContext.getFileContent`, when it needs context beyond the diff hunks. This bounds prompt size on large merge requests while still letting the agent read full affected files when it decides it needs to.

### Packaging: deferred (Node.js CLI for now, Docker image and GitLab CI/CD Component later)
A Docker image and a `templates/code-review.yml` CI/CD Component were originally planned for this change, so adopters would add an `include: component:` line instead of hand-writing a CI job. Both are deferred to a follow-up change — tasks 7.1/7.2 are explicitly skipped (see `tasks.md`). For now the tool ships as a Node.js CLI (`npm install && npm run build && node dist/index.js`), documented in `README.md`, which an adopter wires into their own `script:` step. Nothing about the `ReviewEngine`/`SourceProvider`/`SinkProvider` boundary depends on this decision — packaging is purely a distribution concern layered on top of the same `dist/index.js` entrypoint.

## Risks / Trade-offs

- [Risk] OpenAI API latency or rate limits slow down or fail merge request pipelines. -> Mitigation: the job fails with a clear error and a non-zero exit only on a genuine API error; a transient failure does not silently pass as "no findings" (open question below covers the exact retry policy).
- [Risk] The agent produces a finding that does not map to a real line in the diff (hallucinated line number). -> Mitigation: the validation step (see `ai-diff-review` spec) discards any finding whose file or line does not match the diff before publishing.
- [Risk] A large merge request (many changed files) produces a very large prompt. -> Mitigation: diff hunks only go in the prompt up front; full file reads are on-demand via the tool, not preloaded for every changed file.
- [Risk] `pi-agent-core`/`pi-ai` is a young library; its API may change. -> Mitigation: isolate all calls to it behind a single module (`src/review/agent.ts`) so a future library swap touches one place.

## Open Questions

- Exact retry/backoff policy for transient OpenAI API errors (how many retries, what backoff) is not fixed yet. It can be answered during implementation without changing the specs or the task breakdown.
- Whether to cap the number of findings posted per merge request (to limit comment noise on very large diffs) is left for a follow-up change, once real usage data exists.
