## MODIFIED Requirements

### Requirement: Keep the findings of a file when its verification fails
The system SHALL keep the findings of a file as they were, with their severity from before the step, when the verifier run for that file fails on its last try. The system SHALL also keep them when the first request of the run would be larger than half of the context window of the model, and then the system MUST NOT call the model for that file. The system SHALL mark each of these findings with the verdict `unverified` and give it a confidence (see the capability `review-confidence`). In both cases the system SHALL write one `warn` log line with the file and the cause. The review MUST NOT fail because a verifier run fails. The verification of the other files continues.

#### Scenario: A verifier run fails
- **WHEN** the verifier run for `src/a.ts` ends with the stop reason `error` on each of its 3 tries
- **THEN** the findings of `src/a.ts` stay with their severity from before the step, each finding has the verdict `unverified`, the system writes a `warn` log line that names `src/a.ts`, and the review does not fail

#### Scenario: The other files are still verified
- **WHEN** the verifier run for `src/a.ts` fails and the verifier run for `src/b.ts` gives a valid result
- **THEN** the system applies the verdicts for `src/b.ts`

#### Scenario: The diff of the file is too large
- **WHEN** the first request of the verifier run for a file is larger than half of the context window
- **THEN** the system does not call the model for that file, keeps its findings, and writes a `warn` log line that names the file

### Requirement: Log the verification step
The system SHALL write one `info` log line for the verification step with the number of findings before it, the number after it, the number of rejected findings, and the number of findings with a changed severity. For each rejected finding, the system SHALL write one `info` log line with the file, the line, the summary, and the reason of the verdict. For each finding with the verdict `uncertain`, the system SHALL write one `info` log line with the file, the line, and the reason. With `--debug`, the system SHALL log the system prompt and the user prompt of each verifier run. With `--debug`, the system SHALL also write one `debug` log line for each finding that the step handled, with the file, the line, the verdict, the reviewed severity, and the reason. This applies to the verdicts `confirmed`, `rejected`, and `uncertain`. The system SHALL record the verdict of each kept finding in the findings file, as the capability `review-confidence` says.

#### Scenario: The summary line
- **WHEN** the verification step gets 6 findings, drops 2, and changes the severity of 1
- **THEN** the system writes one `info` log line with the numbers 6, 4, 2, and 1

#### Scenario: A rejected finding is logged
- **WHEN** the verdict of a finding in `src/a.ts` on line 12 is `rejected` with the reason "The type check already covers this."
- **THEN** the system writes an `info` log line with `src/a.ts`, 12, the summary, and that reason

#### Scenario: The findings file has the verdict
- **WHEN** the review writes the findings file for a confirmed finding
- **THEN** the finding has the verdict `confirmed`

#### Scenario: Every verdict is logged with debug
- **WHEN** the verification step handles 3 findings with the verdicts `confirmed`, `rejected`, and `uncertain`
- **THEN** the system writes 3 `debug` log lines, and each one has the file, the line, the verdict, the reviewed severity, and the reason

#### Scenario: A confirmed verdict is logged
- **WHEN** the verdict of a finding in `src/a.ts` on line 12 is `confirmed` with the reviewed severity `low` and the reason "Line 12 shows `x = null`."
- **THEN** the system writes a `debug` log line with `src/a.ts`, 12, `confirmed`, `low`, and that reason
