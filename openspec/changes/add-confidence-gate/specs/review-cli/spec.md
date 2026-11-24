## MODIFIED Requirements

### Requirement: Publish's exit code reflects the severity-threshold decision
The `publish` command SHALL decide a pass or fail outcome from the findings it reads, a severity threshold, and a confidence threshold, as the capability `review-gate` says. The outcome MUST be a fail when the findings file has a `failed` object. After publishing completes, the `publish` command SHALL exit with code 0 for a pass and code 1 for a fail. It SHALL exit with code 2 when an error stops it, and MUST NOT use code 1 for an error.

#### Scenario: A published finding meets the threshold
- **WHEN** the `publish` command publishes at least one finding whose severity meets or exceeds the configured severity threshold and whose confidence meets or exceeds the configured confidence threshold
- **THEN** the `publish` command exits with code 1, after publishing every finding

#### Scenario: No published finding meets the threshold
- **WHEN** every published finding is below the configured severity threshold or below the configured confidence threshold
- **THEN** the `publish` command exits with code 0

#### Scenario: A finding meets only the severity threshold
- **WHEN** the only finding meets the configured severity threshold and is below the configured confidence threshold
- **THEN** the `publish` command publishes it and exits with code 0

#### Scenario: The findings file is invalid
- **WHEN** the `publish` command stops because the findings file is invalid
- **THEN** the `publish` command exits with code 2

#### Scenario: The configuration is invalid
- **WHEN** the `publish` command stops because a required setting is missing
- **THEN** the `publish` command exits with code 2

#### Scenario: A discussion fails to post
- **WHEN** the GitLab API rejects one finding's discussion, and no finding meets the threshold
- **THEN** the `publish` command logs the failure and exits with code 0

#### Scenario: The review failed
- **WHEN** the findings file has a `failed` object
- **THEN** the `publish` command posts no discussion, posts the review status comment, and exits with code 1

### Requirement: Each command accepts only the configuration it needs
The `review` command SHALL accept GitLab connection configuration, the project ID, the merge request IID, OpenAI configuration, the review language, and the instructions sources for the review instructions. The instructions sources are the `--instructions` flag, the `--instructions-text` flag, and the variables `REVIEW_INSTRUCTIONS_FILE` and `REVIEW_INSTRUCTIONS`. The `publish` command SHALL accept the GitLab API URL, the access token, the severity threshold, the confidence threshold, and the template directory. The template directory is set by the `--template-dir` flag or the `PUBLISH_TEMPLATE_DIR` environment variable, and the flag wins when both are set. The `publish` command MUST NOT accept the project ID or the merge request IID, and MUST NOT read them from the environment. The `publish` command MUST NOT accept the `--instructions` flag or the `--instructions-text` flag, and MUST ignore the two variables. Neither command SHALL accept configuration that only the other command uses.

#### Scenario: Review does not accept the severity threshold
- **WHEN** a person passes a severity-threshold flag to the `review` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Review does not accept the confidence threshold
- **WHEN** a person passes the `--fail-on-confidence` flag to the `review` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish does not accept OpenAI configuration
- **WHEN** a person passes an OpenAI model or API key flag to the `publish` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish does not accept the review language
- **WHEN** a person passes the `--language` flag to the `publish` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish does not accept the merge request flags
- **WHEN** a person passes the `--mr` or `--project-id` flag to the `publish` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish ignores the merge request variables
- **WHEN** `CI_MERGE_REQUEST_IID` and `CI_PROJECT_ID` are set, and the findings file names a different merge request
- **THEN** the system publishes to the merge request in the findings file

#### Scenario: Review does not accept the template directory
- **WHEN** a person passes the `--template-dir` flag to the `review` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish accepts the template directory flag
- **WHEN** a person passes `--template-dir` with a directory to the `publish` command
- **THEN** the system reads the templates from that directory

#### Scenario: Publish accepts the template directory variable
- **WHEN** `PUBLISH_TEMPLATE_DIR` is set, and the `publish` command has no `--template-dir` flag
- **THEN** the system reads the templates from the directory in the variable

#### Scenario: Flag wins over the variable
- **WHEN** `PUBLISH_TEMPLATE_DIR` is set to one directory, and the `--template-dir` flag names another directory
- **THEN** the system reads the templates from the directory in the flag

#### Scenario: Template directory is empty
- **WHEN** `--template-dir` or `PUBLISH_TEMPLATE_DIR` is set to an empty string
- **THEN** the system stops with a configuration error and exits with code 2

#### Scenario: Review accepts the instructions path flag
- **WHEN** a person passes `--instructions` with a file path to the `review` command
- **THEN** the system reads the review instructions from that file

#### Scenario: Review accepts the instructions text flag
- **WHEN** a person passes `--instructions-text` with a text to the `review` command
- **THEN** the system uses that text as the review instructions

#### Scenario: Publish does not accept the instructions flags
- **WHEN** a person passes the `--instructions` flag or the `--instructions-text` flag to the `publish` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish ignores the instructions variables
- **WHEN** `REVIEW_INSTRUCTIONS_FILE` and `REVIEW_INSTRUCTIONS` are set to values that are not usable, and a person runs the `publish` command
- **THEN** the system publishes as without them, and writes no log line about them
