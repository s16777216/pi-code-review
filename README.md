# pi-code-review

AI code review for GitLab merge requests. Two commands: `review` reads a merge request, runs AI agents over its diff, and writes a findings file. `publish` posts the findings to GitLab as inline comments, and then decides pass or fail.

## Quick start

```bash
npm install -g @s16777216/pi-code-review

# 1. Review a merge request. This writes findings.json and changes nothing on GitLab.
GITLAB_TOKEN="<access token>" OPENAI_API_KEY="sk-..." \
picr review \
  --gitlab-url "https://gitlab.example.com/api/v4" \
  --project-id 123 --mr 7 \
  --model gpt-4.1 --openai-base-url https://api.openai.com/v1

# 2. Post the findings to the merge request that findings.json names.
picr publish --gitlab-url "https://gitlab.example.com/api/v4"
```

PowerShell:

```powershell
$env:GITLAB_TOKEN = "<access token>"
$env:OPENAI_API_KEY = "sk-..."

picr review `
  --gitlab-url "https://gitlab.example.com/api/v4" `
  --project-id 123 --mr 7 `
  --model gpt-4.1 --openai-base-url https://api.openai.com/v1

picr publish --gitlab-url "https://gitlab.example.com/api/v4"
```

Most people run only step 1 locally, to see what the AI finds. Step 2 posts comments, so run it when you want them on the merge request.

## Requirements and installation

- Node.js 20 or later.
- A GitLab merge request, and a personal or project access token with the `api` scope and at least Developer access. The tool always uses `PRIVATE-TOKEN`, never `CI_JOB_TOKEN`. See [Auth](#auth).
- An OpenAI-compatible API endpoint and key. Only `review` needs them.

The package is on npm as [`@s16777216/pi-code-review`](https://www.npmjs.com/package/@s16777216/pi-code-review). It installs a `picr` command, and `npx @s16777216/pi-code-review` also works. There is no Docker image and no GitLab CI/CD Component.

To run from source, use `npm install` and `npm run build`. Then run `node dist/cli/index.js` in place of `picr`.

## The two commands

| Command        | What it does                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `picr review`  | Fetches the merge request, runs the AI review, and writes `findings.json`. It never posts to GitLab and never decides pass or fail.                                                                                                                                                               |
| `picr publish` | Reads `findings.json` and posts every finding to the merge request that the file names (its `source`: host, project ID, and merge request IID). Then it decides pass or fail from the severity threshold. Publishing comes first, so a threshold can never keep a finding from the merge request. |

Each command accepts only the flags it needs. `review` has no `--fail-on`. `publish` has no `--model`, no OpenAI flags, no `--project-id`, and no `--mr`. A findings file without a `source` (from an older `review`) is rejected: run `review` again.

### Exit codes

| Code | `review`                                                                                                                                                        | `publish`                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `0`  | The review completed, whatever it found. Also: this is not a merge request pipeline.                                                                            | Every finding was published, and none meets `FAIL_ON_SEVERITY`.                                               |
| `1`  | Never.                                                                                                                                                          | Every finding was published, and at least one meets `FAIL_ON_SEVERITY`. Also: the findings file has `failed`. |
| `2`  | An error stopped the review (configuration, GitLab or OpenAI API, or a failed review). See [Failures and warnings](docs/how-it-works.md#failures-and-warnings). | An error stopped `publish` (configuration, an invalid findings file, the GitLab API).                         |

`1` means the review gate failed. `2` means the tool failed. A discussion that fails to post is logged and does not change the code. A failed review is never a pass.

## Configuration

Every setting comes from an environment variable or a CLI flag. **A flag wins over its variable.** Keep secrets (`OPENAI_API_KEY`, `GITLAB_TOKEN`) in environment variables. A flag can show up in a process list or a shell history.

Both commands:

| Variable        | Flag           | Required | Notes                                                                                    |
| --------------- | -------------- | -------- | ---------------------------------------------------------------------------------------- |
| `CI_API_V4_URL` | `--gitlab-url` | Yes      | For example `https://gitlab.com/api/v4`. GitLab CI sets it.                              |
| `GITLAB_TOKEN`  | `--token`      | Yes      | **Secret.** An access token with the `api` scope. See [Auth](#auth).                     |
| `DEBUG`         | `--debug`      | No       | `true` or `1` (variable), or bare `--debug` (flag). See [Debug logging](#debug-logging). |

`review` only:

| Variable                   | Flag                  | Required                                         | Notes                                                                                                                                                                                         |
| -------------------------- | --------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI_PROJECT_ID`            | `--project-id`        | Yes                                              | GitLab CI sets it. `review` writes it to the findings file.                                                                                                                                   |
| `CI_MERGE_REQUEST_IID`     | `--mr`                | Yes                                              | GitLab CI sets it on a merge request pipeline. Without it and without `--mr`, `review` skips and exits `0`.                                                                                   |
| `OPENAI_API_KEY`           | `--openai-api-key`    | Yes                                              | **Secret.**                                                                                                                                                                                   |
| `OPENAI_MODEL`             | `--model`             | Yes                                              | No default. Pick the model on purpose.                                                                                                                                                        |
| `OPENAI_BASE_URL`          | `--openai-base-url`   | Yes                                              | No default. Use `https://api.openai.com/v1` for OpenAI, or your own OpenAI-compatible endpoint.                                                                                               |
| `OPENAI_MAX_TOKENS`        | `--max-tokens`        | No (`32000`)                                     | The maximum output tokens of one model call. If a review fails now and then with an empty or unparsable answer, raise it.                                                                     |
| `OPENAI_CONTEXT_WINDOW`    | `--context-window`    | No (`128000`)                                    | The context window of the model, in tokens. It must be larger than `OPENAI_MAX_TOKENS`. Set it to the real window. See [Large merge requests](docs/how-it-works.md#large-merge-requests).     |
| `OPENAI_TIMEOUT_MS`        | `--timeout`           | No (the default of the model client, 10 minutes) | The timeout of one model call, in milliseconds. A call that exceeds it is tried again like any other error. It must be a positive integer.                                                    |
| `REVIEW_LANGUAGE`          | `--language`          | No                                               | The language of the finding summaries, for example `zh-TW` or `繁體中文`. At most 64 characters, one line. JSON field names, severity values, and the `**[severity]**` label stay in English. |
| `REVIEW_INSTRUCTIONS_FILE` | `--instructions`      | No                                               | The path of a file with review instructions. See [Review instructions](docs/customization.md#review-instructions).                                                                            |
| `REVIEW_INSTRUCTIONS`      | `--instructions-text` | No                                               | The review instructions as text.                                                                                                                                                              |
| (none)                     | `--out`               | No (`findings.json`)                             | Where `review` writes its findings file.                                                                                                                                                      |

`publish` only:

| Variable               | Flag             | Required             | Notes                                                                                                                                     |
| ---------------------- | ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `FAIL_ON_SEVERITY`     | `--fail-on`      | No (`high`)          | `critical`, `high`, `medium`, `low`, or `none`. `publish` exits with `1` when a finding meets or exceeds it. `none` never exits with `1`. |
| (none)                 | `--from`         | No (`findings.json`) | The findings file that `publish` reads.                                                                                                   |
| `PUBLISH_TEMPLATE_DIR` | `--template-dir` | No                   | A directory with comment templates. See [Comment templates](docs/customization.md#comment-templates). An empty value is an error.         |

## More documentation

- [How a review works](docs/how-it-works.md): the review agents, the deduplication and verification steps, large merge requests, existing discussions, failures and warnings, and the output.
- [Customization](docs/customization.md): review instructions and comment templates.

## Development

```bash
npm run dev    # run src/cli/index.ts with tsx, no build step
npm test       # the test suite (node:test)
npm run build  # type-check and compile to dist/
npm run lint   # ESLint
npm run format # Prettier; `npm run format:check` only checks
```

The core is platform-agnostic. The review engine and the publish rules work through three ports in `src/core/ports.ts` (`CodeHost`, `ChangeRequest`, `DiscussionGateway`). GitLab is the one host that this repository ships (`src/providers/gitlab/`). The first design is in `openspec/changes/archive/2026-10-29-gitlab-ai-code-review/design.md`.

## Versioning

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/). `npm run release` (it wraps [`commit-and-tag-version`](https://github.com/absolute-version/commit-and-tag-version)) reads them to raise the version in `package.json`, update `CHANGELOG.md`, and create a git tag. It never publishes. Run `git push --follow-tags` and `npm publish` yourself. See `CHANGELOG.md` for breaking changes.
