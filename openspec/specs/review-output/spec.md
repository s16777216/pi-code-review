## Purpose

The GitLab sink adapter for the `ReviewEngine`. Publishes the engine's findings where a human will see them: inline merge request comments.

## Requirements

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

### Requirement: Mark comments posted by this tool
The system SHALL start the body of each discussion that it creates with the marker `<!-- pi-code-review -->`. The marker is an HTML comment, so GitLab does not show it in the rendered comment.

#### Scenario: A posted comment carries the marker
- **WHEN** the system creates a discussion for a finding
- **THEN** the discussion body starts with `<!-- pi-code-review -->`, followed by the severity and the summary

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

### Requirement: Resolve discussions declared fixed
For each fixed declaration in the findings file, the system SHALL add a reply with the reason to the discussion, and then resolve the discussion. The system MUST NOT resolve a discussion that this tool did not start. A failure for one declaration MUST NOT stop the others.

#### Scenario: Declared discussion is resolved
- **WHEN** the findings file declares an open discussion from this tool as fixed
- **THEN** the system adds a reply that starts with the marker and contains the reason, and then resolves the discussion

#### Scenario: Discussion was resolved after the review
- **WHEN** the findings file declares a discussion as fixed, and the discussion is already resolved at publish time
- **THEN** the system adds no reply and makes no change

#### Scenario: Discussion no longer exists
- **WHEN** the findings file declares a discussion as fixed, and the discussion is not in the merge request at publish time
- **THEN** the system writes one `warn` log line and continues

#### Scenario: Discussion was not started by this tool
- **WHEN** the findings file declares a discussion that has no marker at publish time
- **THEN** the system does not reply to or resolve that discussion, and writes one `warn` log line

#### Scenario: Resolve request fails
- **WHEN** the system adds the reply, and the GitLab API rejects the resolve request
- **THEN** the system keeps the reply, writes one `warn` log line, and continues with the other declarations

#### Scenario: Pass or fail ignores declarations
- **WHEN** the findings file has declarations and findings
- **THEN** the system decides pass or fail from the findings only
