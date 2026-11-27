## MODIFIED Requirements

### Requirement: Publish findings as inline merge request comments
The system SHALL create one GitLab merge request discussion per valid finding, at the finding's file and line, except in the cases below. For a finding with an end line, the discussion SHALL cover the range from the line to the end line, and its position SHALL be on the end line. The system SHALL create a range discussion also when lines of the range are not in the diff. A finding whose `relatesTo` names an open discussion MUST NOT create a discussion. A finding whose `relatesTo` names a resolved discussion SHALL become a reply in that discussion, and the system SHALL reopen it. A finding with no `relatesTo` SHALL be handled in the same way when a discussion from this tool has the same anchor.

#### Scenario: Valid finding becomes an inline comment
- **WHEN** the system has a valid finding for a changed file and line
- **THEN** the system creates a merge request discussion at that file and line, with the finding's severity and summary in the comment body

#### Scenario: Finding with an end line becomes a range comment
- **WHEN** the system has a valid finding with the line 562 and the end line 600
- **THEN** the system creates a merge request discussion that covers the lines 562 to 600, with its position on the line 600

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
- **THEN** the system adds a reply with the finding's severity and summary to that discussion, and marks the discussion as not resolved

#### Scenario: Finding matches an open and a resolved discussion by anchor
- **WHEN** a finding has no `relatesTo`, and both an open and a resolved discussion from this tool have the same anchor
- **THEN** the system does not create a discussion or a reply for that finding

#### Scenario: Finding matches two resolved discussions by anchor
- **WHEN** a finding has no `relatesTo`, and two resolved discussions from this tool have the same anchor
- **THEN** the system replies in, and reopens, the one that comes last in the merge request's list of discussions

#### Scenario: Finding is on the same line as a person's discussion
- **WHEN** a finding has no `relatesTo`, and a discussion from a person is on the same line
- **THEN** the system creates a new discussion for that finding

#### Scenario: Existing discussions cannot be read
- **WHEN** the GitLab API returns an error for the request that lists the discussions
- **THEN** the system writes one `warn` log line and creates a new discussion for every finding

### Requirement: Merge findings on the same line into one comment
After the system decides what to do with each finding, it SHALL create one discussion for all findings that would each create a discussion on the same file, line, and end line, and one reply for all findings that would each reply to the same discussion. The comment MUST start with one marker line, followed by one paragraph for each finding, in findings file order. The finding template SHALL give the text of each paragraph. The system MUST join the paragraphs with one blank line, and a template MUST NOT change how the system joins them.

#### Scenario: Two findings on the same line
- **WHEN** two findings without `relatesTo` are on the same file and line, and no discussion from this tool has their anchor
- **THEN** the system creates one discussion at that position, whose body has the marker line and then both findings, each with its own severity

#### Scenario: Two findings on the same line with different end lines
- **WHEN** two findings without `relatesTo` are on the same file and line, one has the end line 40, and the other has no end line
- **THEN** the system creates one discussion for each finding

#### Scenario: Two findings on different lines with the same text
- **WHEN** two findings are on different lines of the same file, and the two lines have the same text
- **THEN** the system creates one discussion for each finding

#### Scenario: Two findings reply to the same discussion
- **WHEN** two findings would each reply to the same resolved discussion
- **THEN** the system adds one reply with both findings, and reopens the discussion once

#### Scenario: One finding in a group
- **WHEN** only one finding would create a discussion at a file and line
- **THEN** the discussion body is the marker line followed by that finding's paragraph

#### Scenario: Merged findings use the finding template
- **WHEN** `FINDING.md` contains `- ${summary}`, and two findings are on the same file and line
- **THEN** the discussion body is the marker line, then `- ` and the first summary, then a blank line, then `- ` and the second summary

#### Scenario: Template cannot change the marker
- **WHEN** `FINDING.md` contains the text `<!-- pi-code-review anchor=0000000000000000 -->`
- **THEN** the first line of the discussion body is still the marker line that the system writes, with the anchor of the finding
