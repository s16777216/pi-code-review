# Spec Delta

## MODIFIED Requirements

### Requirement: Publish findings as inline merge request comments
The system SHALL create one GitLab merge request discussion per valid finding, positioned at the finding's file and line. The system MUST NOT create a discussion for a finding when a comment that this tool posted already exists at the same file and line with the same text.

#### Scenario: Valid finding becomes an inline comment
- **WHEN** the system has a valid finding for a changed file and line
- **THEN** the system creates a merge request discussion at that file and line, with the finding's severity and summary in the comment body

#### Scenario: Discussion creation fails for one finding
- **WHEN** the GitLab API rejects one finding's discussion
- **THEN** the system logs the failure and continues publishing the remaining findings

#### Scenario: The same finding was already published
- **WHEN** the merge request already has a comment that this tool posted at the finding's file and line, with the same severity and summary
- **THEN** the system does not create a new discussion for that finding

#### Scenario: A comment from a person matches a finding
- **WHEN** the merge request has a comment that a person wrote at the finding's file and line, with the same text
- **THEN** the system creates a new discussion for that finding

#### Scenario: The same finding moved to a different line
- **WHEN** this tool posted a comment for a finding at line 10, and the new findings file has the same finding at line 12
- **THEN** the system creates a new discussion at line 12

#### Scenario: Existing discussions cannot be read
- **WHEN** the GitLab API returns an error for the request that lists existing discussions
- **THEN** the system writes one `warn` log line and creates a discussion for every finding

## ADDED Requirements

### Requirement: Mark comments posted by this tool
The system SHALL include a hidden marker in the body of each discussion that it creates. The marker MUST NOT appear in the comment as GitLab renders it.

#### Scenario: A posted comment carries the marker
- **WHEN** the system creates a discussion for a finding
- **THEN** the discussion body contains the marker, inside an HTML comment

### Requirement: Count skipped findings toward pass or fail
The system SHALL decide pass or fail from every finding in the findings file. A finding that the system skips as a duplicate MUST count toward the decision.

#### Scenario: Every finding is a duplicate
- **WHEN** every finding in the findings file was already published, and one finding has severity `important`, and the threshold is `important`
- **THEN** the system creates no discussion and the `publish` command exits with a non-zero code
