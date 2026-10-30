## Purpose

Splits the command-line tool into a `review` command and a `publish` command, connected by a findings file, so a local run can see the AI review's output without posting anything to GitLab.

## ADDED Requirements

### Requirement: Provide separate review and publish commands
The system SHALL expose two commands: `review` and `publish`. The system MUST NOT run both in a single invocation.

#### Scenario: Review command runs alone
- **WHEN** a person runs the `review` command
- **THEN** the system fetches the merge request, runs the AI review, and stops without contacting GitLab to publish anything

#### Scenario: Publish command runs alone
- **WHEN** a person runs the `publish` command
- **THEN** the system publishes findings to GitLab without running the AI review or contacting OpenAI

### Requirement: Review writes findings to a file
The `review` command SHALL write the findings and the diff refs needed to publish them to a JSON file. The default file path MUST be `findings.json` in the working directory.

#### Scenario: Review produces a findings file
- **WHEN** the `review` command finishes a review
- **THEN** the system writes a JSON file containing every valid finding and the diff refs for the reviewed merge request

#### Scenario: Review produces no findings
- **WHEN** the `review` command finds no valid findings
- **THEN** the system still writes a findings file, with an empty list of findings

### Requirement: Publish reads findings from a file
The `publish` command SHALL read findings and diff refs from a JSON file given by a command-line flag, defaulting to `findings.json`.

#### Scenario: Publish reads the default file
- **WHEN** the `publish` command runs without specifying a file
- **THEN** the system reads `findings.json` from the working directory

#### Scenario: Publish reads a named file
- **WHEN** the `publish` command runs with a file path given explicitly
- **THEN** the system reads that file instead of `findings.json`

#### Scenario: Findings file is missing or unreadable
- **WHEN** the `publish` command cannot read the findings file
- **THEN** the system stops before it calls the GitLab API, and reports a clear error

### Requirement: Review's exit code reflects only process success
The `review` command's exit code MUST NOT depend on the severity of any finding. It SHALL be non-zero only when the review process itself fails (for example, a GitLab or OpenAI API error).

#### Scenario: Review finds a severe bug
- **WHEN** the `review` command completes and writes a findings file containing a finding with severity `important`
- **THEN** the `review` command exits with code 0

#### Scenario: Review's own process fails
- **WHEN** the `review` command cannot complete the review (for example, the GitLab API is unreachable)
- **THEN** the `review` command exits with a non-zero code, and does not write a findings file

### Requirement: Publish's exit code reflects the severity-threshold decision
The `publish` command SHALL decide a pass or fail outcome from the findings it reads and a severity threshold, using the same decision described previously in the `ai-diff-review` capability (see that capability's removed requirement). The `publish` command's exit code SHALL reflect that outcome, after publishing completes.

#### Scenario: A published finding meets the threshold
- **WHEN** the `publish` command publishes at least one finding whose severity meets or exceeds the configured threshold
- **THEN** the `publish` command exits with a non-zero code, after publishing every finding

#### Scenario: No published finding meets the threshold
- **WHEN** every published finding's severity is below the configured threshold
- **THEN** the `publish` command exits with code 0

### Requirement: Each command accepts only the configuration it needs
The `review` command SHALL accept GitLab connection configuration and OpenAI configuration. The `publish` command SHALL accept GitLab connection configuration and the severity threshold. Neither command SHALL accept configuration that only the other command uses.

#### Scenario: Review does not accept the severity threshold
- **WHEN** a person passes a severity-threshold flag to the `review` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish does not accept OpenAI configuration
- **WHEN** a person passes an OpenAI model or API key flag to the `publish` command
- **THEN** the system rejects the command line with a clear error
