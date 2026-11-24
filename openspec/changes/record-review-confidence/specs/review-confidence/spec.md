## ADDED Requirements

### Requirement: Keep severity independent of confidence
The system SHALL assign each finding a severity from its impact alone. The system MUST NOT raise, lower, or replace a finding's severity because of its confidence, its corroboration, or the number of agents that reported it. The system MUST NOT change the pass or fail result of `publish` because of the confidence of a finding.

#### Scenario: A finding that only one agent reports keeps its severity
- **WHEN** only one review agent reports a finding and the verifier judges its severity `high`
- **THEN** the finding's severity is `high`, and its confidence does not change that severity

#### Scenario: A finding that all agents report keeps its severity
- **WHEN** all review agents report a finding and the verifier judges its severity `low`
- **THEN** the finding's severity is `low`

#### Scenario: Confidence does not change the result of publish
- **WHEN** the findings file has one finding with severity `high` and confidence `low`, and the severity threshold is `high`
- **THEN** `publish` reports a failing outcome, as it does without confidence

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

#### Scenario: The focus does not reach a prompt
- **WHEN** the system builds the prompt of the deduplication step, the verifier, or the verify agent
- **THEN** the prompt does not name the review focus that reported a finding

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
The system SHALL write, for each finding, its `confidence` and its `corroboration` to the findings file. The system MUST also write the verifier's verdict (`confirmed` or `uncertain`) for each finding that has one, and MUST leave the field out when verification failed or was skipped for the file of the finding. The findings file MUST NOT hold the review focus that reported a finding.

#### Scenario: Findings file holds the new fields
- **WHEN** `review` finishes and writes the findings file
- **THEN** each finding has `confidence` and `corroboration`

#### Scenario: No verdict exists
- **WHEN** verification fails for the file of a finding
- **THEN** the finding has `confidence` and `corroboration` and has no `verdict`

#### Scenario: Findings file from an older version
- **WHEN** `publish` reads a findings file whose findings have no `confidence`
- **THEN** `publish` does not report an error, and the result of `publish` is the same as before

### Requirement: Show the confidence in the comment
The system SHALL show a finding's confidence in the comment that `publish` posts. The built-in finding template SHALL show it, and a custom template SHALL be able to read it with a placeholder. When a finding has no confidence, the placeholder SHALL fill with `unknown`.

#### Scenario: Built-in template shows the confidence
- **WHEN** `publish` posts a finding with confidence `low` and uses the built-in template
- **THEN** the comment shows the confidence `low`

#### Scenario: Template reads the confidence
- **WHEN** a custom comment template uses the confidence placeholder
- **THEN** `publish` fills it with the finding's confidence

#### Scenario: Finding from an older findings file
- **WHEN** `publish` posts a finding that has no confidence, and the template uses the confidence placeholder
- **THEN** the placeholder is filled with `unknown`
