# Spec Delta

## MODIFIED Requirements

### Requirement: Build review input from the review context
The system SHALL build the agent's input from the `ReviewContext`'s title, description, and the diff of every changed file. The system SHALL print the new-file line number in front of every added line and every context line. The system MUST NOT depend on any GitLab-specific data beyond what `ReviewContext` exposes.

#### Scenario: Review input includes the context's intent
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** the review input contains that context's title and description

#### Scenario: Review input includes every changed file's diff
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** the review input contains every line of the hunk text for every file in that context's changed files

#### Scenario: Added and context lines carry new-file line numbers
- **WHEN** the system builds the review input for a hunk that starts at new-file line 10 with one context line and one added line
- **THEN** the context line carries the number 10 and the added line carries the number 11

#### Scenario: Removed lines carry no new-file line number
- **WHEN** the system builds the review input for a hunk that contains a removed line
- **THEN** the removed line carries no new-file line number

### Requirement: Produce structured findings
The system SHALL parse the agent's output into a list of findings. Each finding MUST have a file path, a line number, a severity, and a one-sentence summary. The system MUST keep each valid finding when another finding in the same output is invalid.

#### Scenario: Agent output parses into findings
- **WHEN** the agent finishes a review turn
- **THEN** the system parses its output into zero or more findings, each with a file, a line, a severity, and a summary

#### Scenario: Agent output does not parse
- **WHEN** the agent's output is not valid structured data
- **THEN** the system reports a review failure instead of returning findings

#### Scenario: Agent output is not a list
- **WHEN** the agent's output is valid JSON but is not an array
- **THEN** the system reports a review failure instead of returning findings

#### Scenario: One finding is invalid
- **WHEN** the agent's output is an array with two valid findings and one finding that has an invalid severity
- **THEN** the system returns the two valid findings and drops the invalid finding

#### Scenario: A dropped finding is logged
- **WHEN** the system drops an invalid finding
- **THEN** the system writes one `warn` log line that names the finding's position in the array and the reason

### Requirement: Validate findings against the diff
The system SHALL discard a finding whose file is not in the review context's changed files, or whose line is not a visible line in that file's diff. The system SHALL write one `warn` log line for each discarded finding.

#### Scenario: Finding references an unchanged file
- **WHEN** a finding's file path is not one of the review context's changed files
- **THEN** the system discards the finding and does not return it

#### Scenario: Finding references a line not in the diff
- **WHEN** a finding's line number does not appear as an added or context line in that file's diff
- **THEN** the system discards the finding and does not return it

#### Scenario: A discarded finding is logged
- **WHEN** the system discards a finding for any reason
- **THEN** the system writes one `warn` log line that contains the finding's file, its line number, and the reason
