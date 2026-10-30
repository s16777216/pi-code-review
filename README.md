# pi-code-review

AI code review for GitLab merge requests. Two commands: `review` fetches a merge request's diff and runs an AI agent (`pi-agent-core` + `pi-ai`, OpenAI) over it; `publish` posts the findings back to GitLab as inline comments and a Code Quality report, then decides pass or fail.

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

This installs a `pi-code-review` command. `npx @s16777216/pi-code-review` works too, with no install step.

From source (for development on this tool itself):

```bash
npm install
npm run build
```

This produces `dist/index.js`, runnable with `node dist/index.js` in place of the `pi-code-review` command below.

## The two commands

```
pi-code-review review   [flags]   # fetch the MR, run the AI review, write findings.json
pi-code-review publish  [flags]   # read findings.json, post comments + Code Quality report, decide pass/fail
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

`review`-only:

| Environment variable | CLI flag | Required | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | `--openai-api-key` | Yes | **Secret.** |
| `OPENAI_MODEL` | `--model` | Yes | No default on purpose — pick the model explicitly. |
| `OPENAI_BASE_URL` | `--openai-base-url` | Yes | No default on purpose. Use `https://api.openai.com/v1` for OpenAI itself, or your own OpenAI-compatible endpoint. |
| (n/a) | `--out` | No (default `findings.json`) | Where `review` writes its findings file. |

`publish`-only:

| Environment variable | CLI flag | Required | Notes |
|---|---|---|---|
| `FAIL_ON_SEVERITY` | `--fail-on` | No (default `important`) | `important`, `nit`, or `none`. `publish`'s exit code is non-zero when any published finding meets or exceeds this threshold; `none` always exits 0. |
| (n/a) | `--from` | No (default `findings.json`) | Which findings file `publish` reads. |

### Auth

This tool always authenticates with a personal or project access token, sent under the `PRIVATE-TOKEN` header — the same whether it runs locally or in CI. It never uses GitLab CI's own `CI_JOB_TOKEN`/`JOB-TOKEN`, so there is no zero-configuration path in CI: every pipeline that runs this tool needs `GITLAB_TOKEN` set as a CI/CD variable, holding a real access token, exactly as `OPENAI_API_KEY` already needs to be.

To create one: **User Settings → Access Tokens** (personal) or **Project Settings → Access Tokens** (project), scope `api`, with at least Developer access to the project.

## Running in GitLab CI

```yaml
review:
  stage: test
  image: node:20
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  script:
    - npm install -g @s16777216/pi-code-review
    - pi-code-review review
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
    - pi-code-review publish
  artifacts:
    reports:
      codequality: gl-code-quality-report.json
```

`CI_API_V4_URL`, `CI_PROJECT_ID`, and `CI_MERGE_REQUEST_IID` are already set by GitLab CI. `GITLAB_TOKEN` is not — set it yourself as a masked CI/CD variable (**Settings → CI/CD → Variables**), holding a personal or project access token (see [Auth](#auth)); both jobs need it. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL` the same way — only the `review` job needs those three.

## Running locally

Usually only `review` — see which findings the AI reports, with no GitLab side effect:

```bash
OPENAI_API_KEY="sk-..." \
pi-code-review review \
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
pi-code-review publish \
  --gitlab-url "https://gitlab.example.com/api/v4" \
  --project-id 123 \
  --mr 7
```

PowerShell:

```powershell
$env:OPENAI_API_KEY = "sk-..."

pi-code-review review `
  --gitlab-url "https://gitlab.example.com/api/v4" `
  --project-id 123 `
  --mr 7 `
  --model gpt-4.1 `
  --openai-base-url https://api.openai.com/v1
```

```powershell
$env:GITLAB_TOKEN = "<personal or project access token>"

pi-code-review publish `
  --gitlab-url "https://gitlab.example.com/api/v4" `
  --project-id 123 `
  --mr 7
```

Running from source instead of the npm package: replace `pi-code-review` with `node dist/index.js` everywhere above.

## Output

`review` writes:
- A findings file (default `findings.json`) — the findings plus the diff refs `publish` needs

`publish` writes/does:
- One inline GitLab merge request comment per finding, with the finding's severity and summary
- `gl-code-quality-report.json` in the working directory (GitLab Code Quality report format)
- Process exit code: `0` if no finding meets `FAIL_ON_SEVERITY`, `1` otherwise

## Development

```bash
npm run dev    # run src/index.ts directly with tsx, no build step
npm test       # run the test suite (node:test)
npm run build  # type-check and compile to dist/
```

## Versioning

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE:`, `chore:`, ...). `npm run release` (wraps [`commit-and-tag-version`](https://github.com/absolute-version/commit-and-tag-version)) reads them to bump the version in `package.json`, update `CHANGELOG.md`, and create a git tag. It never publishes — run `git push --follow-tags` and `npm publish` yourself when ready.
