## MODIFIED Requirements

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

### Requirement: Each command accepts only the configuration it needs
The `review` command SHALL accept GitLab connection configuration, the project ID, the merge request IID, OpenAI configuration, and the review language. The `publish` command SHALL accept the GitLab API URL, the access token, and the severity threshold. The `publish` command MUST NOT accept the project ID or the merge request IID, and MUST NOT read them from the environment. Neither command SHALL accept configuration that only the other command uses.

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
