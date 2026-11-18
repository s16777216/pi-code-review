## ADDED Requirements

### Requirement: Do not offer fixed declarations to the review agent
The `submit_review` tool MUST NOT have a field for declarations of fixed discussions. The system prompt of the review agents MUST NOT tell the agent to declare a discussion fixed. The system SHALL ignore a `resolved` field in a `submit_review` call and SHALL NOT reject the call for it. The discussion judgment step is the only source of fixed declarations.

#### Scenario: The tool has no declaration field
- **WHEN** the system builds the `submit_review` tool
- **THEN** the tool parameters have a `findings` field and no field for declarations

#### Scenario: The prompt does not offer declarations
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt does not tell the agent to declare a discussion fixed

#### Scenario: A resolved field in a call is ignored
- **WHEN** the agent calls `submit_review` with one valid finding and a `resolved` array that has one item
- **THEN** the system accepts the finding and returns no declaration

#### Scenario: The judge is the only source
- **WHEN** the review ends and the judge gave `fixed` for `d1`
- **THEN** the review result has a declaration only for `d1`, and no declaration comes from a review agent

### Requirement: Run the checks in order on the merged output
The system SHALL merge the outputs of all agents before it runs the checks on `relatesTo`, the diff line check, the anchor, the deduplication step, the verification step, the discussion judgment step, and the fixed declarations, in this order. The merge SHALL keep the findings in the order of the run scopes, and in each run scope in the order of the review focuses. In the check on fixed declarations, "the same output" MUST mean the merged output of the review.

#### Scenario: Order of the merged findings
- **WHEN** a run scope has findings from the agent for security and from the agent for logic correctness
- **THEN** the merged findings list the findings of the agent for logic correctness first

#### Scenario: The discussion judgment step runs after the verification step
- **WHEN** the verification step drops the only finding that has `relatesTo` equal to `d1`
- **THEN** the discussion judgment step selects `d1`, and the check on fixed declarations runs after the discussion judgment step

#### Scenario: A finding in another batch links to the discussion
- **WHEN** batch 2 has a finding with `relatesTo` equal to `d1`, and the judge gave `fixed` for `d1`
- **THEN** the system drops the declaration of `d1` and logs the reason

### Requirement: Select and judge the open discussions
The system SHALL run the discussion judgment step after the verification step and before the check on fixed declarations. The step MUST select a discussion only when all of these are true. This tool started the discussion. It is not resolved. It has an anchor and a file. No finding that remains after the verification step has `relatesTo` equal to it. The system SHALL start one judge run for each file that has at least one selected discussion. The judge SHALL give each selected discussion of that file one judgment: `fixed`, `not_fixed`, or `uncertain`. The system MUST NOT call the model for this step when no discussion is selected.

#### Scenario: Selected discussions are judged by file
- **WHEN** two open discussions from this tool are on `src/a.ts` and one is on `src/b.ts`, and no finding links to them
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
- **WHEN** a finding that remains after the verification step has `relatesTo` equal to `d1`
- **THEN** the system does not select `d1`

#### Scenario: The verification step removes the linking finding
- **WHEN** the verification step drops the only finding that has `relatesTo` equal to `d1`
- **THEN** the system selects `d1`

#### Scenario: No discussion is selected
- **WHEN** no discussion meets the selection rules
- **THEN** the system does not call the model for the discussion judgment step

#### Scenario: The discussions cannot be listed
- **WHEN** the list of discussions is not available
- **THEN** the system does not call the model for the discussion judgment step

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

## REMOVED Requirements
### Requirement: Declare fixed discussions
**Reason**: A review agent no longer declares fixed discussions. The discussion judgment step is the only source of declarations.
**Migration**: The scenario "Output object has no findings array" is covered by the scenario "Agent output does not parse" of "Produce structured findings". The other scenarios of this requirement have no replacement.

### Requirement: Run the checks once on the merged output
**Reason**: The requirement text and scenarios describe the merge of agent declarations. The new requirement "Run the checks in order on the merged output" has the same rules for the judge, with no agent declarations.
**Migration**: Use "Run the checks in order on the merged output".

### Requirement: Judge open discussions with the discussion judgment step
**Reason**: The requirement text and scenarios describe the merge of agent declarations. The new requirement "Select and judge the open discussions" has the same rules for the judge, with no agent declarations.
**Migration**: Use "Select and judge the open discussions".

### Requirement: Turn a fixed judgment into a fixed declaration
**Reason**: The requirement text and scenarios describe the merge of agent declarations. The new requirement "Turn a fixed judgment into a declaration" has the same rules for the judge, with no agent declarations.
**Migration**: Use "Turn a fixed judgment into a declaration".

## MODIFIED Requirements

### Requirement: Produce structured findings
The system SHALL accept the agent's findings only through a `submit_review` tool call that the agent makes when it finishes reviewing. Each finding MUST have a file path, a line number, a severity, and a one-sentence summary. When one finding in a `submit_review` call is invalid, the system MUST reject the whole call and MUST NOT keep any finding from that call.

#### Scenario: Agent output parses into findings
- **WHEN** the agent calls `submit_review` with zero or more findings, each with a file, a line, a severity, and a summary
- **THEN** the system accepts the call and returns those findings

#### Scenario: Agent output does not parse
- **WHEN** the agent's `submit_review` call does not match the tool's required argument shape
- **THEN** the system reports a review failure instead of returning findings

#### Scenario: Agent output is not a list
- **WHEN** the agent's `submit_review` call has a `findings` value that is not an array
- **THEN** the system reports a review failure instead of returning findings

#### Scenario: One finding is invalid
- **WHEN** the agent calls `submit_review` with two valid findings and one finding that has an invalid severity
- **THEN** the system rejects the call and keeps none of the three findings

#### Scenario: A dropped finding is logged
- **WHEN** the system rejects a `submit_review` call
- **THEN** the system writes one `warn` log line that names each invalid finding in that call

#### Scenario: Agent corrects a rejected call
- **WHEN** the agent calls `submit_review` again in the same run after a rejected call, and every finding of the new call is valid
- **THEN** the system accepts the new call's findings as the run's output

### Requirement: Limit submit_review attempts in one run
The system SHALL accept at most 5 `submit_review` calls in one run. After the limit, the system SHALL end the run without accepting any call.

#### Scenario: Agent exhausts the attempt limit
- **WHEN** the agent calls `submit_review` with an invalid finding on 5 calls in one run
- **THEN** the system stops accepting further calls in that run, and the run ends without an accepted submission

### Requirement: Accept a fixed declaration only after the checks
The system SHALL accept a declaration of the judge only when the discussion exists in the change, this tool started it, it is not resolved, it has an anchor, and no finding in the same output links to it. The system SHALL also require that one of two conditions is true. The first condition is that no line in the current version of its file has the anchor. The second condition is that the requirement "Accept a judged declaration by its evidence line" accepts the declaration. The system SHALL drop any other declaration and write one `warn` log line with the reason.

#### Scenario: All checks pass
- **WHEN** a declaration names an open discussion from this tool, and no line in the current file has the discussion's anchor
- **THEN** the system returns the declaration

#### Scenario: Discussion was started by a person
- **WHEN** a declaration names a discussion that a person started
- **THEN** the system drops the declaration and logs the reason

#### Scenario: The anchored line is still in the file
- **WHEN** a declaration names a discussion whose anchor matches a line in the current version of the file, and the judgment has no valid evidence line
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

### Requirement: Accept a judged declaration by its evidence line
This requirement applies to a declaration that came from a `fixed` judgment of the judge. It applies only when a line of the current file has the anchor of the discussion. The system SHALL accept such a declaration if its evidence line is valid. To normalize a text, the system trims it, replaces each run of white space by one space, and removes `;` and `,` at its end. An evidence line is valid when all of these are true. The evidence line has no line feed. The string length of the normalized evidence line is at least 8. After normalizing both texts, a whole line of the current file has the same text as the evidence line. At least one such line has another anchor than the discussion. The system SHALL drop such a declaration when its evidence line is not valid. The reason is `evidence_not_valid` when the judgment has an evidence line. The reason is `anchor_still_present` when the judgment has no evidence line. The `warn` log line for `evidence_not_valid` MUST have the field `evidence` with the text. It MUST also have the field `source` with the value `discussion_judgment`. It MUST also have the field `problem` with the first rule that failed, in this order: `multiple_lines`, `too_short`, `is_anchored_line`, or `not_in_file`. The system SHALL write one `info` log line for each declaration that this requirement accepts. The line has the discussion ID, the file, and the evidence line. The system MUST NOT record the evidence line in the findings file.

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

#### Scenario: The findings file has no evidence line
- **WHEN** the review accepts a declaration by its evidence line and writes the findings file
- **THEN** no entry in the file has a field for the evidence line
