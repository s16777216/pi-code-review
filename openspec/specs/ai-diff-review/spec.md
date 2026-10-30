## Purpose

Defines the `ReviewEngine`: a platform-agnostic component that takes a `ReviewContext`, runs an AI agent over it, and produces a list of structured findings and a pass/fail decision.

## Requirements

### Requirement: Build review input from the review context
The system SHALL build the agent's input from the `ReviewContext`'s title, description, and the diff of every changed file. The system MUST NOT depend on any GitLab-specific data beyond what `ReviewContext` exposes.

#### Scenario: Review input includes the context's intent
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** the review input contains that context's title and description

#### Scenario: Review input includes every changed file's diff
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** the review input contains the hunk text for every file in that context's changed files

### Requirement: Provide a file-content tool to the agent
The system SHALL give the AI agent a tool that returns the full content of a named changed file, backed by `ReviewContext.getFileContent`, so the agent can read code outside the diff hunks.

#### Scenario: Agent reads a file outside the diff hunks
- **WHEN** the agent calls the file-content tool with a path from the review context's changed files
- **THEN** the tool returns the content that `ReviewContext.getFileContent` returns for that path

#### Scenario: Agent requests a file outside the review context
- **WHEN** the agent calls the file-content tool with a path that is not in the review context's changed files
- **THEN** the tool returns an error result instead of file content

### Requirement: Produce structured findings
The system SHALL parse the agent's output into a list of findings. Each finding MUST have a file path, a line number, a severity, and a one-sentence summary.

#### Scenario: Agent output parses into findings
- **WHEN** the agent finishes a review turn
- **THEN** the system parses its output into zero or more findings, each with a file, a line, a severity, and a summary

#### Scenario: Agent output does not parse
- **WHEN** the agent's output is not valid structured data
- **THEN** the system reports a review failure instead of returning findings

### Requirement: Classify each finding with a severity
The system SHALL assign each finding exactly one severity: `important`, `nit`, or `pre_existing`.

#### Scenario: Finding is a bug introduced by the diff
- **WHEN** the agent reports a bug that the reviewed change's own diff introduces
- **THEN** the finding's severity is `important`

#### Scenario: Finding is a bug that predates the diff
- **WHEN** the agent reports a bug in code the reviewed change did not change
- **THEN** the finding's severity is `pre_existing`

### Requirement: Validate findings against the diff
The system SHALL discard a finding whose file is not in the review context's changed files, or whose line is not a visible line in that file's diff.

#### Scenario: Finding references an unchanged file
- **WHEN** a finding's file path is not one of the review context's changed files
- **THEN** the system discards the finding and does not return it

#### Scenario: Finding references a line not in the diff
- **WHEN** a finding's line number does not appear as an added or context line in that file's diff
- **THEN** the system discards the finding and does not return it

### Requirement: Require an explicit OpenAI model
The system SHALL read the OpenAI model name from the `OPENAI_MODEL` environment variable and MUST NOT substitute a default value.

#### Scenario: Model variable is set
- **WHEN** `OPENAI_MODEL` is set to a valid model name
- **THEN** the system uses that model for the review

#### Scenario: Model variable is missing
- **WHEN** `OPENAI_MODEL` is not set
- **THEN** the system stops before it calls the OpenAI API, and reports a clear configuration error

