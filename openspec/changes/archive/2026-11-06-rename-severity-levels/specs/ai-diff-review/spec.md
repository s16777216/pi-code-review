## MODIFIED Requirements

### Requirement: Classify each finding with a severity
The system SHALL assign each finding exactly one severity: `critical`, `high`, `medium`, `low`, or `pre_existing`. A bug the diff introduces SHALL be classified `critical`, `high`, `medium`, or `low` by impact. A bug in code the change did not modify SHALL be classified `pre_existing`, regardless of how severe it would otherwise be.

#### Scenario: Finding breaks core functionality, causes data loss, or is a security issue
- **WHEN** the agent reports a bug that the reviewed change's own diff introduces, and the bug breaks core functionality, causes data loss or corruption, or is a security issue
- **THEN** the finding's severity is `critical`

#### Scenario: Finding is a bug introduced by the diff
- **WHEN** the agent reports a bug that the reviewed change's own diff introduces, and the bug causes clearly incorrect behavior on the common path
- **THEN** the finding's severity is `high`

#### Scenario: Finding is real but limited to edge cases
- **WHEN** the agent reports a bug that the reviewed change's own diff introduces, and the bug is real but limited to edge cases or of modest impact
- **THEN** the finding's severity is `medium`

#### Scenario: Finding is minor and not worth blocking
- **WHEN** the agent reports an issue that the reviewed change's own diff introduces, and the issue is worth a comment but not worth blocking (for example, style or naming)
- **THEN** the finding's severity is `low`

#### Scenario: Finding is a bug that predates the diff
- **WHEN** the agent reports a bug in code the reviewed change did not change
- **THEN** the finding's severity is `pre_existing`
