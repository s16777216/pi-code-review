## ADDED Requirements

### Requirement: Keep severity independent of confidence
The system SHALL assign each finding a severity from its impact alone. The system MUST NOT raise, lower, or replace a finding's severity because of its confidence, its corroboration, or the number of agents that reported it.

#### Scenario: A finding that only one agent reports keeps its severity
- **WHEN** only one review agent reports a finding and the verifier judges its severity `high`
- **THEN** the finding's severity is `high`, and its confidence does not change that severity

#### Scenario: A finding that all agents report keeps its severity
- **WHEN** all review agents report a finding and the verifier judges its severity `low`
- **THEN** the finding's severity is `low`

### Requirement: Record corroboration
The system SHALL record, for each finding that remains after deduplication, its **corroboration**: the number of distinct review focuses that reported a finding in the same deduplication group, including the kept finding. A finding that no other focus reported has corroboration `1`.

#### Scenario: Two focuses report the same problem
- **WHEN** the logic focus and the security focus report findings that deduplication puts in one group
- **THEN** the kept finding has corroboration `2`

#### Scenario: Two findings of one focus are in one group
- **WHEN** one focus reports two findings that deduplication puts in one group, and no other focus reports it
- **THEN** the kept finding has corroboration `1`

#### Scenario: Deduplication fails
- **WHEN** the deduplication step fails and `review` keeps all findings
- **THEN** each finding has corroboration `1`, and the findings file records the existing `deduplication_failed` warning

### Requirement: Derive confidence from corroboration and the verifier's verdict
The system SHALL assign each finding exactly one confidence: `high`, `medium`, or `low`, by this table. The verdict is the verifier's verdict for that finding.

| Corroboration | Verdict `confirmed` | Verdict `uncertain` |
| ------------- | ------------------- | ------------------- |
| 2 or more     | `high`              | `medium`            |
| 1             | `medium`            | `low`               |

When no verdict exists for a finding because verification failed or was skipped for its file, the system SHALL treat the verdict as `uncertain`. A finding the verifier rejects is dropped and has no confidence.

#### Scenario: Corroborated and confirmed
- **WHEN** a finding has corroboration `2` and the verifier confirms it
- **THEN** its confidence is `high`

#### Scenario: Single report, confirmed
- **WHEN** a finding has corroboration `1` and the verifier confirms it
- **THEN** its confidence is `medium`

#### Scenario: Single report, uncertain
- **WHEN** a finding has corroboration `1` and the verifier answers `uncertain`
- **THEN** its confidence is `low`

#### Scenario: Verification did not run for the file
- **WHEN** verification fails or is skipped for a finding's file, and the finding has corroboration `2`
- **THEN** the system treats the verdict as `uncertain`, and the finding's confidence is `medium`

### Requirement: Write confidence data to the findings file
The system SHALL write, for each finding, its `confidence` and its `corroboration` to the findings file. The system MUST also write the verifier's verdict (`confirmed` or `uncertain`) for each finding that has one, and MUST leave the field out when verification failed or was skipped for the file of the finding.

#### Scenario: Findings file holds the new fields
- **WHEN** `review` finishes and writes the findings file
- **THEN** each finding has `confidence` and `corroboration`

#### Scenario: No verdict exists
- **WHEN** verification fails for the file of a finding
- **THEN** the finding has `confidence` and `corroboration` and has no `verdict`

#### Scenario: Findings file from an older version
- **WHEN** `publish` reads a findings file whose findings have no `confidence`
- **THEN** `publish` treats each such finding as confidence `high` and does not report an error

### Requirement: Gate on severity and confidence together
The system SHALL read a confidence threshold from the `FAIL_ON_CONFIDENCE` environment variable (flag `--fail-on-confidence`), with the values `low`, `medium`, and `high`, defaulting to `low`. `publish` MUST report a failing outcome when at least one finding has a severity that meets or exceeds `FAIL_ON_SEVERITY` **and** a confidence that meets or exceeds `FAIL_ON_CONFIDENCE`. A finding that meets only one of the two thresholds MUST NOT cause a failing outcome.

With the default `low`, every confidence meets the threshold, so the outcome is the same as a gate on severity alone.

#### Scenario: Default threshold keeps the existing behavior
- **WHEN** `FAIL_ON_CONFIDENCE` is not set and a finding meets `FAIL_ON_SEVERITY`
- **THEN** `publish` reports a failing outcome whatever the finding's confidence

#### Scenario: High severity with low confidence does not fail
- **WHEN** `FAIL_ON_SEVERITY` is `high`, `FAIL_ON_CONFIDENCE` is `medium`, and the only finding has severity `critical` and confidence `low`
- **THEN** `publish` reports a passing outcome

#### Scenario: High severity with enough confidence fails
- **WHEN** `FAIL_ON_SEVERITY` is `high`, `FAIL_ON_CONFIDENCE` is `medium`, and a finding has severity `high` and confidence `medium`
- **THEN** `publish` reports a failing outcome

#### Scenario: Low severity with high confidence does not fail
- **WHEN** `FAIL_ON_SEVERITY` is `high`, `FAIL_ON_CONFIDENCE` is `medium`, and the only finding has severity `low` and confidence `high`
- **THEN** `publish` reports a passing outcome

#### Scenario: Severity threshold is none
- **WHEN** `FAIL_ON_SEVERITY` is `none`
- **THEN** `publish` reports a passing outcome whatever the confidence of the findings

#### Scenario: Invalid confidence threshold
- **WHEN** `FAIL_ON_CONFIDENCE` is set to a value other than `low`, `medium`, or `high`
- **THEN** `publish` stops with a configuration error and exit code `2` before it posts anything

### Requirement: Post every finding whatever its confidence
The system SHALL post a finding whatever its confidence, by the same rules as before: the merge of findings on one line, and the reply to a discussion that a finding relates to, do not change. The gate decides pass or fail only. It MUST NOT keep a finding from the merge request. This keeps the existing rule that publishing comes before the pass/fail decision.

#### Scenario: A finding below the confidence threshold is still posted
- **WHEN** a finding has confidence `low`, and `FAIL_ON_CONFIDENCE` is `high`
- **THEN** `publish` posts the finding as it posts any other finding, and the finding does not cause a failing outcome

### Requirement: Show confidence in the comment
The system SHALL show a finding's confidence in the comment that `publish` posts. The built-in finding template SHALL show it, and a custom template SHALL be able to read it with a placeholder.

#### Scenario: Built-in template shows the confidence
- **WHEN** `publish` posts a finding with confidence `low` and uses the built-in template
- **THEN** the comment shows the confidence `low`

#### Scenario: Template reads the confidence
- **WHEN** a custom comment template uses the confidence placeholder
- **THEN** `publish` fills it with the finding's confidence

### Requirement: Report the gate decision in the review status
The system SHALL count the findings that meet `FAIL_ON_SEVERITY` but not `FAIL_ON_CONFIDENCE`. `publish` SHALL write the count to its `info` log line for the result, and to the review status comment when the count is more than 0, so that a person can see what the confidence threshold let pass.

#### Scenario: Findings below the confidence threshold are counted
- **WHEN** two findings meet `FAIL_ON_SEVERITY` but not `FAIL_ON_CONFIDENCE`
- **THEN** the log line for the result and the review status comment state the count `2`

#### Scenario: No finding was let pass
- **WHEN** every finding that meets `FAIL_ON_SEVERITY` also meets `FAIL_ON_CONFIDENCE`
- **THEN** the review status comment has no line for the count
