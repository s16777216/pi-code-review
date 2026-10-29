## Purpose

The GitLab source adapter for the `ReviewEngine`. Builds a `ReviewContext` by fetching a merge request's diff, file content, and intent from the GitLab API.

## Requirements

### Requirement: Fetch merge request metadata
The system SHALL fetch the merge request title, description, and diff refs (`base_sha`, `start_sha`, `head_sha`) from the GitLab API before it starts a review.

#### Scenario: Metadata fetch succeeds
- **WHEN** the system starts a review for a merge request
- **THEN** the system has the merge request title, description, and diff refs available for the rest of the review

#### Scenario: Pipeline is not a merge request pipeline
- **WHEN** the CI pipeline has no merge request IID
- **THEN** the system skips the review and exits with code 0

### Requirement: Fetch the merge request diff
The system SHALL fetch the diff for every file the merge request changes, including the file path and the line-level hunks.

#### Scenario: Diff fetch succeeds
- **WHEN** the system fetches the diff for a merge request
- **THEN** the system has, for each changed file, the old path, the new path, and the hunk text

### Requirement: Fetch full content of a changed file on demand
The system SHALL fetch the full content of a changed file at the head commit when the review step requests it.

#### Scenario: File content fetch succeeds
- **WHEN** the review step requests the content of a file that the merge request changed
- **THEN** the system returns the full file content at the merge request's head commit

#### Scenario: File content fetch fails
- **WHEN** the system cannot fetch a requested file's content
- **THEN** the system returns an error message instead of the file content, and the review step continues

### Requirement: Authenticate with the CI job token
The system SHALL authenticate every GitLab API call with the `CI_JOB_TOKEN` environment variable.

#### Scenario: Job token is present
- **WHEN** the system calls the GitLab API
- **THEN** the system sends the `CI_JOB_TOKEN` value in the `JOB-TOKEN` request header

#### Scenario: Job token is missing
- **WHEN** the `CI_JOB_TOKEN` environment variable is not set
- **THEN** the system stops before it calls the GitLab API, and reports a clear configuration error
