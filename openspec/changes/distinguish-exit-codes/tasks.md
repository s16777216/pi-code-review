# Tasks

## 1. Exit codes

- [ ] 1.1 In `src/cli/index.ts`, add `EXIT_PASS = 0`, `EXIT_FAIL = 1`, and `EXIT_ERROR = 2`. Use them in `runPublishCommand` and `runReviewCommand`, and set `process.exitCode = EXIT_ERROR` in the entrypoint's error handler (Decision 1).
- [ ] 1.2 In `src/cli/index.entrypoint.test.ts`, expect code 2 for an invalid findings file. Add subprocess tests for: a missing required setting in `publish` (code 2), an unknown command (code 2), and a `review` that fails because GitLab is unreachable (code 2, no findings file). Verify with `npm test`.

## 2. Docs

- [ ] 2.1 Update `README.md`: the three codes of `publish`, the codes of `review`, the `FAIL_ON_SEVERITY` row, and a GitLab CI example with `allow_failure: exit_codes: [1]`. Verify that the README no longer says that `publish` exits with `1` for any non-pass.

## 3. Integration check

- [ ] 3.1 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [ ] 3.2 Run `openspec validate distinguish-exit-codes --strict`, and validate the main specs after a dry-run archive of the stack on a copy. Verify that both report no errors or warnings.
- [ ] 3.3 Run `node dist/cli/index.js publish` against a test merge request three times: with a findings file that passes, with one that fails the threshold, and with an invalid one. Verify the codes 0, 1, and 2.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
