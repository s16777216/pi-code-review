# Spec Delta

## ADDED Requirements

### Requirement: Mark comments posted by this tool
The system SHALL start the body of each discussion that it creates with the marker `<!-- pi-code-review -->`. The marker is an HTML comment, so GitLab does not show it in the rendered comment.

#### Scenario: A posted comment carries the marker
- **WHEN** the system creates a discussion for a finding
- **THEN** the discussion body starts with `<!-- pi-code-review -->`, followed by the severity and the summary
