## 1. Types, settings, and the findings file

- [x] 1.1 Add `ReviewWarning`, `FailureCategory`, and `warnings` in `ReviewResult` to `src/core/types.ts`; add the optional `category` to `ReviewFailureError`; verify `npm run build` passes
- [x] 1.2 Add the setting `--timeout` / `OPENAI_TIMEOUT_MS` to `src/config.ts` and `src/cli/index.ts`; verify config tests cover the flag, the variable, the flag over the variable, no value, and the values `0`, `-5`, and `abc`
- [x] 1.3 Add `warnings` and `failed` to `FindingsFile`, to `writeFindingsFile`, and to `readFindingsFile` with the checks of the spec; verify `findingsFile.test.ts` covers a file without the fields, a valid failure, an unknown category, an unknown code, and a warning without a file

## 2. Engine

- [x] 2.1 Pass `timeoutMs` to the stream options of the engine and leave `maxRetries` unset; verify an engine test with a capturing stream function sees the value, and sees no value when the setting is absent
- [x] 2.2 Return a `cut` outcome from `runOnce` for the stop reason `length`; start the run again one time with twice `maxTokens`, outside the 3 tries; verify faux provider tests cover a valid answer on the retry, a second cut that fails with the category `output_cut`, an error after a cut that still has its 3 tries, and the other runs keeping the setting
- [x] 2.3 Apply the rule of task 2.2 to the review runs, the deduplication step, and the verifier runs; verify one test for each kind of run
- [x] 2.4 Set the category on each failure (`model_failed`, `output_cut`, `too_large`); verify tests cover a run that fails 3 times, a run with no accepted submission, an `aborted` run, 21 batches, and a validation error that gives `other`
- [x] 2.5 Let the deduplication step keep the findings and record `deduplication_failed` when its call fails or gives no valid result; verify the existing deduplication tests for failure are changed to expect no review failure, and that other errors still fail the review
- [x] 2.6 Collect the warnings `verification_failed` and `verification_skipped` with the file path next to their `warn` log lines, and return them in the result; verify tests show the list for a failed run, a file too large, and an empty list when no step is degraded
- [x] 2.7 Update the characterization and golden tests for the `warnings` field and regenerate `src/core/review/__golden__/review-output.txt` with `UPDATE_GOLDEN=1`; verify the file keeps LF line breaks and `npm test` passes

## 3. The `review` command

- [x] 3.1 Delete the file at the output path after the check for a merge request pipeline and before the host calls; verify tests cover an old file with a failure before the merge request is read, no old file, and a pipeline that is not a merge request pipeline
- [x] 3.2 Catch the error of `engine.review()` in `runReview`, log it at `error` level, and return a file with `failed` and empty lists; verify tests cover a `ReviewFailureError` with a category, an unknown error that gives `other`, and that an error of `load()` is not caught
- [x] 3.3 Write the file and return `EXIT_ERROR` for a failed result in `runReviewCommand`; verify a CLI test shows exit code 2 with a file that holds `failed` and no error text, and exit code 0 with `warnings` for a degraded review

## 4. The `publish` command

- [x] 4.1 Add the status texts for the categories and the codes in one module; verify unit tests compare each text with the spec
- [x] 4.2 Change the unreviewed note to the review status comment with the same marker, the three parts, and the rule to post; verify publisher tests cover every scenario of the spec, including the unchanged body for the old cases and an update of a comment from an older run
- [x] 4.3 Return a fail result from `runPublish` when the file has `failed`, and pass the status to the publisher; verify tests show no discussion, one status comment, exit code 1, and no change for a file without `failed`
- [x] 4.4 Verify the comment holds no error text and no raw message with a test that fails the review with an error that names an internal host

## 5. GitLab retry

- [x] 5.1 Add the retry loop for `GET` in `GitLabClient.request` with an injectable `sleep`; verify client tests cover a network error then success, a status 502 then success, a status 429, a status 404 and 401 with no retry, three failures, and the waits of 2 and 4 seconds
- [x] 5.2 Verify a `POST` and a `PUT` are not retried, and that the retry log line holds the method, the path, and the try number but no token and no query string

## 6. Documentation and final checks

- [x] 6.1 Update `README.md` for `--timeout`, the retry with a larger limit, the findings file fields, the review status comment, the exit codes, and the breaking change; verify the text uses the terms of the glossary and agrees with the specs
- [x] 6.2 Find out which layer throws `fetch timed out waiting for response headers` with a local server that delays its response headers; verify the result is written in the design under Open Questions or in a follow-up note
- [x] 6.3 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; verify all pass for the changed files
