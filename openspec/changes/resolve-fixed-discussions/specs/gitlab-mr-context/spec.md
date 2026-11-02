# Spec Delta

## ADDED Requirements

### Requirement: Expose the anchor of a discussion started by this tool
The system SHALL read the anchor from the marker in the first note of each discussion that this tool started, and return it with the discussion. A discussion with no anchor in its marker SHALL have no anchor.

#### Scenario: Marker contains an anchor
- **WHEN** the first note of a discussion starts with `<!-- pi-code-review anchor=3f9a1c0b2d4e5f60 -->`
- **THEN** the system returns the discussion with the anchor `3f9a1c0b2d4e5f60`

#### Scenario: Marker has no anchor
- **WHEN** the first note of a discussion starts with `<!-- pi-code-review -->`
- **THEN** the system returns the discussion with no anchor
