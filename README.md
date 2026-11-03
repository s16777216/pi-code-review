# pi-code-review

AI code review for GitLab merge requests. Two commands: `review` fetches a merge request's diff and runs an AI agent (`pi-agent-core` + `pi-ai`, OpenAI) over it; `publish` posts the findings back to GitLab as inline comments, then decides pass or fail.

The core review logic (`ReviewEngine`) is platform-agnostic; this repository ships the GitLab adapter (`gitlab-mr-context` / `review-output`) on top of it. See `openspec/specs/` for the capability specs, and `openspec/changes/archive/2026-10-29-gitlab-ai-code-review/design.md` for the original architecture decisions.

## Status

This ships as an installable Node.js CLI, published on the public npm registry as [`@s16777216/pi-code-review`](https://www.npmjs.com/package/@s16777216/pi-code-review). There is no Docker image and no GitLab CI/CD Component — a CI job installs the package with `npm`, the same as any other Node.js CLI dependency.

## Requirements

- Node.js >= 20
- A GitLab project and merge request to review, with a personal or project access token (`api` scope) — this tool always authenticates as a user/project token via `PRIVATE-TOKEN`, never as GitLab CI's own `CI_JOB_TOKEN`
- An OpenAI-compatible API endpoint and key (only `review` needs this)

## Installation

From npm:

```bash
npm install -g @s16777216/pi-code-review
```

This installs a `picr` command. `npx @s16777216/pi-code-review` works too, with no install step.

From source (for development on this tool itself):

```bash
npm install
npm run build
```

This produces `dist/cli/index.js`, runnable with `node dist/cli/index.js` in place of the `picr` command below.

## The two commands

```
picr review   [flags]   # fetch the MR, run the AI review, write findings.json
picr publish  [flags]   # read findings.json, post inline comments, decide pass/fail
```

- **`review`** never contacts GitLab to publish anything, and never decides pass or fail. Its exit code reflects only whether the review process itself completed (a GitLab or OpenAI API error) — not the severity of what it found. Running it locally and stopping there is the normal way to just see what the AI found, with no side effect on the merge request.
- **`publish`** reads the findings file `review` wrote, publishes every finding, and only then decides pass/fail from the severity threshold. Publishing always happens first, so a severity threshold can never prevent a finding from reaching the merge request.
- Each command only accepts the flags it needs. `review` has no `--fail-on`; `publish` has no `--model`/`--openai-base-url`/`--openai-api-key`.

## Configuration

Every setting can come from an environment variable or a CLI flag. **A CLI flag always wins over its matching environment variable when both are given.** Secrets (`OPENAI_API_KEY`, `GITLAB_TOKEN`) should normally stay environment variables — see [Running locally](#running-locally) for the trade-off of passing them as flags instead.

Used by both commands:

| Environment variable | CLI flag | Required | Notes |
|---|---|---|---|
| `CI_API_V4_URL` | `--gitlab-url` | Yes | e.g. `https://gitlab.com/api/v4`. Set automatically by GitLab CI. |
| `CI_PROJECT_ID` | `--project-id` | Yes | Set automatically by GitLab CI. |
| `CI_MERGE_REQUEST_IID` | `--mr` | Yes for `publish`; `review` skips and exits 0 if neither this nor `--mr` is set | Set automatically by GitLab CI on a merge-request pipeline. |
| `GITLAB_TOKEN` | `--token` | Yes | **Secret.** A personal or project access token with the `api` scope, sent under the `PRIVATE-TOKEN` header. This is **not** GitLab CI's own `CI_JOB_TOKEN` — see [Auth](#auth) below. |
| `DEBUG` | `--debug` | No (default off) | `true`/`1` (env) or bare `--debug` (flag) turns on debug logging to stderr — see [Debug logging](#debug-logging) below. |

`review`-only:

| Environment variable | CLI flag | Required | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | `--openai-api-key` | Yes | **Secret.** |
| `OPENAI_MODEL` | `--model` | Yes | No default on purpose — pick the model explicitly. |
| `OPENAI_BASE_URL` | `--openai-base-url` | Yes | No default on purpose. Use `https://api.openai.com/v1` for OpenAI itself, or your own OpenAI-compatible endpoint. |
| `OPENAI_MAX_TOKENS` | `--max-tokens` | No (default `32000`) | Max output tokens per model call. Some models spend a chunk of this on "thinking" content before their final answer — if a review intermittently fails with an empty/unparsable response, raise this. |
| `OPENAI_CONTEXT_WINDOW` | `--context-window` | No (default `128000`) | The model's context window in tokens. Must be larger than `OPENAI_MAX_TOKENS`. The answer is capped at this window minus the input and a 4096-token margin. A merge request whose first request needs more than half of this window is reviewed in batches — see [Large merge requests](#large-merge-requests). Set it to your model's real window. |
| `REVIEW_LANGUAGE` | `--language` | No | The language for finding summaries, e.g. `Traditional Chinese`, `zh-TW`, or `繁體中文`. At most 64 characters, one line. JSON field names, severity values, and the `**[severity]**` label in comments stay in English. Unset keeps English summaries. `review` only. |
| (n/a) | `--out` | No (default `findings.json`) | Where `review` writes its findings file. |

`publish`-only:

| Environment variable | CLI flag | Required | Notes |
|---|---|---|---|
| `FAIL_ON_SEVERITY` | `--fail-on` | No (default `important`) | `important`, `nit`, or `none`. `publish`'s exit code is non-zero when any published finding meets or exceeds this threshold; `none` always exits 0. |
| (n/a) | `--from` | No (default `findings.json`) | Which findings file `publish` reads. |

### Auth

This tool always authenticates with a personal or project access token, sent under the `PRIVATE-TOKEN` header — the same whether it runs locally or in CI. It never uses GitLab CI's own `CI_JOB_TOKEN`/`JOB-TOKEN`, so there is no zero-configuration path in CI: every pipeline that runs this tool needs `GITLAB_TOKEN` set as a CI/CD variable, holding a real access token, exactly as `OPENAI_API_KEY` already needs to be.

To create one: **User Settings → Access Tokens** (personal) or **Project Settings → Access Tokens** (project), scope `api`, with at least Developer access to the project.

### Debug logging

`--debug` (or `DEBUG=true`/`DEBUG=1`) turns on detailed logging to stderr, for both `review` and `publish`. It is off by default and never changes a command's exit code, stdout output, or the findings file's contents — it only adds log lines.

Under `--debug` you get:
- Every GitLab API call's HTTP method, URL, and response status (never headers or request/response bodies)
- The exact prompt sent to the AI agent, and its raw response text, before that text is parsed into findings

`GITLAB_TOKEN`/`OPENAI_API_KEY`/the `PRIVATE-TOKEN` header are never printed, with or without `--debug` — this is enforced structurally (via [`pino`](https://getpino.io/)'s `redact` option), not by each log call remembering to omit them.

## Running in GitLab CI

```yaml
review:
  stage: test
  image: node:20
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  script:
    - npm install -g @s16777216/pi-code-review
    - picr review
  artifacts:
    paths:
      - findings.json

publish:
  stage: test
  image: node:20
  needs: ["review"]
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  script:
    - npm install -g @s16777216/pi-code-review
    - picr publish
```

`CI_API_V4_URL`, `CI_PROJECT_ID`, and `CI_MERGE_REQUEST_IID` are already set by GitLab CI. `GITLAB_TOKEN` is not — set it yourself as a masked CI/CD variable (**Settings → CI/CD → Variables**), holding a personal or project access token (see [Auth](#auth)); both jobs need it. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL` the same way — only the `review` job needs those three.

## Running locally

Usually only `review` — see which findings the AI reports, with no GitLab side effect:

```bash
OPENAI_API_KEY="sk-..." \
picr review \
  --gitlab-url "https://gitlab.example.com/api/v4" \
  --project-id 123 \
  --mr 7 \
  --model gpt-4.1 \
  --openai-base-url https://api.openai.com/v1
```

This writes `findings.json` in the current directory. Open it to see what the AI found.

To actually publish those findings to the merge request, run `publish` against the same `findings.json`:

```bash
GITLAB_TOKEN="<personal or project access token>" \
picr publish \
  --gitlab-url "https://gitlab.example.com/api/v4" \
  --project-id 123 \
  --mr 7
```

PowerShell:

```powershell
$env:OPENAI_API_KEY = "sk-..."

picr review `
  --gitlab-url "https://gitlab.example.com/api/v4" `
  --project-id 123 `
  --mr 7 `
  --model gpt-4.1 `
  --openai-base-url https://api.openai.com/v1
```

```powershell
$env:GITLAB_TOKEN = "<personal or project access token>"

picr publish `
  --gitlab-url "https://gitlab.example.com/api/v4" `
  --project-id 123 `
  --mr 7
```

Running from source instead of the npm package: replace `picr` with `node dist/cli/index.js` everywhere above.

## Large merge requests

`review` estimates the size of its first model request before it sends it. When that request needs more than half of the context window (`--context-window`), `review` splits the change into batches and runs one agent for each batch. The other half of the window stays free for file reads and the answer.

- Files are sorted by path and packed into batches, so files in the same directory usually share a batch. A file too large for one batch is split at its hunks, shown as `<path> (part k of n)`, with the file's real line numbers.
- Each batch sees the title, the description, a list of every changed file, and only its own diffs. It can still read any changed file with `get_file_content`.
- A finding from a batch counts only on a line of that batch's own diffs. The outputs of all batches are merged, and the usual checks (linked discussions, diff lines, anchors, fixed declarations) run once on the merged output.
- At most 20 batches, and at most 3 run at the same time. A review that needs more batches, or that has one hunk too large for a batch, fails before the first model call.
- A model call that ends with an error (for example, a timeout) is tried again, at most 2 more times, after 2 and 4 seconds. This applies to a review without batches too. When a batch still fails, the other batches are stopped, and `review` exits with a non-zero code without writing a findings file.

Files whose diff is not reviewed (too large, or generated; see [Output](#output)) are not counted in the estimate and are never part of a batch.

**Limit:** a problem that needs code from two batches can be missed. A merge request that fits half of the window is reviewed in one run, as before.

## Existing discussions

During `review`, the agent can read the merge request's existing discussions through a `list_discussions` tool: comments from people and from earlier runs of this tool, with file, line, resolved state, and authors. It uses them to avoid repeating a problem that a discussion already covers, and to respect explanations such as "this is intentional". A finding that covers the same problem as an existing discussion carries `relatesTo: <discussion id>` in `findings.json`.

Each comment that `publish` posts starts with a hidden `<!-- pi-code-review -->` marker, so later runs can tell this tool's comments from a person's.

The agent can also declare that one of this tool's own open comments is fixed, with a reason. `review` accepts the declaration only after a check on the code: the exact line that the comment pointed at (same file, same text, ignoring indentation) must no longer be in the current file, or the file must be deleted. `publish` then replies `Resolved: <reason>` and resolves the discussion. This check is strict on purpose: a fix made somewhere else (for example, in a caller) leaves the comment open for a person to resolve. A discussion that a person started is never resolved by this tool. Fixed declarations never affect pass or fail.

**Risk:** anyone who can comment on the merge request writes text that the agent reads. The agent is told to treat that text as information, not instructions, but a crafted comment can still influence the review, for example to leave out a finding. Keep this in mind when `publish`'s exit code gates a merge.

## Output

`review` writes:
- A findings file (default `findings.json`) — the findings, the fixed declarations, the unreviewed files, and the diff refs `publish` needs

Some changed files are not reviewed, and are listed in the findings file as `unreviewedFiles`:
- `too_large`: GitLab does not return a diff that is over its size limit. `review` logs a warning for each such file.
- `generated`: GitLab marks the file as generated, for example a lock file. Its diff is left out of the review on purpose.

The review input shows these files with the reason and no diff, and a finding on them is dropped. The agent can still read them with `get_file_content`.

`publish` writes/does:
- One inline GitLab merge request comment per finding, with the finding's severity and summary, except:
  - a finding whose `relatesTo` names an **open** discussion posts nothing (it is already being discussed);
  - a finding whose `relatesTo` names a **resolved** discussion is posted as a reply in that discussion, which is then reopened;
  - a finding without `relatesTo` is matched to a discussion from this tool on the same code (same file and same line text, so a reworded finding or a moved line still matches): it posts nothing when that discussion is **open**, and is posted as a reply that reopens it when that discussion is **resolved** (the newest one, if there are several).

  Findings that would post on the same file and line become one comment, and findings that would reply to the same discussion become one reply. The comment has one paragraph for each finding, each with its own severity.

  Reopening needs a token whose role can resolve discussions (Developer or higher). If reopening fails, the reply stays and `publish` logs a warning. If the existing discussions cannot be read, `publish` logs a warning and posts every finding as a new comment.
- One general merge request comment that lists the files too large to review, when there are any. Later runs update the same comment instead of adding another one, and when no file is too large any more, it says that every changed file was reviewed. Generated files are not listed.
- Process exit code: `0` if no finding meets `FAIL_ON_SEVERITY`, `1` otherwise. Every finding in the file counts, including the ones that posted nothing

## Development

```bash
npm run dev    # run src/cli/index.ts directly with tsx, no build step
npm test       # run the test suite (node:test)
npm run build  # type-check and compile to dist/
```

## Versioning

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE:`, `chore:`, ...). `npm run release` (wraps [`commit-and-tag-version`](https://github.com/absolute-version/commit-and-tag-version)) reads them to bump the version in `package.json`, update `CHANGELOG.md`, and create a git tag. It never publishes — run `git push --follow-tags` and `npm publish` yourself when ready.
