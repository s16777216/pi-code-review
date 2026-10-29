# pi-code-review

AI code review for GitLab merge requests. It fetches a merge request's diff, runs an AI agent (`pi-agent-core` + `pi-ai`, OpenAI) over it, and publishes the findings back to GitLab as inline comments and a Code Quality report.

The core review logic (`ReviewEngine`) is platform-agnostic; this repository ships the GitLab adapter (`gitlab-mr-context` / `review-output`) on top of it. See `openspec/specs/` for the capability specs, and `openspec/changes/archive/2026-10-29-gitlab-ai-code-review/design.md` for the original architecture decisions.

## Status

This ships as an installable Node.js CLI, published on the public npm registry as [`@s16777216/pi-code-review`](https://www.npmjs.com/package/@s16777216/pi-code-review). There is no Docker image and no GitLab CI/CD Component — a CI job installs the package with `npm`, the same as any other Node.js CLI dependency.

## Requirements

- Node.js >= 20
- A GitLab project and merge request to review, with API access (a CI job token in a real pipeline, or a personal/project access token for a local run)
- An OpenAI-compatible API endpoint and key

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

## Configuration

Every setting can come from an environment variable or a CLI flag. **A CLI flag always wins over its matching environment variable when both are given.** Secrets (`OPENAI_API_KEY`, the GitLab token) should normally stay environment variables — see [Running locally](#running-locally) for the trade-off of passing them as flags instead.

| Environment variable | CLI flag | Required | Notes |
|---|---|---|---|
| `CI_API_V4_URL` | `--gitlab-url` | Yes | e.g. `https://gitlab.com/api/v4`. Set automatically by GitLab CI. |
| `CI_PROJECT_ID` | `--project-id` | Yes | Set automatically by GitLab CI. |
| `CI_MERGE_REQUEST_IID` | `--mr` | Yes | Set automatically by GitLab CI on a merge-request pipeline. If neither is set, the tool skips the review and exits 0 — it assumes the pipeline is not reviewing a merge request. |
| `CI_JOB_TOKEN` | `--job-token` | Yes | **Secret.** The real CI job token in a pipeline. For a local run, a personal/project access token works too — pair it with `GITLAB_AUTH_HEADER=PRIVATE-TOKEN`. |
| `GITLAB_AUTH_HEADER` | `--auth-header` | No (default `JOB-TOKEN`) | `JOB-TOKEN` or `PRIVATE-TOKEN`. Which header the token above is sent under. |
| `OPENAI_API_KEY` | `--openai-api-key` | Yes | **Secret.** |
| `OPENAI_MODEL` | `--model` | Yes | No default on purpose — pick the model explicitly. |
| `OPENAI_BASE_URL` | `--openai-base-url` | Yes | No default on purpose. Use `https://api.openai.com/v1` for OpenAI itself, or your own OpenAI-compatible endpoint. |
| `FAIL_ON_SEVERITY` | `--fail-on` | No (default `important`) | `important`, `nit`, or `none`. The CI job's exit code is non-zero when any finding meets or exceeds this threshold; `none` always exits 0. |

The GitLab project also needs to allow its job tokens to call its own merge requests API (**Settings → CI/CD → Token Access**), since that is how the CI job authenticates in production.

## Running in GitLab CI

```yaml
ai-code-review:
  stage: test
  image: node:20
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  script:
    - npm install -g @s16777216/pi-code-review
    - pi-code-review
  artifacts:
    reports:
      codequality: gl-code-quality-report.json
```

`CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_MERGE_REQUEST_IID`, and `CI_JOB_TOKEN` are already set by GitLab CI. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL` as masked CI/CD variables on the project (**Settings → CI/CD → Variables**).

## Running locally

Secrets as environment variables, everything else as CLI flags:

```bash
OPENAI_API_KEY="sk-..." CI_JOB_TOKEN="<personal access token>" \
pi-code-review \
  --gitlab-url "https://gitlab.example.com/api/v4" \
  --project-id 123 \
  --mr 7 \
  --model gpt-4.1 \
  --openai-base-url https://api.openai.com/v1 \
  --auth-header PRIVATE-TOKEN
```

PowerShell:

```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:CI_JOB_TOKEN = "<personal access token>"

pi-code-review `
  --gitlab-url "https://gitlab.example.com/api/v4" `
  --project-id 123 `
  --mr 7 `
  --model gpt-4.1 `
  --openai-base-url https://api.openai.com/v1 `
  --auth-header PRIVATE-TOKEN
```

Running from source instead of the npm package: replace `pi-code-review` with `node dist/index.js` everywhere above.

The personal/project access token needs the `api` scope. `--auth-header PRIVATE-TOKEN` is what lets a personal/project access token work here — `CI_JOB_TOKEN`/`--job-token` is just where the token value goes regardless of which header sends it.

## Output

- One inline GitLab merge request comment per finding, with the finding's severity and summary
- `gl-code-quality-report.json` in the working directory (GitLab Code Quality report format)
- Process exit code: `0` if no finding meets `FAIL_ON_SEVERITY`, `1` otherwise

## Development

```bash
npm run dev    # run src/index.ts directly with tsx, no build step
npm test       # run the test suite (node:test)
npm run build  # type-check and compile to dist/
```

## Roadmap

- Split the CLI into `review` and `publish` subcommands, so a local run can stop after seeing the AI's findings without posting to GitLab — see `openspec/changes/split-review-publish-commands/`.
