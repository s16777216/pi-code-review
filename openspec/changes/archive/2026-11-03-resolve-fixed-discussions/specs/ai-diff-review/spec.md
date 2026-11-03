# Spec Delta

## ADDED Requirements

### Requirement: Declare fixed discussions
The system SHALL let the agent declare that a discussion is fixed, with the discussion ID and a one-sentence reason. The agent output SHALL be a JSON object with a `findings` array and a `resolved` array. The system SHALL also accept a bare JSON array, as findings with no declarations. The system SHALL drop an invalid declaration and write one `warn` log line.

#### Scenario: Agent declares a fix
- **WHEN** the agent output is an object with one finding and one declaration with a discussion ID and a reason
- **THEN** the system parses one finding and one declaration

#### Scenario: Agent returns a bare array
- **WHEN** the agent output is a JSON array of findings
- **THEN** the system parses the findings and returns no declarations

#### Scenario: A declaration has no reason
- **WHEN** a declaration has a discussion ID but no reason
- **THEN** the system drops that declaration, keeps the rest of the output, and writes one `warn` log line

#### Scenario: Output object has no findings array
- **WHEN** the agent output is a JSON object without a `findings` array
- **THEN** the system reports a review failure

### Requirement: Accept a fixed declaration only after the checks
The system SHALL accept a declaration only when the discussion exists in the change, this tool started it, it is not resolved, it has an anchor, no line in the current version of its file has that anchor, and no finding in the same output links to it. The system SHALL drop any other declaration and write one `warn` log line with the reason.

#### Scenario: All checks pass
- **WHEN** a declaration names an open discussion from this tool, and no line in the current file has the discussion's anchor
- **THEN** the system returns the declaration

#### Scenario: Discussion was started by a person
- **WHEN** a declaration names a discussion that a person started
- **THEN** the system drops the declaration and logs the reason

#### Scenario: The anchored line is still in the file
- **WHEN** a declaration names a discussion whose anchor matches a line in the current version of the file
- **THEN** the system drops the declaration and logs the reason

#### Scenario: Discussion has no anchor
- **WHEN** a declaration names a discussion from this tool that has no anchor
- **THEN** the system drops the declaration and logs the reason

#### Scenario: The file was deleted
- **WHEN** a declaration names a discussion on a file that the change deletes
- **THEN** the system returns the declaration

#### Scenario: File content cannot be read
- **WHEN** the system cannot read the current content of the discussion's file, and the change does not delete that file
- **THEN** the system drops the declaration and logs the reason

#### Scenario: A finding links to the same discussion
- **WHEN** a declaration names a discussion, and a finding in the same output has `relatesTo` equal to that discussion
- **THEN** the system drops the declaration and logs the reason

#### Scenario: Discussion is already resolved
- **WHEN** a declaration names a resolved discussion
- **THEN** the system drops the declaration and logs the reason
