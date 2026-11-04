# Spec Delta

## MODIFIED Requirements

### Requirement: Review writes findings to a file
The `review` command SHALL write the findings, the accepted fixed declarations, the unreviewed files, and the diff refs needed to publish them to a JSON file. The default file path MUST be `findings.json` in the working directory.

#### Scenario: Review produces a findings file
- **WHEN** the `review` command finishes a review
- **THEN** the system writes a JSON file containing every valid finding, every accepted fixed declaration, every unreviewed file, and the diff refs for the reviewed merge request

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
- **WHEN** the findings file contains a finding with a missing field, a non-integer line, or a severity that is not `important`, `nit`, or `pre_existing`
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
