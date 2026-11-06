## MODIFIED Requirements

### Requirement: Publish reads findings from a file
The `publish` command SHALL read findings and diff refs from a JSON file given by a command-line flag, defaulting to `findings.json`. The `publish` command SHALL reject a findings file with an invalid structure before it calls the GitLab API.

#### Scenario: Publish reads the default file
- **WHEN** the `publish` command runs without specifying a file
- **THEN** the system reads `findings.json` from the working directory

#### Scenario: Publish reads a named file
- **WHEN** the `publish` command runs with a file path given explicitly
- **THEN** the system reads that file instead of `findings.json`

#### Scenario: Findings file is missing or unreadable
- **WHEN** the `publish` command cannot read the findings file
- **THEN** the system stops before it calls the GitLab API, and reports a clear error

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
The `review` command's exit code MUST NOT depend on the severity of any finding. It SHALL be 0 when the review completes, and 2 when the review process itself fails (for example, a GitLab or OpenAI API error). The `review` command MUST NOT exit with code 1.

#### Scenario: Review finds a severe bug
- **WHEN** the `review` command completes and writes a findings file containing a finding with severity `critical`
- **THEN** the `review` command exits with code 0

#### Scenario: Review's own process fails
- **WHEN** the `review` command cannot complete the review (for example, the GitLab API is unreachable)
- **THEN** the `review` command exits with code 2, and does not write a findings file
