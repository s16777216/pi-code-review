# Spec Delta

## MODIFIED Requirements

### Requirement: Build review input from the review context
The system SHALL build the agent's input from the `ReviewContext`'s title, description, and changed files. The input of every agent run in one review MUST contain the title and the description, and every hunk of every changed file that is not omitted MUST be in the input of exactly one run. The system SHALL print the new-file line number in front of every added line and every context line. The system MUST NOT depend on any GitLab-specific data beyond what `ReviewContext` exposes.

#### Scenario: Review input includes the context's intent
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** the input of every run contains that context's title and description

#### Scenario: Review input includes every changed file's diff
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** every line of the hunk text for every file in that context's changed files that is not omitted is in the input of exactly one run

#### Scenario: Added and context lines carry new-file line numbers
- **WHEN** the system builds the review input for a hunk that starts at new-file line 10 with one context line and one added line
- **THEN** the context line carries the number 10 and the added line carries the number 11

#### Scenario: Removed lines carry no new-file line number
- **WHEN** the system builds the review input for a hunk that contains a removed line
- **THEN** the removed line carries no new-file line number

## ADDED Requirements

### Requirement: List omitted files without their diff
The system SHALL show a changed file whose diff is omitted in the review input with its path and the reason, `too large` or `generated file`, and without its diff. The system MUST NOT put an omitted file into a batch. The file-content tool SHALL still return the content of an omitted file.

#### Scenario: A file is too large
- **WHEN** a changed file is omitted because it is too large
- **THEN** the review input shows its path and `diff not shown: too large`, and no diff block for it

#### Scenario: A generated file is not reviewed
- **WHEN** a changed file is omitted because it is generated, and its hunk text is not empty
- **THEN** the review input shows its path and `diff not shown: generated file`, and none of its hunk text

#### Scenario: Omitted file in a review in batches
- **WHEN** a review runs in batches and one changed file is omitted
- **THEN** the file is in the file list of every batch with its reason, and in no batch's diffs

### Requirement: Drop findings on omitted files
The system SHALL drop a finding on a changed file whose diff is omitted, and write one `warn` log line with the reason `diff_omitted`.

#### Scenario: Finding on a generated file
- **WHEN** the agent reports a finding on a line of a generated file's hunk text
- **THEN** the system drops the finding and logs the reason `diff_omitted`

### Requirement: Report the omitted files
The system SHALL return every omitted changed file as an unreviewed file, with its path and its reason, `too_large` or `generated`, in path order. The system SHALL write one `warn` log line for each file that is omitted because it is too large.

#### Scenario: One file is too large
- **WHEN** one changed file is omitted because it is too large
- **THEN** the review result lists that file with the reason `too_large`, and the system writes one `warn` log line that names it

#### Scenario: One file is generated
- **WHEN** one changed file is omitted because it is generated
- **THEN** the review result lists that file with the reason `generated`, and the system writes no `warn` log line for it
