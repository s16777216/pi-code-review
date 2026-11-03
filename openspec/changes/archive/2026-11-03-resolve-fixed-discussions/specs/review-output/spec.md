# Spec Delta

## ADDED Requirements

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
