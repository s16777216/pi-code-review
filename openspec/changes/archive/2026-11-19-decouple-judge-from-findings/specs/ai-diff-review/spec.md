## ADDED Requirements

### Requirement: Judge each open discussion of this tool
The system SHALL run the discussion judgment step after the verification step and before the check on fixed declarations. The step MUST select a discussion only when all of these are true. This tool started the discussion. It is not resolved. It has an anchor and a file. The selection MUST NOT read the findings. The system SHALL start one judge run for each file that has at least one selected discussion. The judge SHALL give each selected discussion of that file one judgment: `fixed`, `not_fixed`, or `uncertain`. The system MUST NOT call the model for this step when no discussion is selected.

#### Scenario: Selected discussions are judged by file
- **WHEN** two open discussions from this tool are on `src/a.ts` and one is on `src/b.ts`
- **THEN** the system starts two judge runs, one for `src/a.ts` with two discussions and one for `src/b.ts` with one discussion

#### Scenario: A discussion from a person is not selected
- **WHEN** the only open discussion on a file was started by a person
- **THEN** the system does not select it and does not start a judge run for that file

#### Scenario: A resolved discussion is not selected
- **WHEN** a discussion from this tool is resolved
- **THEN** the system does not select it

#### Scenario: A discussion without a file is not selected
- **WHEN** a discussion from this tool is a general comment with no file
- **THEN** the system does not select it

#### Scenario: A discussion without an anchor is not selected
- **WHEN** a discussion from this tool has no anchor
- **THEN** the system does not select it

#### Scenario: A finding links to the discussion
- **WHEN** a finding that remains after the verification step has `relatesTo` equal to `d1`, and `d1` is an open discussion from this tool with a file and an anchor
- **THEN** the system selects `d1` and gives it to the judge

#### Scenario: No discussion is selected
- **WHEN** no discussion meets the selection rules
- **THEN** the system does not call the model for the discussion judgment step

#### Scenario: The discussions cannot be listed
- **WHEN** the list of discussions is not available
- **THEN** the system does not call the model for the discussion judgment step

## MODIFIED Requirements

### Requirement: Turn a fixed judgment into a declaration
The system SHALL turn each `fixed` judgment into one fixed declaration with the discussion ID and the reason of the judgment. The system MUST NOT turn a `not_fixed` or an `uncertain` judgment into a declaration. The declarations MUST go through the check in "Accept a fixed declaration only after the checks". The system SHALL give the evidence line of a `fixed` judgment to that check. The system MUST NOT resolve a discussion with a judgment alone.

#### Scenario: A fixed judgment on a deleted file
- **WHEN** the judge gives `fixed` for a discussion from this tool on a file that the change deletes
- **THEN** the check accepts the declaration without a file read

#### Scenario: A fixed judgment becomes a declaration
- **WHEN** the judge gives the judgment `fixed` with the reason "Line 41 now calls `hide()` after the navigation." for discussion `d1`
- **THEN** the system adds one declaration for `d1` with that reason, before the check on declarations

#### Scenario: A not-fixed judgment gives no declaration
- **WHEN** the judge gives the judgment `not_fixed` for `d2`
- **THEN** the system adds no declaration for `d2`

#### Scenario: An uncertain judgment gives no declaration
- **WHEN** the judge gives the judgment `uncertain` for `d3`
- **THEN** the system adds no declaration for `d3`

#### Scenario: The anchored line is still in the file
- **WHEN** the judge gives `fixed` for `d1` with no evidence line, and a line in the current file still has the anchor of `d1`
- **THEN** the check drops the declaration with the reason `anchor_still_present`, and the system does not resolve `d1`

#### Scenario: A finding links to the discussion
- **WHEN** the judge gives `fixed` for `d1`, the anchor of `d1` is gone from the current file, and a finding that remains after the verification step has `relatesTo` equal to `d1`
- **THEN** the check drops the declaration with the reason `linked_by_finding`, the system does not resolve `d1`, and the `warn` log line has the field `source` with the value `discussion_judgment`

## REMOVED Requirements

### Requirement: Select and judge the open discussions
**Reason**: The requirement makes the selection depend on the findings. The judge does not need a finding, and the check on fixed declarations already guards a discussion that a finding links to.
**Migration**: Use "Judge each open discussion of this tool". The scenarios "A finding links to the discussion" and "The verification step removes the linking finding" have no replacement, because the selection no longer reads the findings. The new requirement has a scenario for a linked discussion.
