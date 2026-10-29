## Why

Agents now produce most code changes. Manual, line-by-line review does not scale to this volume. The team wants an automated AI review step that runs on every merge request, before a human looks, to catch routine issues early and save human review time.

## What Changes

- Add a new CI tool that reviews a GitLab merge request's diff with an AI agent.
- The tool's core is a platform-agnostic `ReviewEngine`. The engine takes a `ReviewContext` (title, description, changed-file diffs, and an on-demand file-content reader) and returns a list of findings. The engine has no GitLab-specific code.
- GitLab support is one adapter around the engine: a source adapter that builds a `ReviewContext` from a merge request, and a sink adapter that publishes the engine's findings back to GitLab. A future adapter (for example, GitHub, or a local `git diff`) would plug into the same `ReviewContext`/`Finding[]` boundary without changing the engine.
- The GitLab source adapter fetches the MR metadata, the diff, and the full content of each changed file from the GitLab API.
- The engine runs an AI agent (`pi-agent-core` with `pi-ai`, OpenAI provider) over the `ReviewContext`. The agent produces a list of findings. Each finding has a file, a line, a severity (`important`, `nit`, or `pre_existing`), and a summary.
- The engine decides the CI job's exit code from a configurable severity threshold (`FAIL_ON_SEVERITY`, default `important`). This decision does not depend on GitLab.
- The GitLab sink adapter publishes findings as inline comments on the merge request's discussion, and writes a GitLab Code Quality report artifact from the findings.
- The tool ships as a Node.js CLI, runnable directly with `node` (locally or from a hand-written CI job `script:` step). Docker image and GitLab CI/CD Component packaging are deferred to a follow-up change — see Impact and `design.md`'s Packaging decision.

## Capabilities

### New Capabilities
- `ai-diff-review`: The platform-agnostic `ReviewEngine`. Takes a `ReviewContext`, runs an AI agent over it, produces structured findings, and decides the severity-gated exit code.
- `gitlab-mr-context`: The GitLab source adapter. Builds a `ReviewContext` by fetching merge request metadata, diff, and changed-file content from the GitLab API, authenticated with `CI_JOB_TOKEN`.
- `review-output`: The GitLab sink adapter. Publishes the engine's findings as inline merge request comments and a GitLab Code Quality report.

### Modified Capabilities
(none — this is a new tool with no existing specs)

## Impact

- New Node.js/TypeScript project in this repository (`src/`, `README.md`), structured around a `ReviewContext`/`Finding[]` boundary between the engine and the GitLab adapter.
- New runtime dependencies: `pi-agent-core`, `pi-ai`, and an OpenAI API account.
- New CI/CD requirements for any project that adopts the tool: GitLab CI/CD variables `OPENAI_API_KEY` (masked secret), `OPENAI_MODEL`, and `OPENAI_BASE_URL` (no default — every adopter must set it, for example `https://api.openai.com/v1`), and `CI_JOB_TOKEN` access to the GitLab Merge Requests API enabled in project settings. Adopting it today means hand-writing the CI job's `script:` step; see `README.md`.
- Docker image and `templates/code-review.yml` (a GitLab CI/CD Component) are out of scope for this change — deferred to a follow-up change.
