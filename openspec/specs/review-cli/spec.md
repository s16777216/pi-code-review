## Purpose

Splits the command-line tool into a `review` command and a `publish` command, connected by a findings file, so a local run can see the AI review's output without posting anything to GitLab.

## Requirements

### Requirement: Provide separate review and publish commands
The system SHALL expose two commands: `review` and `publish`. The system MUST NOT run both in a single invocation.

#### Scenario: Review command runs alone
- **WHEN** a person runs the `review` command
- **THEN** the system fetches the merge request, runs the AI review, and stops without contacting GitLab to publish anything

#### Scenario: Publish command runs alone
- **WHEN** a person runs the `publish` command
- **THEN** the system publishes findings to GitLab without running the AI review or contacting OpenAI

### Requirement: Review writes findings to a file
The `review` command SHALL write the findings, the accepted fixed declarations, the unreviewed files, the diff refs, and the source of the review to a JSON file. The source names the host, the project, and the merge request that the review read. The default file path MUST be `findings.json` in the working directory.

#### Scenario: Review produces a findings file
- **WHEN** the `review` command finishes a review
- **THEN** the system writes a JSON file containing every valid finding, every accepted fixed declaration, every unreviewed file, the diff refs for the reviewed merge request, and the source with its host name, project ID, and merge request IID

#### Scenario: Review produces no findings
- **WHEN** the `review` command finds no valid findings
- **THEN** the system still writes a findings file, with an empty list of findings

#### Scenario: Review produces no fixed declarations
- **WHEN** the `review` command accepts no fixed declaration
- **THEN** the system writes an empty `resolved` list

#### Scenario: Review omits no file
- **WHEN** no changed file is omitted
- **THEN** the system writes an empty `unreviewedFiles` list

### Requirement: Publish reads findings from a file
The `publish` command SHALL read findings, diff refs, and the source from a JSON file given by a command-line flag, defaulting to `findings.json`. The `publish` command SHALL publish to the project and the merge request that the source names, and MUST stop when the source names a host that it does not support. The `publish` command SHALL reject a findings file with an invalid structure before it calls the GitLab API.

#### Scenario: Publish reads the default file
- **WHEN** the `publish` command runs without specifying a file
- **THEN** the system reads `findings.json` from the working directory

#### Scenario: Publish reads a named file
- **WHEN** the `publish` command runs with a file path given explicitly
- **THEN** the system reads that file instead of `findings.json`

#### Scenario: Publish targets the source in the file
- **WHEN** the findings file has the source with host `gitlab`, project ID `12`, and merge request IID `7`
- **THEN** the system publishes to merge request `7` of project `12`

#### Scenario: Findings file is missing or unreadable
- **WHEN** the `publish` command cannot read the findings file
- **THEN** the system stops before it calls the GitLab API, and reports a clear error

#### Scenario: Findings file has no source
- **WHEN** the findings file is valid JSON but has no `source` object, or its host, project ID, or merge request IID is not a non-empty string
- **THEN** the system stops before it calls the GitLab API, exits with a non-zero code, and reports an error that names the file and the missing field

#### Scenario: Findings file names another host
- **WHEN** the findings file has a source whose host is not `gitlab`
- **THEN** the system stops before it calls the GitLab API, exits with a non-zero code, and reports an error that names the file and the host

#### Scenario: Findings file has no diff refs
- **WHEN** the findings file is valid JSON but has no `diffRefs` object, or one of its three SHA fields is not a non-empty string
- **THEN** the system stops before it calls the GitLab API, exits with a non-zero code, and reports an error that names the file and the missing field

#### Scenario: Findings file has an invalid finding
- **WHEN** the findings file contains a finding with a missing field, a non-integer line, or a severity that is not `critical`, `high`, `medium`, `low`, or `pre_existing`
- **THEN** the system stops before it calls the GitLab API, exits with a non-zero code, posts no discussion, and reports an error that names the finding's index and field

#### Scenario: Findings file is not an object
- **WHEN** the findings file is valid JSON but its top-level value is not an object with a `findings` array
- **THEN** the system stops before it calls the GitLab API, and reports a clear error

#### Scenario: Findings file has extra fields
- **WHEN** the findings file is valid and also contains fields that the system does not know
- **THEN** the system ignores the extra fields and publishes the findings

#### Scenario: Findings file has no unreviewed files
- **WHEN** the findings file has no `unreviewedFiles` field
- **THEN** the system reads it as an empty list of unreviewed files

#### Scenario: Findings file has an invalid unreviewed file
- **WHEN** an entry in `unreviewedFiles` has no string `path`, or a `reason` that is not `too_large` or `generated`
- **THEN** the system stops before it calls the GitLab API, exits with a non-zero code, and reports an error that names the entry's index and field

### Requirement: Review's exit code reflects only process success
The `review` command's exit code MUST NOT depend on the severity of any finding. It SHALL be 0 when the review completes, and 2 when the review process itself fails (for example, a GitLab or OpenAI API error). The `review` command MUST NOT exit with code 1. When the review fails after the system read the merge request, the `review` command SHALL write the findings file as the requirement "Review writes the failure and the warnings" says, and then exit with code 2.

#### Scenario: Review finds a severe bug
- **WHEN** the `review` command completes and writes a findings file containing a finding with severity `critical`
- **THEN** the `review` command exits with code 0

#### Scenario: Review's own process fails
- **WHEN** the `review` command cannot complete the review (for example, the GitLab API is unreachable)
- **THEN** the `review` command exits with code 2, and writes no findings file when it failed before it read the merge request

#### Scenario: Review fails after it read the merge request
- **WHEN** a model run fails on its last try after the system read the merge request
- **THEN** the `review` command writes the findings file with a `failed` object, and exits with code 2

### Requirement: Publish's exit code reflects the severity-threshold decision
The `publish` command SHALL decide a pass or fail outcome from the findings it reads and a severity threshold, using the same decision described previously in the `ai-diff-review` capability (see that capability's removed requirement). The outcome MUST be a fail when the findings file has a `failed` object. After publishing completes, the `publish` command SHALL exit with code 0 for a pass and code 1 for a fail. It SHALL exit with code 2 when an error stops it, and MUST NOT use code 1 for an error.

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

#### Scenario: The review failed
- **WHEN** the findings file has a `failed` object
- **THEN** the `publish` command posts no discussion, posts the review status comment, and exits with code 1

### Requirement: Each command accepts only the configuration it needs
The `review` command SHALL accept GitLab connection configuration, the project ID, the merge request IID, OpenAI configuration, the review language, and the instructions sources for the review instructions. The instructions sources are the `--instructions` flag, the `--instructions-text` flag, and the variables `REVIEW_INSTRUCTIONS_FILE` and `REVIEW_INSTRUCTIONS`. The `publish` command SHALL accept the GitLab API URL, the access token, the severity threshold, and the template directory. The template directory is set by the `--template-dir` flag or the `PUBLISH_TEMPLATE_DIR` environment variable, and the flag wins when both are set. The `publish` command MUST NOT accept the project ID or the merge request IID, and MUST NOT read them from the environment. The `publish` command MUST NOT accept the `--instructions` flag or the `--instructions-text` flag, and MUST ignore the two variables. Neither command SHALL accept configuration that only the other command uses.

#### Scenario: Review does not accept the severity threshold
- **WHEN** a person passes a severity-threshold flag to the `review` command
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

### Requirement: Review deletes the old findings file before it starts
The `review` command SHALL delete the findings file at its output path before it contacts the host, when the pipeline is a merge request pipeline. The command MUST NOT fail when the file does not exist. The command MUST NOT delete the file when it skips the review because the pipeline is not a merge request pipeline.

#### Scenario: An old file exists and the review fails early
- **WHEN** `findings.json` from an earlier run exists, and the `review` command stops because the GitLab API is unreachable
- **THEN** the system has deleted `findings.json`, and no findings file is left

#### Scenario: No old file exists
- **WHEN** the output path has no file when the `review` command starts
- **THEN** the system starts the review with no error

#### Scenario: The pipeline is not a merge request pipeline
- **WHEN** the `review` command skips the review because the pipeline has no merge request IID
- **THEN** the system does not delete a file at the output path

### Requirement: Review writes the failure and the warnings
The findings file SHALL have a `warnings` list. Each entry has a `code` and, for the codes `verification_failed` and `verification_skipped`, a `file` path. The list MUST be empty when the review has no warning. When the review fails after the system read the merge request, the `review` command SHALL write the findings file with a `failed` object and empty lists of findings, fixed declarations, and unreviewed files. The `failed` object holds the `category` of the review failure and MUST NOT hold the text of the error. The `review` command MUST NOT write a `failed` field when the review completes. The command SHALL write the full error to the log at the level `error`.

#### Scenario: Review completes with a warning
- **WHEN** the deduplication step failed and the review completed
- **THEN** the findings file holds the findings and a `warnings` list with one entry that has the code `deduplication_failed`, and has no `failed` field

#### Scenario: Review completes with no warning
- **WHEN** the review completes with no degraded step
- **THEN** the `warnings` list in the findings file is empty

#### Scenario: Review fails after the merge request was read
- **WHEN** a model run fails on its third try after the system read the merge request
- **THEN** the system writes a findings file with the `diffRefs`, the `source`, an empty `findings` list, and `failed` with the category `model_failed`, and the file holds no error text

#### Scenario: Review fails before the merge request was read
- **WHEN** the GitLab API is unreachable when the system reads the merge request
- **THEN** the system writes no findings file

### Requirement: Publish reads the failure and the warnings
The `publish` command SHALL read the `failed` object and the `warnings` list from the findings file. A file without these fields MUST be valid and read as no failure and no warnings. The `publish` command SHALL reject a file before it calls the GitLab API when `failed` has a `category` that is not `model_failed`, `output_cut`, `too_large`, or `other`, or when a warning has a `code` that is not `deduplication_failed`, `verification_failed`, or `verification_skipped`, or when a warning with the code `verification_failed` or `verification_skipped` has no `file` string.

#### Scenario: File without the new fields
- **WHEN** the findings file has no `failed` and no `warnings`
- **THEN** the system publishes as without a failure and without warnings

#### Scenario: File with a failure
- **WHEN** the findings file has `failed` with the category `output_cut`
- **THEN** the system reads the failure and publishes the review status comment

#### Scenario: Unknown failure category
- **WHEN** the findings file has `failed` with the category `network`
- **THEN** the system stops before it calls the GitLab API, exits with code 2, and reports an error that names the file and the field

#### Scenario: Unknown warning code
- **WHEN** an entry in `warnings` has the code `x`
- **THEN** the system stops before it calls the GitLab API, exits with code 2, and reports an error that names the entry's index and field

#### Scenario: Warning without a file
- **WHEN** an entry in `warnings` has the code `verification_failed` and no `file` string
- **THEN** the system stops before it calls the GitLab API, exits with code 2, and reports an error that names the entry's index and field
