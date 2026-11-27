## MODIFIED Requirements

### Requirement: Provide a file-content tool to the agent
The system SHALL give the AI agent a tool that returns the full content of a named changed file, backed by `ReviewContext.getFileContent`, so the agent can read code outside the diff hunks. The tool SHALL put the line number of the new version of the file and the separator `|` in front of each line of the content. The tool MUST return at most 100,000 characters for one call. The tool MUST answer at most 30 calls in one review.

#### Scenario: Agent reads a file outside the diff hunks
- **WHEN** the agent calls the file-content tool with a path from the review context's changed files
- **THEN** the tool returns the content that `ReviewContext.getFileContent` returns for that path, with the line number and `|` in front of each line

#### Scenario: Line numbers match the diff
- **WHEN** the agent reads a file with the file-content tool, and line 42 of the file is an added line in the diff
- **THEN** the tool shows the text of that added line after the number 42

#### Scenario: Agent requests a file outside the review context
- **WHEN** the agent calls the file-content tool with a path that is not in the review context's changed files
- **THEN** the tool returns an error result instead of file content

#### Scenario: Agent reads a file longer than the limit
- **WHEN** the agent calls the file-content tool for a file whose numbered content has 250,000 characters
- **THEN** the tool returns the first 100,000 characters, followed by a line that says the content was cut and gives the full length

#### Scenario: Agent exceeds the call limit
- **WHEN** the agent makes a 31st call to the file-content tool in one review
- **THEN** the tool returns an error result that tells the agent to finish with the information it has, and does not call `ReviewContext.getFileContent`

### Requirement: Produce structured findings
The system SHALL accept the agent's findings only through a `submit_review` tool call that the agent makes when it finishes reviewing. Each finding MUST have a file path, a line number, a severity, and a one-sentence summary. A finding can also have an end line. The end line MUST be an integer that is equal to or greater than the line. A finding with an end line covers the continuous range from its line to its end line. A finding without an end line covers its line only. When one finding in a `submit_review` call is invalid, the system MUST reject the whole call and MUST NOT keep any finding from that call.

#### Scenario: Agent output parses into findings
- **WHEN** the agent calls `submit_review` with zero or more findings, each with a file, a line, a severity, and a summary
- **THEN** the system accepts the call and returns those findings

#### Scenario: A finding has an end line
- **WHEN** the agent calls `submit_review` with a finding that has the line 562 and the end line 600
- **THEN** the system accepts the call and returns the finding with the line 562 and the end line 600

#### Scenario: An end line before the line
- **WHEN** the agent calls `submit_review` with a finding that has the line 30 and the end line 20
- **THEN** the system rejects the call and keeps no finding from that call

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

### Requirement: Validate findings against the diff
The system SHALL discard a finding whose file is not in the review context's changed files, or whose range has no line that is a visible line in that file's diff. A visible line is an added line or a context line. The range of a finding can contain lines that are not in the diff. The system SHALL write one `warn` log line for each discarded finding.

#### Scenario: Finding references an unchanged file
- **WHEN** a finding's file path is not one of the review context's changed files
- **THEN** the system discards the finding and does not return it

#### Scenario: Finding references a line not in the diff
- **WHEN** a finding has no end line, and its line number does not appear as an added or context line in that file's diff
- **THEN** the system discards the finding and does not return it

#### Scenario: A range that starts in the diff and ends outside it
- **WHEN** a finding has the line 562 and the end line 600, the diff shows the lines 553 to 568, and the lines 569 to 600 are not in the diff
- **THEN** the system keeps the finding with its line and its end line

#### Scenario: A range with no line in the diff
- **WHEN** a finding has the line 574 and the end line 600, and no line from 574 to 600 is an added or context line in the diff
- **THEN** the system discards the finding and does not return it

#### Scenario: A discarded finding is logged
- **WHEN** the system discards a finding for any reason
- **THEN** the system writes one `warn` log line that contains the finding's file, its line number, its end line when it has one, and the reason

### Requirement: Compute an anchor for each finding
The system SHALL add an `anchor` to each returned finding. The anchor MUST be the first 16 hexadecimal characters of the SHA-256 hash of the file path, a line break, and the text of the anchor line in the new version of the file, with leading and trailing white space removed. The anchor line is the first line of the finding's range that is an added or context line in the diff. For a finding without an end line, the anchor line is the finding's line. The line text MUST come from the diff.

#### Scenario: Same code at a different line
- **WHEN** two findings are on the same file, at lines 42 and 45, and both lines have the text `for (i = 0; i <= n; i++)`
- **THEN** the two findings have the same anchor

#### Scenario: Same line number with different code
- **WHEN** two findings are on the same file and the same line number, and the line text differs between two reviews
- **THEN** the two findings have different anchors

#### Scenario: Indentation changes
- **WHEN** the only difference between two lines is the leading white space
- **THEN** the two findings have the same anchor

#### Scenario: A range that starts outside the diff
- **WHEN** a finding has the line 548 and the end line 560, the lines 548 to 552 are not in the diff, and the line 553 is a context line
- **THEN** the anchor uses the text of the line 553

### Requirement: Keep each batch's findings on its own diff lines
The system SHALL keep a finding from a batch only when its range has at least one added or context line in that batch's own diff items. The system SHALL drop any other finding from that batch and write one `warn` log line with the reason `outside_batch`.

#### Scenario: Finding on the batch's own line
- **WHEN** a batch reports a finding on an added line of one of its files
- **THEN** the system keeps the finding

#### Scenario: Finding on another batch's file
- **WHEN** a batch reports a finding on a file that is in a different batch
- **THEN** the system drops the finding and logs the reason `outside_batch`

#### Scenario: Finding on another part of the same file
- **WHEN** a batch has part 1 of a file and reports a finding whose range has lines only in part 2 and lines outside the diff
- **THEN** the system drops the finding and logs the reason `outside_batch`

#### Scenario: A range that reaches past the batch
- **WHEN** a batch has part 1 of a file, and reports a finding whose range starts on an added line of part 1 and ends on a line of part 2
- **THEN** the system keeps the finding

### Requirement: Tell the agent which line to report
The system prompt of each review agent SHALL tell the agent to report, in the `line` and the `endLine` of a finding, the continuous range of lines that holds the problem. It SHALL tell the agent to leave out `endLine` when the problem is on one line. It SHALL tell the agent that the range must contain at least one line that has a number in the diff, and that the range can continue into lines that are not in the diff. It SHALL tell the agent that the file-content tool shows the line numbers of the lines that are not in the diff. It SHALL tell the agent that, when the problem is in lines that the diff adds or changes, the range is in that run of added or changed lines and does not include a context line outside it. It SHALL tell the agent not to start the range at the line that opens the function, the block, or the call around the problem, unless that line holds the problem. The system MUST NOT check this rule in code.

#### Scenario: The prompt names the line of the problem
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent to report the range of lines that holds the problem in `line` and `endLine`, and to leave out `endLine` for a problem on one line

#### Scenario: The prompt allows an unchanged line for unchanged code
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent that the range must contain at least one line with a number in the diff, and that it can continue into lines that are not in the diff

#### Scenario: The prompt keeps a changed problem inside the changed lines
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent that a problem in added or changed lines gets a range in that run of lines and not a context line outside it

#### Scenario: The prompt excludes the line that opens the block
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent not to start the range at the line that opens the function, the block, or the call around the problem, unless that line holds the problem

#### Scenario: A finding on any line of the diff is still valid
- **WHEN** a finding has a range that contains a line of the diff, but the range does not hold the problem
- **THEN** the system keeps the finding, as before this requirement

### Requirement: Deduplicate findings with the deduplication step
The system SHALL run the deduplication step on the merged findings that pass the checks on `relatesTo` and the diff line check, and before the check on the fixed declarations. The system SHALL call the model once for the step, and only when at least one file has two or more findings. The system MUST NOT call the model for the step in any other case. The system MUST send only the findings of files that have two or more findings. The model MUST see only the file, the line, the end line when the finding has one, the severity, and the summary of each finding that it gets. The model MUST return only groups of finding numbers, with no other text. A group is valid when all its findings are in the same file. The result is valid when each sent finding number is in exactly one group. The system SHALL reject a result that is not valid and SHALL tell the model the reason. The system SHALL keep the merged findings as they were before the step, and SHALL record a warning, when the call fails, or gives no valid result, on its last try. The review MUST NOT fail because the deduplication step fails. The system MUST NOT change the findings when the step is not called.

#### Scenario: No file has two findings
- **WHEN** the merged findings are in 3 different files, one finding in each file
- **THEN** the system does not call the model for the deduplication step

#### Scenario: A file has two findings
- **WHEN** the merged findings hold two findings in `src/a.ts`
- **THEN** the system calls the model once for the deduplication step

#### Scenario: The model sees only four fields
- **WHEN** the system builds the input of the deduplication step
- **THEN** the input holds, for each finding, its number, file, line, severity, and summary, and holds no `relatesTo`, no anchor, and no diff text

#### Scenario: The model sees the end line
- **WHEN** the system builds the input of the deduplication step, and a finding has an end line
- **THEN** the input holds the end line of that finding

#### Scenario: Findings of single files are not sent
- **WHEN** the merged findings hold two findings in `src/a.ts` and one finding in `src/b.ts`
- **THEN** the input of the deduplication step holds the two findings of `src/a.ts` and not the finding of `src/b.ts`

#### Scenario: A group has findings of two files
- **WHEN** the model returns a group that holds a finding in `src/a.ts` and a finding in `src/b.ts` on each of its tries
- **THEN** the system keeps the merged findings as they were, records a warning, and does not fail the review

#### Scenario: A finding number is missing or repeated
- **WHEN** the model returns groups in which one finding number is missing, or one number is in two groups, on each of its tries
- **THEN** the system keeps the merged findings as they were, records a warning, and does not fail the review

#### Scenario: The model corrects a result
- **WHEN** the model returns a result that is not valid, and then a valid result in the same run
- **THEN** the system uses the valid result

#### Scenario: The call fails
- **WHEN** the call for the deduplication step fails on its third try
- **THEN** the system keeps the merged findings as they were, writes one `warn` log line that names the deduplication step, records the warning `deduplication_failed`, and the review goes on

## ADDED Requirements

### Requirement: Show the range of a finding to the verifier and the verify agent
When the system gives a finding to a verifier run or to a verify agent run, and the finding has an end line, the system SHALL give the end line of the finding together with its line. The system MUST NOT let the verifier or the verify agent change the line or the end line of a finding.

#### Scenario: The verifier sees the end line
- **WHEN** the system builds the input of a verifier run, and a finding has the line 562 and the end line 600
- **THEN** the input holds the line 562 and the end line 600 for that finding

#### Scenario: The verify agent sees the end line
- **WHEN** the system builds the user prompt of a verify agent run, and a finding has an end line
- **THEN** the finding in the first list has its line and its end line

#### Scenario: A finding keeps its range
- **WHEN** the verifier confirms a finding with the line 562 and the end line 600, and gives it a new severity
- **THEN** the finding keeps the line 562 and the end line 600
