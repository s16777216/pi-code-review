## Why

A real review of a large merge request failed at the first try. A model call ended with a timeout, and the output of another call was cut at the token limit. One failed call stops the whole review, and the failure reaches only the job log. People who read the merge request do not see that the review did not run, or that a step ran with less checking than normal.

## What Changes

- Add the setting `--timeout` / `OPENAI_TIMEOUT_MS` (milliseconds). The system passes it to the model client as the request timeout. Without it, the client default of 10 minutes stays.
- When a model run stops at the output token limit, the system starts the run again one time with twice the `--max-tokens` value. This retry does not count in the 3 tries of a run. All three kinds of run use the rule: review, deduplication, verification.
- When the deduplication step fails, the review goes on with the findings as they were before the step. The system records a warning. The step no longer fails the review.
- The system retries a GitLab read request (`GET`) up to 3 times in total, with 2 seconds and 4 seconds between tries. It retries a network error, a status 5xx, and a status 429. It never retries a write request.
- When a review fails after the merge request was read, `review` writes the findings file with a `failed` field and no findings. It still exits with code 2. Before it starts, `review` deletes the old findings file.
- The findings file has a new `warnings` field. The system records a warning when the deduplication step fails, when a verifier run fails, and when a file is not verified because it is too large.
- `publish` shows the failure and the warnings in the general comment that already lists the files too large to review. This comment becomes the review status comment. It keeps its marker and its text for the old cases.
- When the findings file has a `failed` field, `publish` posts no discussion, posts the status comment, and exits with code 1.
- **BREAKING**: the `review` command can now write a findings file and exit with code 2. Before this change, exit code 2 meant that no file was written. A script that treats the existence of the file as success must check the exit code.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-diff-review`: add the request timeout setting; retry once with a larger output limit; the deduplication step keeps the findings when it fails; collect warnings; add the failure category to a review failure.
- `review-cli`: the findings file holds `failed` and `warnings`; `review` deletes the old findings file, and writes the failure; `publish` reads the new fields.
- `review-output`: the comment for the files too large to review becomes the review status comment, and shows the failure and the warnings.
- `gitlab-mr-context`: retry a read request to GitLab.

## Impact

- Code: `src/core/review/engine.ts`, `src/core/review/findings.ts` (failure category), `src/core/types.ts`, `src/findingsFile.ts`, `src/config.ts`, `src/cli/index.ts`, `src/core/publish/publisher.ts`, `src/providers/gitlab/client.ts`.
- The findings file format gets two optional fields. An older file without them is still valid for `publish`.
- No new dependency. The README gets the new setting and the new behavior.
