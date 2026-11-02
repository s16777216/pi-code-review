# Spec Delta

## ADDED Requirements

### Requirement: Compute an anchor for each finding
The system SHALL add an `anchor` to each returned finding. The anchor MUST be the first 16 hexadecimal characters of the SHA-256 hash of the file path, a line break, and the text of the finding's line in the new version of the file, with leading and trailing white space removed. The line text MUST come from the diff.

#### Scenario: Same code at a different line
- **WHEN** two findings are on the same file, at lines 42 and 45, and both lines have the text `for (i = 0; i <= n; i++)`
- **THEN** the two findings have the same anchor

#### Scenario: Same line number with different code
- **WHEN** two findings are on the same file and the same line number, and the line text differs between two reviews
- **THEN** the two findings have different anchors

#### Scenario: Indentation changes
- **WHEN** the only difference between two lines is the leading white space
- **THEN** the two findings have the same anchor
