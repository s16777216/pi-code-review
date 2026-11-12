## ADDED Requirements

### Requirement: Accept a configurable request timeout
The system SHALL accept the request timeout of a model call from the `--timeout` flag or the `OPENAI_TIMEOUT_MS` environment variable, as a positive integer in milliseconds. The flag wins when both are set. The system SHALL pass the value to the model client as the request timeout. When neither is set, the system MUST NOT pass a timeout, and the default of the model client applies. The system MUST stop with a configuration error when the value is not a positive integer.

#### Scenario: Flag sets the timeout
- **WHEN** a person passes `--timeout 120000` to the `review` command
- **THEN** the system passes a request timeout of 120000 milliseconds to the model client

#### Scenario: Variable sets the timeout
- **WHEN** `OPENAI_TIMEOUT_MS` is `90000`, and the `review` command has no `--timeout` flag
- **THEN** the system passes a request timeout of 90000 milliseconds to the model client

#### Scenario: Flag wins over the variable
- **WHEN** `OPENAI_TIMEOUT_MS` is `90000` and the flag is `--timeout 120000`
- **THEN** the system passes a request timeout of 120000 milliseconds

#### Scenario: No timeout is set
- **WHEN** neither the flag nor the variable is set
- **THEN** the system passes no request timeout to the model client

#### Scenario: Value is not valid
- **WHEN** the value is `0`, `-5`, or `abc`
- **THEN** the system stops with a configuration error and exits with code 2

### Requirement: Record a warning when a step runs with less checking
The system SHALL return a list of warnings with the review result. The system SHALL add one warning with the code `deduplication_failed` when the deduplication step fails. The system SHALL add one warning with the code `verification_failed` and the file path when a verifier run fails on its last try. The system SHALL add one warning with the code `verification_skipped` and the file path when the system does not call the model for a file because the first request is too large. Each warning MUST also have its `warn` log line. The list MUST be empty when no step ran with less checking.

#### Scenario: Deduplication fails
- **WHEN** the call for the deduplication step fails on its third try
- **THEN** the result holds one warning with the code `deduplication_failed`

#### Scenario: A verifier run fails
- **WHEN** the verifier run for `src/a.ts` fails on its third try
- **THEN** the result holds one warning with the code `verification_failed` and the path `src/a.ts`

#### Scenario: A file is too large to verify
- **WHEN** the first request of the verifier run for `src/b.ts` is larger than half of the context window
- **THEN** the result holds one warning with the code `verification_skipped` and the path `src/b.ts`

#### Scenario: No step is degraded
- **WHEN** every step of the review gives a valid result
- **THEN** the list of warnings is empty

### Requirement: Give each review failure a category
The system SHALL give each review failure one category: `model_failed` when a run fails after its last try with an error, a timeout, or no accepted submission, or stops with `aborted`; `output_cut` when a run stops at the token limit after the retry with a larger limit; `too_large` when the change does not fit the context window or needs more than 20 batches; `other` for any other error. The category MUST NOT hold the text of the error.

#### Scenario: A run fails after three tries
- **WHEN** a run ends with the stop reason `error` on its third try
- **THEN** the category of the review failure is `model_failed`

#### Scenario: A run stays cut after the retry
- **WHEN** a run stops with `length` on the try with the larger limit
- **THEN** the category of the review failure is `output_cut`

#### Scenario: The change does not fit
- **WHEN** the review needs 21 batches
- **THEN** the category of the review failure is `too_large`

#### Scenario: An unknown error
- **WHEN** the review stops with an error that is not one of the cases above
- **THEN** the category of the review failure is `other`

## MODIFIED Requirements

### Requirement: Report a review cut at the token limit
The system SHALL start a run again one time, with a new agent and new tools, when its final message stops at the output token limit. The new try MUST use an output limit of twice the `--max-tokens` value. This retry MUST NOT count in the 3 tries of the requirement "Retry a model run that ends with an error". The same rule applies to the call of the deduplication step and to each verifier run. The system SHALL report a review failure when the final message of the retry also stops at the output token limit. The error MUST name the `--max-tokens` and `--context-window` settings. The system MUST NOT start a second retry for the token limit.

#### Scenario: Final message stops at the token limit
- **WHEN** the agent's final message has the stop reason `length` on the first try and on the retry with the larger limit
- **THEN** the system reports a review failure that names `--max-tokens` and `--context-window`, and does not try to parse the cut output

#### Scenario: The larger limit gives a valid answer
- **WHEN** the first try stops with `length`, and the retry with twice the limit produces an accepted submission
- **THEN** the system uses the output of the retry and writes one `warn` log line that names the review focus and the two limits

#### Scenario: The retry does not use a try
- **WHEN** the first try stops with `length`, and the retry stops with the reason `error`
- **THEN** the system still has its second and third try for the error

#### Scenario: Other runs are not changed
- **WHEN** one run stops with `length` and the retry starts
- **THEN** the other runs of the review keep the `--max-tokens` value of the setting

### Requirement: Retry a model run that ends with an error
The system SHALL start a run again, with a new agent and new tools, when its final message has the stop reason `error`, or when the run ends with no accepted `submit_review` call. A request that exceeds the request timeout ends with the stop reason `error`. The same rule applies to the call of the deduplication step and to each verifier run of the verification step. The system SHALL try a run at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. Each retry MUST write one `warn` log line with the batch number when the run has one, the review focus, the try number, and the error message. The system MUST NOT retry a run that stops with `aborted`. A run that stops with `length` follows the requirement "Report a review cut at the token limit".

#### Scenario: Run passes on the second try
- **WHEN** a run's first try ends with the stop reason `error` and its second try produces an accepted `submit_review` call
- **THEN** the system uses the output of the second try and logs one retry

#### Scenario: Run stops at the token limit
- **WHEN** a run's final message has the stop reason `length`
- **THEN** the system does not count it as a failed try, and follows the requirement "Report a review cut at the token limit"

#### Scenario: Run ends with no accepted submission
- **WHEN** a run's final message has a normal stop reason, and the agent never made an accepted `submit_review` call
- **THEN** the system treats the run as a failed try, the same as a run that stops with the reason `error`

#### Scenario: The retry log names the review focus
- **WHEN** the run of the agent for security ends with the stop reason `error`
- **THEN** the `warn` log line for the retry names the review focus security

#### Scenario: A verifier run is tried again
- **WHEN** the first try of a verifier run ends with the stop reason `error` and its second try produces an accepted `submit_verdicts` call
- **THEN** the system uses the verdicts of the second try and logs one retry that names the file

#### Scenario: A request times out
- **WHEN** a request exceeds the request timeout
- **THEN** the system treats the try as a failed try with the stop reason `error`, and starts the next try after the wait

### Requirement: Deduplicate findings with the deduplication step
The system SHALL run the deduplication step on the merged findings that pass the checks on `relatesTo` and the diff line check, and before the check on the fixed declarations. The system SHALL call the model once for the step, and only when at least one file has two or more findings. The system MUST NOT call the model for the step in any other case. The system MUST send only the findings of files that have two or more findings. The model MUST see only the file, the line, the severity, and the summary of each finding that it gets. The model MUST return only groups of finding numbers, with no other text. A group is valid when all its findings are in the same file. The result is valid when each sent finding number is in exactly one group. The system SHALL reject a result that is not valid and SHALL tell the model the reason. The system SHALL keep the merged findings as they were before the step, and SHALL record a warning, when the call fails, or gives no valid result, on its last try. The review MUST NOT fail because the deduplication step fails. The system MUST NOT change the findings when the step is not called.

#### Scenario: No file has two findings
- **WHEN** the merged findings are in 3 different files, one finding in each file
- **THEN** the system does not call the model for the deduplication step

#### Scenario: A file has two findings
- **WHEN** the merged findings hold two findings in `src/a.ts`
- **THEN** the system calls the model once for the deduplication step

#### Scenario: The model sees only four fields
- **WHEN** the system builds the input of the deduplication step
- **THEN** the input holds, for each finding, its number, file, line, severity, and summary, and holds no `relatesTo`, no anchor, and no diff text

#### Scenario: Findings of single files are not sent
- **WHEN** the merged findings hold two findings in `src/a.ts` and one finding in `src/b.ts`
- **THEN** the input of the deduplication step holds the two findings of `src/a.ts` and not the finding of `src/b.ts`

#### Scenario: A group has findings of two files
- **WHEN** the model returns a group that holds a finding in `src/a.ts` and a finding in `src/b.ts` on each of its tries
- **THEN** the system keeps the merged findings as they were, records a warning, and does not fail the review

#### Scenario: A finding number is missing or repeated
- **WHEN** the model returns groups in which one finding number is missing, or one number is in two groups, on each of its tries
- **THEN** the system keeps the merged findings as they were, records a warning, and does not fail the review

#### Scenario: The model corrects a result
- **WHEN** the model returns a result that is not valid, and then a valid result in the same run
- **THEN** the system uses the valid result

#### Scenario: The call fails
- **WHEN** the call for the deduplication step fails on its third try
- **THEN** the system keeps the merged findings as they were, writes one `warn` log line that names the deduplication step, records the warning `deduplication_failed`, and the review goes on
