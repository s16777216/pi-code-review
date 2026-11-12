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
The system SHALL fetch the diff for every file the merge request changes, including the file path and the line-level hunks. The system SHALL mark a changed file as omitted because it is too large when GitLab reports `too_large`, and as omitted because it is generated when GitLab reports `generated_file`.

#### Scenario: Diff fetch succeeds
- **WHEN** the system fetches the diff for a merge request
- **THEN** the system has, for each changed file, the old path, the new path, and the hunk text

#### Scenario: GitLab does not return a diff that is too large
- **WHEN** GitLab returns a changed file with `too_large: true` and an empty diff
- **THEN** the system marks that file as omitted because it is too large

#### Scenario: GitLab marks a generated file
- **WHEN** GitLab returns a changed file with `generated_file: true` and `too_large: false`
- **THEN** the system marks that file as omitted because it is generated, and keeps its hunk text

#### Scenario: Both flags are set
- **WHEN** GitLab returns a changed file with both `too_large: true` and `generated_file: true`
- **THEN** the system marks that file as omitted because it is too large

### Requirement: Fetch full content of a changed file on demand
The system SHALL fetch the full content of a changed file at the head commit when the review step requests it.

#### Scenario: File content fetch succeeds
- **WHEN** the review step requests the content of a file that the merge request changed
- **THEN** the system returns the full file content at the merge request's head commit

#### Scenario: File content fetch fails
- **WHEN** the system cannot fetch a requested file's content
- **THEN** the system returns an error message instead of the file content, and the review step continues

### Requirement: Authenticate with a GitLab access token
The system SHALL authenticate every GitLab API call with the `GITLAB_TOKEN` environment variable (or the `--token` CLI flag), sent in the `PRIVATE-TOKEN` request header. The system MUST NOT use GitLab CI's `CI_JOB_TOKEN`/`JOB-TOKEN` mechanism.

#### Scenario: Token is present
- **WHEN** the system calls the GitLab API
- **THEN** the system sends the `GITLAB_TOKEN` value in the `PRIVATE-TOKEN` request header

#### Scenario: Token is missing
- **WHEN** neither `GITLAB_TOKEN` nor `--token` is set
- **THEN** the system stops before it calls the GitLab API, and reports a clear configuration error

### Requirement: Fetch merge request discussions on demand
The system SHALL fetch the merge request's discussions from the GitLab API when the review step requests them, with pagination. The system SHALL return each discussion's ID, its file and new-file line when it is a diff discussion, the head commit SHA of its position, its resolved state, and its notes with author username and body. The system MUST leave out GitLab system notes. The system SHALL fetch the discussions at most one time per review.

#### Scenario: Discussions fetch succeeds
- **WHEN** the review step requests the discussions of a merge request with one diff discussion and one general discussion
- **THEN** the system returns two discussions, and only the diff discussion has a file and a line

#### Scenario: System notes are left out
- **WHEN** a discussion contains a GitLab system note, for example "added 1 commit"
- **THEN** the system does not return that note

#### Scenario: A discussion was started by this tool
- **WHEN** the first note of a discussion contains the marker that this tool adds to its comments
- **THEN** the system marks that discussion as started by this tool

#### Scenario: Discussions fetch fails
- **WHEN** the GitLab API returns an error for the discussions request
- **THEN** the system returns an error message instead of the discussions, and the review step continues

#### Scenario: Discussions are requested two times
- **WHEN** the review step requests the discussions two times in one review
- **THEN** the system calls the GitLab discussions API for the first request only

### Requirement: Expose the anchor of a discussion started by this tool
The system SHALL read the anchor from the marker in the first note of each discussion that this tool started, and return it with the discussion. A discussion with no anchor in its marker SHALL have no anchor.

#### Scenario: Marker contains an anchor
- **WHEN** the first note of a discussion starts with `<!-- pi-code-review anchor=3f9a1c0b2d4e5f60 -->`
- **THEN** the system returns the discussion with the anchor `3f9a1c0b2d4e5f60`

#### Scenario: Marker has no anchor
- **WHEN** the first note of a discussion starts with `<!-- pi-code-review -->`
- **THEN** the system returns the discussion with no anchor

### Requirement: Retry a read request to GitLab
The system SHALL send a read request (`GET`) to the GitLab API at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. The system SHALL retry a request when it ends with a network error, with a status of 500 or more, or with the status 429. The system MUST NOT retry a request that ends with another status. The system MUST NOT retry a request that is not a `GET` request. Each retry MUST write one `warn` log line with the method, the path, the try number, and the cause. The system MUST NOT write the access token or the request headers in the log line.

#### Scenario: A read request passes on the second try
- **WHEN** the first try of a `GET` request ends with a network error and the second try returns status 200
- **THEN** the system uses the response of the second try, and writes one `warn` log line

#### Scenario: A server error is tried again
- **WHEN** a `GET` request returns the status 502 on the first try and the status 200 on the second try
- **THEN** the system uses the response of the second try

#### Scenario: Too many requests
- **WHEN** a `GET` request returns the status 429 on the first try
- **THEN** the system waits 2 seconds and sends the request again

#### Scenario: A client error is not tried again
- **WHEN** a `GET` request returns the status 404 or 401
- **THEN** the system does not send the request again, and reports the status

#### Scenario: The last try fails
- **WHEN** the third try of a `GET` request ends with the status 503
- **THEN** the system reports the failure with the status 503

#### Scenario: A write request is not tried again
- **WHEN** a `POST` request to create a discussion ends with a network error
- **THEN** the system does not send the request again

#### Scenario: The log has no secret
- **WHEN** the system retries a request
- **THEN** the `warn` log line does not hold the access token
