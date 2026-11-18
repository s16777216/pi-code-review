## ADDED Requirements

### Requirement: Ask the judge for an evidence line
The system prompt of the judge MUST tell the judge to give an evidence line for each `fixed` judgment. The evidence line is one line of the current file that shows the fix. The prompt MUST tell the judge to copy the line as it appears in the file, with no line number. The prompt MUST tell the judge to choose a line that is not the line of the problem. The prompt MUST tell the judge to choose a line that is in the current file and not in a note. The prompt MUST tell the judge to copy one whole line, with the characters at its end. It MUST tell the judge to choose one of the lines when the code has more than one line, and not to join them. The `submit_judgments` tool SHALL accept an optional `evidence` in each judgment object, as a string or as `null`. The system SHALL accept a call that has no `evidence`. The system MUST ignore the `evidence` of a judgment that is not `fixed`. The system MUST treat an empty `evidence`, a blank `evidence`, `null`, and a value that is not a string as no evidence.

#### Scenario: The prompt asks for an evidence line
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt tells the judge to copy one line of the current file that shows the fix, with no line number, and not the line of the problem

#### Scenario: The prompt says where the line comes from
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt tells the judge that the evidence line is a line of the current file and is not a line from a note

#### Scenario: A fixed judgment has no evidence
- **WHEN** the call of the judge has a `fixed` judgment with no `evidence`
- **THEN** the system accepts the call

#### Scenario: A blank evidence counts as none
- **WHEN** the call of the judge has a `fixed` judgment with an `evidence` of only spaces, or with `null`
- **THEN** the system treats the judgment as one with no evidence

#### Scenario: An evidence that is not a string
- **WHEN** the system validates a `fixed` judgment whose `evidence` is a number
- **THEN** the system treats the judgment as one with no evidence and does not fail

#### Scenario: A not-fixed judgment has evidence
- **WHEN** the call of the judge has a `not_fixed` judgment with an `evidence`
- **THEN** the system accepts the call and ignores the `evidence`

### Requirement: Accept a judged declaration by its evidence line
This requirement applies to a declaration that the merge kept from a `fixed` judgment of the judge. It applies only when a line of the current file has the anchor of the discussion. The system SHALL accept such a declaration if its evidence line is valid. To normalize a text, the system trims it, replaces each run of white space by one space, and removes `;` and `,` at its end. An evidence line is valid when all of these are true. The evidence line has no line feed. The string length of the normalized evidence line is at least 8. After normalizing both texts, a whole line of the current file has the same text as the evidence line. At least one such line has another anchor than the discussion. The system SHALL drop such a declaration when its evidence line is not valid. The reason is `evidence_not_valid` when the judgment has an evidence line. The reason is `anchor_still_present` when the judgment has no evidence line. The `warn` log line for `evidence_not_valid` MUST have the field `evidence` with the text. It MUST also have the field `source` with the value `discussion_judgment`. It MUST also have the field `problem` with the first rule that failed, in this order: `multiple_lines`, `too_short`, `is_anchored_line`, or `not_in_file`. The system SHALL write one `info` log line for each declaration that this requirement accepts. The line has the discussion ID, the file, and the evidence line. The system MUST NOT record the evidence line in the findings file.

#### Scenario: A valid evidence line accepts the declaration
- **WHEN** the judge gives `fixed` for `d1` with an evidence line that has at least 8 characters, is a whole line of the current file, and has another anchor than `d1`, and a line of the file still has the anchor of `d1`
- **THEN** the check returns the declaration and the system writes one `info` log line with `d1`, the file, and the evidence line

#### Scenario: The anchor is gone
- **WHEN** the judge gives `fixed` for `d1` with no evidence line, and no line of the current file has the anchor of `d1`
- **THEN** the check returns the declaration, as before this requirement

#### Scenario: The anchor is gone and the evidence line is not valid
- **WHEN** the judge gives `fixed` for `d1` with an evidence line that no line of the current file has, and no line of the file has the anchor of `d1`
- **THEN** the check returns the declaration and does not use the evidence line

#### Scenario: The evidence line is not in the file
- **WHEN** the judge gives `fixed` for `d1` with an evidence line that no line of the current file has, and a line of the file has the anchor of `d1`
- **THEN** the check drops the declaration with the reason `evidence_not_valid`, and the `warn` log line has the field `evidence` and the field `source` with the value `discussion_judgment`

#### Scenario: The evidence line is a part of a line
- **WHEN** the evidence line is a part of a longer line, no whole line of the file has the same text, and a line of the file has the anchor of `d1`
- **THEN** the check drops the declaration with the reason `evidence_not_valid`

#### Scenario: The evidence line has more than one line
- **WHEN** the evidence line has two lines of code, and a line of the file has the anchor of `d1`
- **THEN** the check drops the declaration with the reason `evidence_not_valid`

#### Scenario: The evidence line is too short
- **WHEN** the evidence line has fewer than 8 characters after trimming, and a line of the file has the anchor of `d1`
- **THEN** the check drops the declaration with the reason `evidence_not_valid`

#### Scenario: The evidence line is the anchored line
- **WHEN** the only line of the file that matches the evidence line is the line that has the anchor of `d1`
- **THEN** the check drops the declaration with the reason `evidence_not_valid`

#### Scenario: The anchored line without its semicolon
- **WHEN** the evidence line is the anchored line of `d1` with no `;` at its end
- **THEN** the check drops the declaration with the reason `evidence_not_valid`

#### Scenario: A change of the indent does not matter
- **WHEN** the evidence line has different leading spaces than the line of the file, and the trimmed texts are the same
- **THEN** the check returns the declaration

#### Scenario: A missing semicolon or comma at the end does not matter
- **WHEN** the evidence line has no `;` or `,` at its end, and the line of the file has one
- **THEN** the check returns the declaration

#### Scenario: Spaces inside the line do not matter
- **WHEN** the evidence line has two spaces where the line of the file has one space
- **THEN** the check returns the declaration

#### Scenario: The file has CRLF line ends
- **WHEN** the lines of the current file end with a carriage return and a line feed, and the evidence line is the text of one of them with no carriage return
- **THEN** the check returns the declaration

#### Scenario: A review focus agent and the judge declared the discussion
- **WHEN** an agent for a review focus and the judge both declared `d1` fixed, a line of the current file has the anchor of `d1`, and the evidence line of the judge is valid
- **THEN** the check drops the declaration of the agent with the reason `anchor_still_present`

#### Scenario: The findings file has no evidence line
- **WHEN** the review accepts a declaration by its evidence line and writes the findings file
- **THEN** no entry in the file has a field for the evidence line

## MODIFIED Requirements

### Requirement: Accept a fixed declaration only after the checks
The system SHALL accept a declaration only when the discussion exists in the change, this tool started it, it is not resolved, it has an anchor, and no finding in the same output links to it. The system SHALL also require that one of two conditions is true. The first condition is that no line in the current version of its file has the anchor. The second condition is that the requirement "Accept a judged declaration by its evidence line" accepts the declaration. The system SHALL drop any other declaration and write one `warn` log line with the reason.

#### Scenario: All checks pass
- **WHEN** a declaration names an open discussion from this tool, and no line in the current file has the discussion's anchor
- **THEN** the system returns the declaration

#### Scenario: Discussion was started by a person
- **WHEN** a declaration names a discussion that a person started
- **THEN** the system drops the declaration and logs the reason

#### Scenario: The anchored line is still in the file
- **WHEN** a declaration of an agent for a review focus names a discussion whose anchor matches a line in the current version of the file
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

#### Scenario: A judged declaration has an evidence line and the file cannot be read
- **WHEN** the judge gives `fixed` with an evidence line, and the system cannot read the current content of the file that the change does not delete
- **THEN** the system drops the declaration and logs the reason `file_unreadable`

### Requirement: Turn a fixed judgment into a fixed declaration
The system SHALL turn each `fixed` judgment into one fixed declaration with the discussion ID and the reason of the judgment. The system MUST NOT turn a `not_fixed` or an `uncertain` judgment into a declaration. The system SHALL merge these declarations with the declarations of the review focus agents. For each discussion ID the merge SHALL keep the first declaration, and the declarations of the review focus agents come first. The merged declarations MUST go through the check in "Accept a fixed declaration only after the checks". The system SHALL give the evidence line of a `fixed` judgment to that check. It MUST do this only for a declaration that the merge kept from the judge. The system MUST NOT resolve a discussion with a judgment alone.

#### Scenario: A fixed judgment on a deleted file
- **WHEN** the judge gives `fixed` for a discussion from this tool on a file that the change deletes
- **THEN** the check accepts the declaration without a file read, as for a declaration of an agent for a review focus

#### Scenario: A fixed judgment becomes a declaration
- **WHEN** the judge gives the judgment `fixed` with the reason "Line 41 now calls `hide()` after the navigation." for discussion `d1`
- **THEN** the system adds one declaration for `d1` with that reason, before the check on declarations

#### Scenario: A not-fixed judgment gives no declaration
- **WHEN** the judge gives the judgment `not_fixed` for `d2`
- **THEN** the system adds no declaration for `d2`

#### Scenario: An uncertain judgment gives no declaration
- **WHEN** the judge gives the judgment `uncertain` for `d3`
- **THEN** the system adds no declaration for `d3`

#### Scenario: A review focus agent already declared the discussion
- **WHEN** an agent for a review focus declared `d1` fixed, and the judge also gives `fixed` for `d1`
- **THEN** the merged declarations have one declaration for `d1`, with the reason from the agent for the review focus

#### Scenario: The anchored line is still in the file
- **WHEN** the judge gives `fixed` for `d1` with no evidence line, and a line in the current file still has the anchor of `d1`
- **THEN** the check drops the declaration with the reason `anchor_still_present`, and the system does not resolve `d1`
