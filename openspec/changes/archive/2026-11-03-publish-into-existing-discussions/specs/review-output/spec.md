# Spec Delta

## MODIFIED Requirements

### Requirement: Publish findings as inline merge request comments
The system SHALL create one GitLab merge request discussion per valid finding, positioned at the finding's file and line, except in the cases below. A finding whose `relatesTo` names an open discussion MUST NOT create a discussion. A finding whose `relatesTo` names a resolved discussion SHALL become a reply in that discussion, and the system SHALL reopen it. A finding with no `relatesTo` MUST NOT create a discussion when an open discussion from this tool has the same anchor.

#### Scenario: Valid finding becomes an inline comment
- **WHEN** the system has a valid finding for a changed file and line
- **THEN** the system creates a merge request discussion at that file and line, with the finding's severity and summary in the comment body

#### Scenario: Discussion creation fails for one finding
- **WHEN** the GitLab API rejects one finding's discussion
- **THEN** the system logs the failure and continues publishing the remaining findings

#### Scenario: Finding relates to an open discussion
- **WHEN** a finding's `relatesTo` names a discussion that is not resolved
- **THEN** the system does not create a discussion or a reply for that finding

#### Scenario: Finding relates to a resolved discussion
- **WHEN** a finding's `relatesTo` names a resolved discussion
- **THEN** the system adds a reply with the finding's severity and summary to that discussion, and marks the discussion as not resolved

#### Scenario: Reopening a discussion fails
- **WHEN** the system adds the reply, and the GitLab API rejects the request to reopen the discussion
- **THEN** the system keeps the reply, writes one `warn` log line, and continues

#### Scenario: Finding relates to a discussion that no longer exists
- **WHEN** a finding's `relatesTo` names an ID that is not in the merge request's discussions
- **THEN** the system creates a new discussion for that finding

#### Scenario: Finding matches an open discussion from this tool by anchor
- **WHEN** a finding has no `relatesTo`, and an open discussion from this tool has the same anchor
- **THEN** the system does not create a discussion for that finding

#### Scenario: Finding matches a resolved discussion from this tool by anchor
- **WHEN** a finding has no `relatesTo`, and only a resolved discussion from this tool has the same anchor
- **THEN** the system creates a new discussion for that finding

#### Scenario: Finding is on the same line as a person's discussion
- **WHEN** a finding has no `relatesTo`, and a discussion from a person is on the same line
- **THEN** the system creates a new discussion for that finding

#### Scenario: Existing discussions cannot be read
- **WHEN** the GitLab API returns an error for the request that lists the discussions
- **THEN** the system writes one `warn` log line and creates a new discussion for every finding

## ADDED Requirements

### Requirement: Record the anchor in each posted comment
The system SHALL write the finding's anchor into the hidden marker of each discussion and reply that it creates, as `<!-- pi-code-review anchor=<anchor> -->`.

#### Scenario: A posted comment carries the anchor
- **WHEN** the system creates a discussion for a finding with the anchor `3f9a1c0b2d4e5f60`
- **THEN** the discussion body starts with `<!-- pi-code-review anchor=3f9a1c0b2d4e5f60 -->`

### Requirement: Count skipped findings toward pass or fail
The system SHALL decide pass or fail from every finding in the findings file. A finding for which the system creates no discussion MUST count toward the decision.

#### Scenario: Every finding relates to an open discussion
- **WHEN** every finding relates to an open discussion, one finding has severity `important`, and the threshold is `important`
- **THEN** the system creates no discussion, and the `publish` command exits with a non-zero code
