## ADDED Requirements

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

## MODIFIED Requirements

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
