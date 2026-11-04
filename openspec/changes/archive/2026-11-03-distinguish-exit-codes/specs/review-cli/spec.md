# Spec Delta

## MODIFIED Requirements

### Requirement: Review's exit code reflects only process success
The `review` command's exit code MUST NOT depend on the severity of any finding. It SHALL be 0 when the review completes, and 2 when the review process itself fails (for example, a GitLab or OpenAI API error). The `review` command MUST NOT exit with code 1.

#### Scenario: Review finds a severe bug
- **WHEN** the `review` command completes and writes a findings file containing a finding with severity `important`
- **THEN** the `review` command exits with code 0

#### Scenario: Review's own process fails
- **WHEN** the `review` command cannot complete the review (for example, the GitLab API is unreachable)
- **THEN** the `review` command exits with code 2, and does not write a findings file

### Requirement: Publish's exit code reflects the severity-threshold decision
The `publish` command SHALL decide a pass or fail outcome from the findings it reads and a severity threshold, using the same decision described previously in the `ai-diff-review` capability (see that capability's removed requirement). After publishing completes, the `publish` command SHALL exit with code 0 for a pass and code 1 for a fail. It SHALL exit with code 2 when an error stops it, and MUST NOT use code 1 for an error.

#### Scenario: A published finding meets the threshold
- **WHEN** the `publish` command publishes at least one finding whose severity meets or exceeds the configured threshold
- **THEN** the `publish` command exits with code 1, after publishing every finding

#### Scenario: No published finding meets the threshold
- **WHEN** every published finding's severity is below the configured threshold
- **THEN** the `publish` command exits with code 0

#### Scenario: The findings file is invalid
- **WHEN** the `publish` command stops because the findings file is invalid
- **THEN** the `publish` command exits with code 2

#### Scenario: The configuration is invalid
- **WHEN** the `publish` command stops because a required setting is missing
- **THEN** the `publish` command exits with code 2

#### Scenario: A discussion fails to post
- **WHEN** the GitLab API rejects one finding's discussion, and no finding meets the threshold
- **THEN** the `publish` command logs the failure and exits with code 0
