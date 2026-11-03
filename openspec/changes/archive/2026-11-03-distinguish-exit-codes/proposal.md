# Proposal

## Why

`publish` exits with code 1 in two very different cases:

- The review gate failed: a finding meets `--fail-on`. The tool worked, and the change has a problem.
- The tool failed: a configuration error, an invalid findings file, an unknown command, or a GitLab error that stops the command.

A CI job cannot tell these apart. GitLab CI can let a job fail without blocking the pipeline for some exit codes only (`allow_failure: exit_codes: [...]`). With one code for both cases, a team that wants the review to be advisory has to allow every failure, including a broken setup that never posted anything.

## What Changes

- Every error that stops `review` or `publish` exits with code `2`, instead of `1`.
- `publish` keeps code `1` only for a failed severity threshold, and code `0` for a pass.
- `review` never exits with code `1`. It exits with `0` when the review completes, and with `2` when it fails.
- The README documents the three codes and gives a GitLab CI example with `allow_failure: exit_codes: [1]`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `review-cli`:
  - Modified: "Review's exit code reflects only process success" — a failed review exits with code 2.
  - Modified: "Publish's exit code reflects the severity-threshold decision" — 0 for a pass, 1 for a failed threshold, 2 for an error.

## Impact

- Affected code: `src/cli/index.ts` (the entrypoint's error handler).
- Affected tests: `src/cli/index.entrypoint.test.ts`, and a new test for the error code.
- Affected docs: `README.md`, the "Output" section, the `FAIL_ON_SEVERITY` row, and the CI example.
- A CI job that checks only for a non-zero code is not affected. A job that checks for code `1` after an error must check for `2`.
