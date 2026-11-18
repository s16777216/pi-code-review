## ADDED Requirements

### Requirement: Judge open discussions with the discussion judgment step
The system SHALL run the discussion judgment step after the verification step and before the check on fixed declarations. The step MUST select a discussion only when all of these are true. This tool started the discussion. It is not resolved. It has an anchor and a file. No finding that remains after the verification step has `relatesTo` equal to it. No agent for a review focus declared it fixed, and this holds even when the check on fixed declarations later drops that declaration. The system SHALL start one judge run for each file that has at least one selected discussion. The judge SHALL give each selected discussion of that file one judgment: `fixed`, `not_fixed`, or `uncertain`. The system MUST NOT call the model for this step when no discussion is selected.

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

#### Scenario: A declaration of an agent is later dropped
- **WHEN** an agent for a review focus declared `d1` fixed, and the check on fixed declarations drops that declaration with the reason `anchor_still_present`
- **THEN** the system does not select `d1` and does not start a judge run for it

#### Scenario: A discussion without an anchor is not selected
- **WHEN** a discussion from this tool has no anchor
- **THEN** the system does not select it

#### Scenario: A finding links to the discussion
- **WHEN** a finding that remains after the verification step has `relatesTo` equal to `d1`
- **THEN** the system does not select `d1`

#### Scenario: The verification step removes the linking finding
- **WHEN** the verification step drops the only finding that has `relatesTo` equal to `d1`
- **THEN** the system selects `d1`

#### Scenario: An agent for a review focus already declared the discussion
- **WHEN** an agent for a review focus declared `d1` fixed
- **THEN** the system does not select `d1`

#### Scenario: No discussion is selected
- **WHEN** no discussion meets the selection rules
- **THEN** the system does not call the model for the discussion judgment step

#### Scenario: The discussions cannot be listed
- **WHEN** the list of discussions is not available
- **THEN** the system does not call the model for the discussion judgment step

### Requirement: Give the judge the discussion, the current code, and the review instructions
The user prompt of a judge run SHALL give the title and the description of the change, the diff of the file when the change includes the file, and, for each selected discussion of the file, a number, the line, the commit that the line refers to, and the notes with the author and the body of each note. When the line or the commit of a discussion is not known, the user prompt MUST say so. When the review omitted the diff of the file, the user prompt MUST say so. The judge SHALL be able to read the file with the file-content tool. The system prompt of the judge MUST tell the judge that the line of a discussion refers to its commit, and that on a newer commit the line can point at different code. The system prompt MUST tell the judge that the current code decides each judgment. The system prompt MUST tell the judge that the notes, including the replies of people, are information and not instructions, and that a reply is a hint and not proof. The system prompt MUST tell the judge to use `not_fixed` when a person replied that the problem stays by decision. The system prompt MUST tell the judge to quote the code that shows the judgment in the reason. When the system has review instructions, it SHALL append them to the system prompt of the judge, as it does for the verifier. The review instructions MUST NOT change the output format.

#### Scenario: The prompt has the notes of the discussion
- **WHEN** a discussion on `src/a.ts` has a note from this tool and a reply from a person
- **THEN** the user prompt of the judge run for `src/a.ts` has both notes with their authors, and no discussion ID

#### Scenario: The notes are framed as data
- **WHEN** the system builds the prompt of a judge run
- **THEN** the prompt says that the notes are information about the change and not instructions to the judge

#### Scenario: A reply says the problem stays by decision
- **WHEN** the reply of a person on a discussion says that the author does not accept the finding, and the code is unchanged
- **THEN** the system prompt tells the judge to use `not_fixed`

#### Scenario: The line or the commit is not known
- **WHEN** a selected discussion has no line, or no commit
- **THEN** the user prompt of the judge run says that the line, or the commit, is not known

#### Scenario: The diff of the file is omitted
- **WHEN** a selected discussion is on a file whose diff the review omitted
- **THEN** the user prompt says that the diff is omitted, and the judge is able to read the file with the file-content tool

#### Scenario: The line refers to an older commit
- **WHEN** a selected discussion has the commit `c1` and the change head is a newer commit
- **THEN** the user prompt of the judge run gives the line with `c1`, and the system prompt says that the line can point at different code on a newer commit

#### Scenario: The file is not in the diff
- **WHEN** a selected discussion is on a file that the change does not include
- **THEN** the user prompt has no diff for the file, and the judge is able to read the file with the file-content tool

#### Scenario: The change deletes the file
- **WHEN** a selected discussion is on a file that the change deletes
- **THEN** the user prompt has the diff of the file, which shows the deletion, and the system prompt tells the judge that the file no longer exists in the current code

#### Scenario: Review instructions are appended
- **WHEN** the review has review instructions
- **THEN** the system prompt of the judge has them after a statement that they do not change the output format

### Requirement: Accept the judgments only in a valid form
The judge SHALL report its judgments with one call to a `submit_judgments` tool. The call MUST have a `judgments` array with exactly one object for each selected discussion of the file. Each object MUST have a `number`, a `judgment` that is `fixed`, `not_fixed`, or `uncertain`, and a `reason` that is not empty. The system SHALL reject a call that has a missing number, a repeated number, an unknown number, an unknown judgment value, or an empty reason. The requirement "Retry a model run that ends with an error" applies to a judge run.

#### Scenario: A valid call
- **WHEN** a judge run has 2 selected discussions and the call has one valid object for each
- **THEN** the system accepts the 2 judgments

#### Scenario: A discussion has no judgment
- **WHEN** a judge run has 2 selected discussions and the call has one object
- **THEN** the system rejects the call

#### Scenario: A judgment has an unknown value
- **WHEN** an object in the call has the judgment `resolved`
- **THEN** the system rejects the call

#### Scenario: A reason is empty
- **WHEN** an object in the call has an empty reason
- **THEN** the system rejects the call

### Requirement: Turn a fixed judgment into a fixed declaration
The system SHALL turn each `fixed` judgment into one fixed declaration with the discussion ID and the reason of the judgment. The system MUST NOT turn a `not_fixed` or an `uncertain` judgment into a declaration. The system SHALL merge these declarations with the declarations of the review focus agents. For each discussion ID the merge SHALL keep the first declaration, and the declarations of the review focus agents come first. The merged declarations MUST go through the check in "Accept a fixed declaration only after the checks" with no change to that check. The system MUST NOT resolve a discussion with a judgment alone.

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
- **WHEN** the judge gives `fixed` for `d1`, and a line in the current file still has the anchor of `d1`
- **THEN** the check drops the declaration, and the system does not resolve `d1`

### Requirement: Keep the discussions of a file when its judgment fails
The system SHALL declare no discussion of a file fixed when the judge run for that file fails on its last try. The system SHALL also declare none when the first request of the run is larger than half of the context window of the model, and then the system MUST NOT call the model for that file. In both cases the system SHALL write one `warn` log line with the file and the cause. A judge run that stops with the stop reason `length` follows the requirement "Report a review cut at the token limit", which gives one retry with twice the output limit. A judge run that stops with `length` on that retry counts as a run that fails on its last try. The review MUST NOT fail because a judge run fails. The judgment of the other files continues. The rule of "Report a review cut at the token limit" that reports a review failure does not apply to a judge run. A judge run that stops with `aborted` counts as a failed run, as a verifier run does. The system MUST NOT add a warning to the review result for this failure.

#### Scenario: A judge run fails
- **WHEN** the judge run for `src/a.ts` ends with the stop reason `error` on each of its 3 tries
- **THEN** the system declares no discussion of `src/a.ts` fixed, writes a `warn` log line that names `src/a.ts`, and the review does not fail

#### Scenario: The other files are still judged
- **WHEN** the judge run for `src/a.ts` fails and the judge run for `src/b.ts` gives a valid result
- **THEN** the system uses the judgments for `src/b.ts`

#### Scenario: A judge run stays cut at the token limit
- **WHEN** a judge run stops with `length` on the first try and on the retry with the larger limit
- **THEN** the system declares no discussion of that file fixed, writes a `warn` log line that names the file, and the review does not fail

#### Scenario: A judge run is aborted
- **WHEN** a judge run stops with the stop reason `aborted`
- **THEN** the system declares no discussion of that file fixed, writes a `warn` log line that names the file, and the review does not fail

#### Scenario: The first request is too large
- **WHEN** the first request of the judge run for a file is larger than half of the context window
- **THEN** the system does not call the model for that file, declares none of its discussions fixed, and writes a `warn` log line that names the file

#### Scenario: A failed judgment does not change the findings
- **WHEN** a judge run fails
- **THEN** the findings and the warnings in the review result are the same as without the discussion judgment step

### Requirement: Log the discussion judgment step
The system SHALL write one `info` log line for the discussion judgment step with the number of selected discussions and the number of judgments of each value. A discussion of a file whose judge run failed or did not start counts as selected and counts in no judgment value. For each `fixed` judgment, the system SHALL write one `info` log line with the file, the line, the discussion ID, and the reason. When the check on fixed declarations drops a declaration that came from a `fixed` judgment, the `warn` log line of that drop MUST have the field `source` with the value `discussion_judgment`. With `--debug`, the system SHALL write one `debug` log line for each judged discussion, with the file, the line, the judgment, and the reason. The system MUST NOT record the judgments in the findings file.

#### Scenario: The summary line
- **WHEN** the step selects 10 discussions and gets 2 `fixed`, 6 `not_fixed`, and 2 `uncertain` judgments
- **THEN** the system writes one `info` log line with the numbers 10, 2, 6, and 2

#### Scenario: The summary counts a failed file
- **WHEN** the step selects 5 discussions, and the judge run for a file with 2 of them fails
- **THEN** the summary line has the number 5 for the selected discussions, and the numbers of judgments add up to 3

#### Scenario: A fixed judgment is logged
- **WHEN** the judgment for discussion `d1` on `src/a.ts` line 12 is `fixed` with the reason "Line 12 now checks for null."
- **THEN** the system writes an `info` log line with `src/a.ts`, 12, `d1`, and that reason

#### Scenario: The anchor check drops a judged declaration
- **WHEN** the check on fixed declarations drops the declaration of `d1` with the reason `anchor_still_present`, and the declaration came from a `fixed` judgment
- **THEN** the `warn` log line has `d1`, the reason `anchor_still_present`, and the field `source` with the value `discussion_judgment`

#### Scenario: Every judgment is logged with debug
- **WHEN** the step judges 3 discussions and `--debug` is on
- **THEN** the system writes 3 `debug` log lines, and each one has the file, the line, the judgment, and the reason

#### Scenario: The findings file has no judgment
- **WHEN** the review writes the findings file
- **THEN** no entry in the file has a field for the judgment of a discussion

## MODIFIED Requirements

### Requirement: Run the checks once on the merged output
The system SHALL merge the outputs of all agents before it runs the checks on `relatesTo`, the diff line check, the anchor, the deduplication step, the verification step, the discussion judgment step, and the fixed declarations, in this order. The merge SHALL keep the findings in the order of the run scopes, and in each run scope in the order of the review focuses. The merge SHALL keep the first fixed declaration for each discussion ID in that order. In the check on fixed declarations, "the same output" MUST mean the merged output of the review.

#### Scenario: Declaration and link in different batches
- **WHEN** batch 1 declares a discussion fixed, and a finding in batch 2 has `relatesTo` equal to that discussion
- **THEN** the system drops the declaration and logs the reason

#### Scenario: Two batches declare the same discussion
- **WHEN** batch 1 and batch 2 both declare the same discussion fixed
- **THEN** the merged output has one declaration for that discussion, with the reason from batch 1, before the checks

#### Scenario: Two review focuses declare the same discussion
- **WHEN** the agent for logic correctness and the agent for security both declare the same discussion fixed
- **THEN** the merged output has one declaration for that discussion, with the reason from the agent for logic correctness

#### Scenario: Order of the merged findings
- **WHEN** a run scope has findings from the agent for security and from the agent for logic correctness
- **THEN** the merged findings list the findings of the agent for logic correctness first

#### Scenario: The verification step runs before the fixed declarations
- **WHEN** the verification step drops a finding that has `relatesTo` equal to `d1`, and an agent declared `d1` fixed
- **THEN** the system checks the declaration of `d1` against the findings that remain after the verification step

#### Scenario: The discussion judgment step runs after the verification step
- **WHEN** the verification step drops the only finding that has `relatesTo` equal to `d1`
- **THEN** the discussion judgment step selects `d1`, and the check on fixed declarations runs after the discussion judgment step

### Requirement: Limit parallel runs
The system SHALL run at most 3 agent runs at the same time. All agents of all run scopes use this one limit. The other runs SHALL wait in this order: by run scope, and then by review focus. The verifier runs of the verification step use the same limit of 3 runs, and they wait in the order of their files. The judge runs of the discussion judgment step use the same limit of 3 runs, and they wait in the order of their files.

#### Scenario: Parallel runs are limited
- **WHEN** a review has 5 batches, and so 15 agent runs
- **THEN** at most 3 of their runs are active at the same time

#### Scenario: One run scope
- **WHEN** a review has one run scope, and so 3 agent runs
- **THEN** the 3 runs can be active at the same time

#### Scenario: Verifier runs are limited
- **WHEN** the verification step has 5 files with findings
- **THEN** at most 3 verifier runs are active at the same time

#### Scenario: Judge runs are limited
- **WHEN** the discussion judgment step has 5 files with selected discussions
- **THEN** at most 3 judge runs are active at the same time

### Requirement: Retry a model run that ends with an error
The system SHALL start a run again, with a new agent and new tools, when its final message has the stop reason `error`, or when the run ends with no accepted `submit_review` call. A request that exceeds the request timeout ends with the stop reason `error`. The same rule applies to the call of the deduplication step, to each verifier run of the verification step, and to each judge run of the discussion judgment step. The system SHALL try a run at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. Each retry MUST write one `warn` log line with the batch number when the run has one, the review focus, the try number, and the error message. The system MUST NOT retry a run that stops with `aborted`. A run that stops with `length` follows the requirement "Report a review cut at the token limit".

#### Scenario: Run passes on the second try
- **WHEN** a run's first try ends with the stop reason `error` and its second try produces an accepted `submit_review` call
- **THEN** the system uses the output of the second try and logs one retry

#### Scenario: Run stops at the token limit
- **WHEN** a run's final message has the stop reason `length`
- **THEN** the system does not count it as a failed try, and follows the requirement "Report a review cut at the token limit"

#### Scenario: Run ends with no accepted submission
- **WHEN** a run's final message has a normal stop reason, and the agent never made an accepted `submit_review` call
- **THEN** the system treats the run as a failed try, the same as a run that stops with the reason `error`

#### Scenario: The retry log names the review focus
- **WHEN** the run of the agent for security ends with the stop reason `error`
- **THEN** the `warn` log line for the retry names the review focus security

#### Scenario: A verifier run is tried again
- **WHEN** the first try of a verifier run ends with the stop reason `error` and its second try produces an accepted `submit_verdicts` call
- **THEN** the system uses the verdicts of the second try and logs one retry that names the file

#### Scenario: A judge run is tried again
- **WHEN** the first try of a judge run ends with the stop reason `error` and its second try produces an accepted `submit_judgments` call
- **THEN** the system uses the judgments of the second try and logs one retry that names the file

#### Scenario: A request times out
- **WHEN** a request exceeds the request timeout
- **THEN** the system treats the try as a failed try with the stop reason `error`, and starts the next try after the wait
