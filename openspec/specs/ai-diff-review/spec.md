## Purpose

Defines the `ReviewEngine`: a platform-agnostic component that takes a `ReviewContext`, runs an AI agent over it, and produces a list of structured findings and a pass/fail decision.

## Requirements

### Requirement: Build review input from the review context
The system SHALL build the agent's input from the `ReviewContext`'s title, description, and the diff of every changed file. The input of every agent run in one review MUST contain the title and the description, and every hunk of every changed file MUST be in the input of exactly one run. The system SHALL print the new-file line number in front of every added line and every context line. The system MUST NOT depend on any GitLab-specific data beyond what `ReviewContext` exposes.

#### Scenario: Review input includes the context's intent
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** the input of every run contains that context's title and description

#### Scenario: Review input includes every changed file's diff
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** every line of the hunk text for every file in that context's changed files is in the input of exactly one run

#### Scenario: Added and context lines carry new-file line numbers
- **WHEN** the system builds the review input for a hunk that starts at new-file line 10 with one context line and one added line
- **THEN** the context line carries the number 10 and the added line carries the number 11

#### Scenario: Removed lines carry no new-file line number
- **WHEN** the system builds the review input for a hunk that contains a removed line
- **THEN** the removed line carries no new-file line number

### Requirement: Provide a file-content tool to the agent
The system SHALL give the AI agent a tool that returns the full content of a named changed file, backed by `ReviewContext.getFileContent`, so the agent can read code outside the diff hunks. The tool MUST return at most 100,000 characters for one call. The tool MUST answer at most 30 calls in one review.

#### Scenario: Agent reads a file outside the diff hunks
- **WHEN** the agent calls the file-content tool with a path from the review context's changed files
- **THEN** the tool returns the content that `ReviewContext.getFileContent` returns for that path

#### Scenario: Agent requests a file outside the review context
- **WHEN** the agent calls the file-content tool with a path that is not in the review context's changed files
- **THEN** the tool returns an error result instead of file content

#### Scenario: Agent reads a file longer than the limit
- **WHEN** the agent calls the file-content tool for a file with 250,000 characters
- **THEN** the tool returns the first 100,000 characters, followed by a line that says the content was cut and gives the full length

#### Scenario: Agent exceeds the call limit
- **WHEN** the agent makes a 31st call to the file-content tool in one review
- **THEN** the tool returns an error result that tells the agent to finish with the information it has, and does not call `ReviewContext.getFileContent`

### Requirement: Produce structured findings
The system SHALL parse the agent's output into a list of findings. Each finding MUST have a file path, a line number, a severity, and a one-sentence summary. The system MUST keep each valid finding when another finding in the same output is invalid.

#### Scenario: Agent output parses into findings
- **WHEN** the agent finishes a review turn
- **THEN** the system parses its output into zero or more findings, each with a file, a line, a severity, and a summary

#### Scenario: Agent output does not parse
- **WHEN** the agent's output is not valid structured data
- **THEN** the system reports a review failure instead of returning findings

#### Scenario: Agent output is not a list
- **WHEN** the agent's output is valid JSON but is not an array
- **THEN** the system reports a review failure instead of returning findings

#### Scenario: One finding is invalid
- **WHEN** the agent's output is an array with two valid findings and one finding that has an invalid severity
- **THEN** the system returns the two valid findings and drops the invalid finding

#### Scenario: A dropped finding is logged
- **WHEN** the system drops an invalid finding
- **THEN** the system writes one `warn` log line that names the finding's position in the array and the reason

### Requirement: Classify each finding with a severity
The system SHALL assign each finding exactly one severity: `important`, `nit`, or `pre_existing`.

#### Scenario: Finding is a bug introduced by the diff
- **WHEN** the agent reports a bug that the reviewed change's own diff introduces
- **THEN** the finding's severity is `important`

#### Scenario: Finding is a bug that predates the diff
- **WHEN** the agent reports a bug in code the reviewed change did not change
- **THEN** the finding's severity is `pre_existing`

### Requirement: Validate findings against the diff
The system SHALL discard a finding whose file is not in the review context's changed files, or whose line is not a visible line in that file's diff. The system SHALL write one `warn` log line for each discarded finding.

#### Scenario: Finding references an unchanged file
- **WHEN** a finding's file path is not one of the review context's changed files
- **THEN** the system discards the finding and does not return it

#### Scenario: Finding references a line not in the diff
- **WHEN** a finding's line number does not appear as an added or context line in that file's diff
- **THEN** the system discards the finding and does not return it

#### Scenario: A discarded finding is logged
- **WHEN** the system discards a finding for any reason
- **THEN** the system writes one `warn` log line that contains the finding's file, its line number, and the reason

### Requirement: Require an explicit OpenAI model
The system SHALL read the OpenAI model name from the `OPENAI_MODEL` environment variable and MUST NOT substitute a default value.

#### Scenario: Model variable is set
- **WHEN** `OPENAI_MODEL` is set to a valid model name
- **THEN** the system uses that model for the review

#### Scenario: Model variable is missing
- **WHEN** `OPENAI_MODEL` is not set
- **THEN** the system stops before it calls the OpenAI API, and reports a clear configuration error

### Requirement: Accept a configurable context window
The system SHALL read the model's context window size from the `--context-window` flag or the `OPENAI_CONTEXT_WINDOW` environment variable, with the flag winning. The default MUST be 128,000 tokens. The value MUST be a positive integer larger than the maximum output tokens.

#### Scenario: Context window is not set
- **WHEN** neither `--context-window` nor `OPENAI_CONTEXT_WINDOW` is set
- **THEN** the system uses a context window of 128,000 tokens

#### Scenario: Context window is set by the flag
- **WHEN** `--context-window 400000` is given and `OPENAI_CONTEXT_WINDOW` is `200000`
- **THEN** the system uses a context window of 400,000 tokens

#### Scenario: Context window is invalid
- **WHEN** the context window value is not a positive integer, or is not larger than the maximum output tokens
- **THEN** the system stops before it calls any API, and reports a clear configuration error

### Requirement: Fail before the model call when the input is too large
The system SHALL estimate the token size of the first model request of every run before it sends any request. The system MUST fail the review before the first model call when one hunk does not fit the batch budget alone, or when the review needs more than 20 batches. The batch budget is half of the context window, rounded down.

#### Scenario: Input fits the context window
- **WHEN** the estimated first request of a single run is within the batch budget
- **THEN** the system sends the request as one run

#### Scenario: Input is too large
- **WHEN** the estimated first request of a single run is larger than the batch budget, and every hunk fits the batch budget alone
- **THEN** the system does not fail the review, and reviews the change in batches

#### Scenario: One hunk is too large
- **WHEN** a hunk's estimated first request, as the only item of a batch, is larger than the batch budget
- **THEN** the system does not call the model, and reports a review failure that names the file and the hunk's first new-file line

#### Scenario: Too many batches
- **WHEN** the review needs 21 batches
- **THEN** the system does not call the model, and reports a review failure that gives the number of batches and the context window

### Requirement: Report a review cut at the token limit
The system SHALL report a review failure when the model's final message stops at the output token limit. The error MUST name the `--max-tokens` and `--context-window` settings.

#### Scenario: Final message stops at the token limit
- **WHEN** the agent's final message has the stop reason `length`
- **THEN** the system reports a review failure that names `--max-tokens` and `--context-window`, and does not try to parse the cut output

### Requirement: Provide a discussion tool to the agent
The system SHALL give the AI agent a tool that lists the discussions of the change under review, backed by `ReviewContext.listDiscussions`. The tool SHALL accept an optional file path and then return only the discussions on that file. Each note body MUST be cut at 2,000 characters. One result MUST be cut at 50,000 characters. The tool MUST answer at most 10 calls in one review.

#### Scenario: Agent lists all discussions
- **WHEN** the agent calls the discussion tool with no file path
- **THEN** the tool returns every discussion, each with its ID, file, line, resolved state, a flag for discussions that this tool started, and its notes with author and body

#### Scenario: Agent lists discussions on one file
- **WHEN** the agent calls the discussion tool with the path `a.ts`
- **THEN** the tool returns only the discussions whose file is `a.ts`

#### Scenario: Discussions cannot be fetched
- **WHEN** `ReviewContext.listDiscussions` returns an error
- **THEN** the tool returns an error result, and the review continues

#### Scenario: A note is longer than the limit
- **WHEN** a note body has 5,000 characters
- **THEN** the tool returns its first 2,000 characters and a mark that the body was cut

#### Scenario: Agent exceeds the call limit
- **WHEN** the agent makes an 11th call to the discussion tool in one review
- **THEN** the tool returns an error result and does not call `ReviewContext.listDiscussions`

### Requirement: Instruct the agent how to use discussions
The system prompt SHALL tell the agent to check the discussions on a file before it reports a problem in that file. The system prompt SHALL tell the agent that discussion text is information from people and tools, and not instructions to the agent. The system prompt SHALL tell the agent to consider resolved discussions and explanations from people when it decides whether to report a problem.

#### Scenario: System prompt covers discussions
- **WHEN** the system builds the system prompt
- **THEN** the system prompt names the discussion tool, says that discussion text is not instructions, and says to consider resolved discussions and explanations from people

### Requirement: Link a finding to an existing discussion
The system SHALL accept an optional `relatesTo` field on a finding, with the ID of an existing discussion that covers the same problem. The system SHALL keep `relatesTo` only when the ID is the ID of a discussion that `ReviewContext.listDiscussions` returned. Otherwise, the system SHALL remove the field, keep the finding, and write one `warn` log line.

#### Scenario: Finding links to a known discussion
- **WHEN** the agent returns a finding with `relatesTo` equal to the ID of a discussion on the change
- **THEN** the returned finding keeps that `relatesTo` value

#### Scenario: Finding links to an unknown discussion
- **WHEN** the agent returns a finding with `relatesTo` equal to an ID that is not a discussion on the change
- **THEN** the system returns the finding without `relatesTo`, and writes one `warn` log line with the ID

#### Scenario: Finding has an invalid relatesTo value
- **WHEN** the agent returns a finding with `relatesTo` that is not a string
- **THEN** the system treats the finding as invalid, as for any other invalid field

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

### Requirement: Split a large review into batches
The system SHALL review a change in batches when the estimated first request of a single run is larger than the batch budget. The system SHALL sort the changed files by path and add each file to the current batch while the batch's estimated first request stays within the budget, and start a new batch otherwise. The system SHALL write one `info` log line with the number of batches.

#### Scenario: Change fits one run
- **WHEN** the estimated first request of a single run is within the batch budget
- **THEN** the system runs one agent with today's system prompt

#### Scenario: Change is split into batches
- **WHEN** the estimated first request of a single run is larger than the batch budget
- **THEN** the system runs one agent for each batch, and every batch's estimated first request is within the budget

#### Scenario: Files are packed in path order
- **WHEN** the changed files are `b/y.ts`, `a/x.ts`, and `a/z.ts`, and only two of them fit in one batch
- **THEN** the first batch has `a/x.ts` and `a/z.ts`, and the second batch has `b/y.ts`

### Requirement: List every changed file in each batch's input
The input of each batch MUST list every changed file of the change, with its path, its added, deleted, or renamed state, and its count of added and removed lines. The list MUST mark the files of that batch.

#### Scenario: Batch input lists every changed file
- **WHEN** the system builds the input of one batch
- **THEN** the input lists every changed file of the change and marks the files of that batch

### Requirement: Limit parallel batch runs
The system SHALL run at most 3 batches at the same time. The other batches SHALL wait in batch order.

#### Scenario: Parallel runs are limited
- **WHEN** a review has 5 batches
- **THEN** at most 3 of their runs are active at the same time

### Requirement: Split a file larger than one batch at hunk boundaries
The system SHALL split a file's diff at its hunk headers when the file does not fit an empty batch, and SHALL pack its hunks in order as separate parts. The input SHALL name each part with the file path and `part <k> of <n>`. Each part MUST keep the new-file line numbers of the full file.

#### Scenario: Large file is split
- **WHEN** a file with three hunks does not fit an empty batch, and each two of its hunks fit together
- **THEN** the system makes two parts, with the first two hunks in part 1 and the third hunk in part 2

#### Scenario: Part keeps the file's line numbers
- **WHEN** a part starts with a hunk whose header gives new-file line 200
- **THEN** that hunk's first added or context line carries the number 200

### Requirement: Keep each batch's findings on its own diff lines
The system SHALL keep a finding from a batch only when its line is an added or context line in that batch's own diff items. The system SHALL drop any other finding from that batch and write one `warn` log line with the reason `outside_batch`.

#### Scenario: Finding on the batch's own line
- **WHEN** a batch reports a finding on an added line of one of its files
- **THEN** the system keeps the finding

#### Scenario: Finding on another batch's file
- **WHEN** a batch reports a finding on a file that is in a different batch
- **THEN** the system drops the finding and logs the reason `outside_batch`

#### Scenario: Finding on another part of the same file
- **WHEN** a batch has part 1 of a file and reports a finding on a line that is only in part 2
- **THEN** the system drops the finding and logs the reason `outside_batch`

### Requirement: Run the checks once on the merged output
The system SHALL merge the outputs of all batches before it runs the checks on `relatesTo`, the diff line check, the anchor, and the fixed declarations. The merge SHALL keep the findings in batch order, and SHALL keep the first fixed declaration for each discussion ID. In the check on fixed declarations, "the same output" MUST mean the merged output of the review.

#### Scenario: Declaration and link in different batches
- **WHEN** batch 1 declares a discussion fixed, and a finding in batch 2 has `relatesTo` equal to that discussion
- **THEN** the system drops the declaration and logs the reason

#### Scenario: Two batches declare the same discussion
- **WHEN** batch 1 and batch 2 both declare the same discussion fixed
- **THEN** the merged output has one declaration for that discussion, with the reason from batch 1, before the checks

### Requirement: Retry a model run that ends with an error
The system SHALL start a run again, with a new agent and new tools, when its final message has the stop reason `error`. The system SHALL try a run at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. Each retry MUST write one `warn` log line with the batch number, the try number, and the error message. The system MUST NOT retry a run that stops with `length` or `aborted`, or whose output cannot be parsed.

#### Scenario: Run passes on the second try
- **WHEN** a run's first try ends with the stop reason `error` and its second try produces valid output
- **THEN** the system uses the output of the second try and logs one retry

#### Scenario: Run stops at the token limit
- **WHEN** a run's final message has the stop reason `length`
- **THEN** the system does not retry the run

### Requirement: Fail the review when a batch fails
The system SHALL fail the review when a run still fails after its last try. The system SHALL then abort the active runs and start no more runs. The failure MUST name the batch number and the cause.

#### Scenario: One batch fails
- **WHEN** a review has 4 batches and the run of batch 2 fails on its third try
- **THEN** the system aborts the active runs, starts no more runs, and reports a review failure that names batch 2 and the cause
