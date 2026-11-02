## Purpose

The GitLab sink adapter for the `ReviewEngine`. Publishes the engine's findings where a human will see them: inline merge request comments.

## Requirements

### Requirement: Publish findings as inline merge request comments
The system SHALL create one GitLab merge request discussion per valid finding, positioned at the finding's file and line.

#### Scenario: Valid finding becomes an inline comment
- **WHEN** the system has a valid finding for a changed file and line
- **THEN** the system creates a merge request discussion at that file and line, with the finding's severity and summary in the comment body

#### Scenario: Discussion creation fails for one finding
- **WHEN** the GitLab API rejects one finding's discussion
- **THEN** the system logs the failure and continues publishing the remaining findings
