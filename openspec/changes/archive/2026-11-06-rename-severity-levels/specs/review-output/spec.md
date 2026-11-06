## MODIFIED Requirements

### Requirement: Count skipped findings toward pass or fail
The system SHALL decide pass or fail from every finding in the findings file. A finding for which the system creates no discussion MUST count toward the decision.

#### Scenario: Every finding relates to an open discussion
- **WHEN** every finding relates to an open discussion, one finding has severity `high`, and the threshold is `high`
- **THEN** the system creates no discussion, and the `publish` command exits with a non-zero code
