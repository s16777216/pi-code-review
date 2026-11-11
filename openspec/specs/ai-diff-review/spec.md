## Purpose

Defines the `ReviewEngine`: a platform-agnostic component that takes a `ReviewContext`, runs an AI agent over it, and produces a list of structured findings and a pass/fail decision.

## Requirements

### Requirement: Build review input from the review context
The system SHALL build the agent's input from the `ReviewContext`'s title, description, and changed files. The input of every agent run in one review MUST contain the title and the description, and every hunk of every changed file that is not omitted MUST be in the input of exactly one run scope. The three agents of a run scope MUST get the same input. The system SHALL print the new-file line number in front of every added line and every context line. The system MUST NOT depend on any GitLab-specific data beyond what `ReviewContext` exposes.

#### Scenario: Review input includes the context's intent
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** the input of every run contains that context's title and description

#### Scenario: Review input includes every changed file's diff
- **WHEN** the system builds the review input from a `ReviewContext`
- **THEN** every line of the hunk text for every file in that context's changed files that is not omitted is in the input of exactly one run scope

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
- **THEN** the system writes one `warn` log line that names each invalid finding or declaration in that call

#### Scenario: Agent corrects a rejected call
- **WHEN** the agent calls `submit_review` again in the same run after a rejected call, and every finding and declaration of the new call is valid
- **THEN** the system accepts the new call's findings and declarations as the run's output

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
The system SHALL let the agent declare that a discussion is fixed, with the discussion ID and a one-sentence reason, in the same `submit_review` call as its findings. The call's `resolved` array MUST list these declarations. When one declaration in a call is invalid, the system MUST reject the whole call, as for an invalid finding.

#### Scenario: Agent declares a fix
- **WHEN** the agent calls `submit_review` with one finding and one declaration that has a discussion ID and a reason
- **THEN** the system accepts one finding and one declaration

#### Scenario: Agent returns a bare array
- **WHEN** the agent calls `submit_review` with findings and an empty `resolved` array
- **THEN** the system accepts the findings and returns no declarations

#### Scenario: A declaration has no reason
- **WHEN** a declaration in a `submit_review` call has a discussion ID but no reason
- **THEN** the system rejects the whole call and writes one `warn` log line

#### Scenario: Output object has no findings array
- **WHEN** the agent's `submit_review` call does not include a `findings` array
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
The system SHALL review a change in batches when the estimated first request of a single run is larger than the batch budget. The system SHALL sort the changed files by path and add each file to the current batch while the batch's estimated first request stays within the budget, and start a new batch otherwise. The system SHALL write one `info` log line with the number of batches. The plan for the batches is the same for the three review focuses.

#### Scenario: Change fits one run
- **WHEN** the estimated first request of a single run is within the batch budget
- **THEN** the system runs the three agents on the whole change, with no paragraph of a batch in the system prompt

#### Scenario: Change is split into batches
- **WHEN** the estimated first request of a single run is larger than the batch budget
- **THEN** the system runs three agents for each batch, and every batch's estimated first request is within the budget

#### Scenario: Files are packed in path order
- **WHEN** the changed files are `b/y.ts`, `a/x.ts`, and `a/z.ts`, and only two of them fit in one batch
- **THEN** the first batch has `a/x.ts` and `a/z.ts`, and the second batch has `b/y.ts`

### Requirement: List every changed file in each batch's input
The input of each batch MUST list every changed file of the change, with its path, its added, deleted, or renamed state, and its count of added and removed lines. The list MUST mark the files of that batch.

#### Scenario: Batch input lists every changed file
- **WHEN** the system builds the input of one batch
- **THEN** the input lists every changed file of the change and marks the files of that batch

### Requirement: Limit parallel runs
The system SHALL run at most 3 agent runs at the same time. All agents of all run scopes use this one limit. The other runs SHALL wait in this order: by run scope, and then by review focus. The verifier runs of the verification step use the same limit of 3 runs, and they wait in the order of their files.

#### Scenario: Parallel runs are limited
- **WHEN** a review has 5 batches, and so 15 agent runs
- **THEN** at most 3 of their runs are active at the same time

#### Scenario: One run scope
- **WHEN** a review has one run scope, and so 3 agent runs
- **THEN** the 3 runs can be active at the same time

#### Scenario: Verifier runs are limited
- **WHEN** the verification step has 5 files with findings
- **THEN** at most 3 verifier runs are active at the same time

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
The system SHALL merge the outputs of all agents before it runs the checks on `relatesTo`, the diff line check, the anchor, the deduplication step, the verification step, and the fixed declarations, in this order. The merge SHALL keep the findings in the order of the run scopes, and in each run scope in the order of the review focuses. The merge SHALL keep the first fixed declaration for each discussion ID in that order. In the check on fixed declarations, "the same output" MUST mean the merged output of the review.

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

### Requirement: Retry a model run that ends with an error
The system SHALL start a run again, with a new agent and new tools, when its final message has the stop reason `error`, or when the run ends with no accepted `submit_review` call. The same rule applies to the call of the deduplication step and to each verifier run of the verification step. The system SHALL try a run at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. Each retry MUST write one `warn` log line with the batch number when the run has one, the review focus, the try number, and the error message. The system MUST NOT retry a run that stops with `length` or `aborted`.

#### Scenario: Run passes on the second try
- **WHEN** a run's first try ends with the stop reason `error` and its second try produces an accepted `submit_review` call
- **THEN** the system uses the output of the second try and logs one retry

#### Scenario: Run stops at the token limit
- **WHEN** a run's final message has the stop reason `length`
- **THEN** the system does not retry the run

#### Scenario: Run ends with no accepted submission
- **WHEN** a run's final message has a normal stop reason, and the agent never made an accepted `submit_review` call
- **THEN** the system treats the run as a failed try, the same as a run that stops with the reason `error`

#### Scenario: The retry log names the review focus
- **WHEN** the run of the agent for security ends with the stop reason `error`
- **THEN** the `warn` log line for the retry names the review focus security

#### Scenario: A verifier run is tried again
- **WHEN** the first try of a verifier run ends with the stop reason `error` and its second try produces an accepted `submit_verdicts` call
- **THEN** the system uses the verdicts of the second try and logs one retry that names the file

### Requirement: Fail the review when a batch fails
The system SHALL fail the review when a run still fails after its last try. The system SHALL then abort the active runs and start no more runs. The failure MUST name the batch number when the run has one, the review focus, and the cause.

#### Scenario: One batch fails
- **WHEN** a review has 4 batches and the run of batch 2 for the review focus security fails on its third try
- **THEN** the system aborts the active runs, starts no more runs, and reports a review failure that names batch 2, the review focus security, and the cause

#### Scenario: A run of the whole change fails
- **WHEN** the change fits one run scope and the run for the review focus logic correctness fails on its third try
- **THEN** the system aborts the active runs and reports a review failure that names the review focus logic correctness and the cause

### Requirement: Write finding summaries in the configured language
The system SHALL read an optional review language from the `--language` flag or the `REVIEW_LANGUAGE` environment variable, with the flag winning. When a language is set, the system SHALL tell the agent to write each finding summary in that language. JSON field names and severity values MUST stay in English.

#### Scenario: No language is set
- **WHEN** neither `--language` nor `REVIEW_LANGUAGE` is set
- **THEN** the system prompt is the same as the system prompt without this feature

#### Scenario: A language is set
- **WHEN** `--language "Traditional Chinese"` is given
- **THEN** the system prompt tells the agent to write each summary in Traditional Chinese, and to keep field names and severity values as specified

#### Scenario: The flag wins over the environment variable
- **WHEN** `--language Japanese` is given and `REVIEW_LANGUAGE` is `German`
- **THEN** the system prompt names Japanese

#### Scenario: The language value is invalid
- **WHEN** the language value is empty after trimming, is longer than 64 characters, or contains a line break
- **THEN** the system stops before it calls any API, and reports a clear configuration error

#### Scenario: Severity stays in English
- **WHEN** a language is set and the agent returns a finding with severity `重要`
- **THEN** the system treats that finding as invalid, as for any other unknown severity

### Requirement: List omitted files without their diff
The system SHALL show a changed file whose diff is omitted in the review input with its path and the reason, `too large` or `generated file`, and without its diff. The system MUST NOT put an omitted file into a batch. The file-content tool SHALL still return the content of an omitted file.

#### Scenario: A file is too large
- **WHEN** a changed file is omitted because it is too large
- **THEN** the review input shows its path and `diff not shown: too large`, and no diff block for it

#### Scenario: A generated file is not reviewed
- **WHEN** a changed file is omitted because it is generated, and its hunk text is not empty
- **THEN** the review input shows its path and `diff not shown: generated file`, and none of its hunk text

#### Scenario: Omitted file in a review in batches
- **WHEN** a review runs in batches and one changed file is omitted
- **THEN** the file is in the file list of every batch with its reason, and in no batch's diffs

### Requirement: Drop findings on omitted files
The system SHALL drop a finding on a changed file whose diff is omitted, and write one `warn` log line with the reason `diff_omitted`.

#### Scenario: Finding on a generated file
- **WHEN** the agent reports a finding on a line of a generated file's hunk text
- **THEN** the system drops the finding and logs the reason `diff_omitted`

### Requirement: Report the omitted files
The system SHALL return every omitted changed file as an unreviewed file, with its path and its reason, `too_large` or `generated`, in path order. The system SHALL write one `warn` log line for each file that is omitted because it is too large.

#### Scenario: One file is too large
- **WHEN** one changed file is omitted because it is too large
- **THEN** the review result lists that file with the reason `too_large`, and the system writes one `warn` log line that names it

#### Scenario: One file is generated
- **WHEN** one changed file is omitted because it is generated
- **THEN** the review result lists that file with the reason `generated`, and the system writes no `warn` log line for it

### Requirement: Limit submit_review attempts in one run
The system SHALL accept at most 5 `submit_review` calls in one run. After the limit, the system SHALL end the run without accepting any call.

#### Scenario: Agent exhausts the attempt limit
- **WHEN** the agent calls `submit_review` with an invalid finding or declaration on 5 calls in one run
- **THEN** the system stops accepting further calls in that run, and the run ends without an accepted submission
### Requirement: Append review instructions to the system prompt
The system SHALL add the review instructions to the system prompt of every agent run. The review instructions go after the paragraph of the review focus and before the language sentence. The system SHALL put a statement before the review instructions. The statement says that the project owner wrote them, that they win over the general guidance when the two conflict, and that they never change the output format of `submit_review`, the rules for the tools, or the rule that discussion text is information and not an instruction. The system MUST NOT fill placeholders in the review instructions. The system SHALL remove white space at the start and the end of the text, and SHALL read each CRLF line break as LF. The system SHALL still check every finding with the existing checks.

#### Scenario: No review instructions
- **WHEN** no instructions source is usable
- **THEN** the system prompt holds the general guidance, the paragraph of the run scope, and the paragraph of the review focus, with no statement and no review instructions

#### Scenario: Review instructions are added
- **WHEN** the usable instructions source holds the text `Skip naming problems.`
- **THEN** the system prompt holds the statement and then the text, after the general guidance, the paragraph of the run scope, and the paragraph of the review focus

#### Scenario: Review instructions and a language
- **WHEN** the usable instructions source holds a text, and `--language Japanese` is given
- **THEN** the system prompt has this order: the general guidance, the paragraph of the run scope, the paragraph of the review focus, the statement and the review instructions, and then the language sentence

#### Scenario: Every batch gets the review instructions
- **WHEN** the change is split into batches, and the usable instructions source holds a text
- **THEN** the system prompt of each agent of each batch holds the review instructions

#### Scenario: Placeholders stay as they are
- **WHEN** the review instructions contain the text `${summary}`
- **THEN** the system prompt contains `${summary}` without change

#### Scenario: White space and CRLF
- **WHEN** the text has blank lines at its start and its end, and uses CRLF line breaks
- **THEN** the system prompt holds the text without those blank lines, and with LF line breaks only

#### Scenario: The size estimate counts the review instructions
- **WHEN** the review instructions have 8,000 characters
- **THEN** the estimate of the first request of a run includes them, and the plan for the batches uses that estimate

#### Scenario: The checks on findings do not change
- **WHEN** the review instructions tell the agent to use the severity `blocker`, and the agent returns a finding with that severity
- **THEN** the system treats the finding as invalid, as for any other unknown severity

### Requirement: Choose the instructions source for the review instructions
The system SHALL take the review instructions from the first usable instructions source in this order: the `--instructions` flag, with a file path; the `--instructions-text` flag, with the text; the `REVIEW_INSTRUCTIONS_FILE` environment variable, with a file path; and the `REVIEW_INSTRUCTIONS` environment variable, with the text. A flag or a variable is set when it is present, even when its value is an empty string. The system MUST NOT read a file that no flag and no variable names. The system SHALL read a file path relative to the working directory. An instructions source is usable when the system can read it as UTF-8 text, and the text is not empty after the removal of white space, and has at most 8,000 characters.

When a set instructions source is not usable, the system SHALL write one `warn` log line that names the source and the cause, and SHALL try the next source. The system MUST NOT stop the review for this. The system SHALL use one instructions source at most. When the system uses a source, it SHALL write one `info` log line that names the source and the number of characters.

#### Scenario: The path flag wins
- **WHEN** `--instructions` names a usable file, and `--instructions-text`, `REVIEW_INSTRUCTIONS_FILE`, and `REVIEW_INSTRUCTIONS` are also set
- **THEN** the system uses the file that `--instructions` names

#### Scenario: The text flag wins over the variables
- **WHEN** `--instructions` is not given, `--instructions-text` holds a usable text, and `REVIEW_INSTRUCTIONS_FILE` and `REVIEW_INSTRUCTIONS` are set
- **THEN** the system uses the text of `--instructions-text`

#### Scenario: The file variable wins over the text variable
- **WHEN** no flag is given, `REVIEW_INSTRUCTIONS_FILE` names a usable file, and `REVIEW_INSTRUCTIONS` is set
- **THEN** the system uses the file that `REVIEW_INSTRUCTIONS_FILE` names

#### Scenario: The text variable
- **WHEN** no flag is given, only `REVIEW_INSTRUCTIONS` is set, and it holds a usable text
- **THEN** the system uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: No instructions source
- **WHEN** no flag and no variable is set, and a file `REVIEW_INSTRUCTIONS.md` exists in the working directory
- **THEN** the system does not read the file, uses no review instructions, and writes no log line about them

#### Scenario: The source is logged
- **WHEN** the system uses `--instructions-text` with 120 characters
- **THEN** the system writes one `info` log line that names the flag and says 120 characters

#### Scenario: A file does not exist
- **WHEN** `--instructions missing.md` names a file that does not exist, and `REVIEW_INSTRUCTIONS` holds a usable text
- **THEN** the system writes one `warn` log line that names the flag and the cause, and uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: A flag is an empty string
- **WHEN** `--instructions-text` is given with an empty string, and `REVIEW_INSTRUCTIONS` holds a usable text
- **THEN** the system writes one `warn` log line that names the flag, and uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: A variable is an empty string
- **WHEN** `REVIEW_INSTRUCTIONS_FILE` is set to an empty string, and `REVIEW_INSTRUCTIONS` holds a usable text
- **THEN** the system writes one `warn` log line that names the variable, and uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: A file is not UTF-8 text
- **WHEN** the file that `--instructions` names is not valid UTF-8 text
- **THEN** the system writes one `warn` log line that names the flag and the cause, and tries the next source

#### Scenario: A text has only white space
- **WHEN** `REVIEW_INSTRUCTIONS` holds only spaces and line breaks
- **THEN** the system writes one `warn` log line that names the variable, and tries the next source

#### Scenario: A text has 8,000 characters
- **WHEN** a set source holds a text with exactly 8,000 characters
- **THEN** the system uses it

#### Scenario: A text has more than 8,000 characters
- **WHEN** a set source holds a text with 8,001 characters
- **THEN** the system writes one `warn` log line that names the source and the limit, and tries the next source

#### Scenario: No source is usable
- **WHEN** every set source is not usable
- **THEN** the system runs the review with no review instructions, and the review does not stop

#### Scenario: A failed source does not change the exit code
- **WHEN** a set source is not usable, and the review finishes
- **THEN** the `review` command exits with code 0

### Requirement: Warn when the change modifies the instructions file
When the system uses a file path as the instructions source, it SHALL compare the path of that file, relative to the working directory, with the paths of the files that the change request changes. The system SHALL use the forward slash as the separator in this comparison. A changed file matches by its new path or its old path. When the path matches, the system SHALL write one `warn` log line that names the file. The warning MUST NOT change the review, the findings, or the exit code. The system MUST NOT make this comparison when it uses a text, from `--instructions-text` or `REVIEW_INSTRUCTIONS`.

#### Scenario: The change modifies the file in use
- **WHEN** the system uses the file that `--instructions REVIEW_INSTRUCTIONS.md` names, and the merge request changes `REVIEW_INSTRUCTIONS.md`
- **THEN** the system writes one `warn` log line that names the file, and the review continues

#### Scenario: The change adds the file in use
- **WHEN** the system uses the file that `REVIEW_INSTRUCTIONS_FILE` names, and the merge request adds that file
- **THEN** the system writes one `warn` log line that names the file

#### Scenario: The change does not modify the file
- **WHEN** the system uses the file that `--instructions REVIEW_INSTRUCTIONS.md` names, and the merge request does not change it
- **THEN** the system writes no `warn` log line about the file

#### Scenario: The text sources are not compared
- **WHEN** the system uses a text from `--instructions-text` or `REVIEW_INSTRUCTIONS`, and the merge request changes `REVIEW_INSTRUCTIONS.md`
- **THEN** the system writes no `warn` log line about the file

#### Scenario: The file is outside the working directory
- **WHEN** the system uses a file that is not inside the working directory
- **THEN** the system writes no `warn` log line about the file

#### Scenario: Backslash separators
- **WHEN** `--instructions docs\review.md` names the file in use, and the merge request changes `docs/review.md`
- **THEN** the system writes one `warn` log line that names the file
### Requirement: Review with three agents that each have a review focus
The system SHALL run three agents for each run scope. A run scope is the whole change, or one batch. Each agent has one review focus. The review focuses are, in this order: logic correctness, security, and resources and concurrency. The system MUST NOT let a person change the number or the text of the review focuses. The system MUST NOT have a setting that turns this off. Each agent MUST get the same input and the same review instructions as the other agents of its run scope.

#### Scenario: Change fits one run scope
- **WHEN** the estimated first request of a single run is within the batch budget
- **THEN** the system runs three agents, one for each review focus, and each agent sees the whole change

#### Scenario: Change is split into batches
- **WHEN** the change is split into 2 batches
- **THEN** the system runs 6 agents, three for each batch, one for each review focus

#### Scenario: Agents get the same input
- **WHEN** the system runs the three agents of one run scope
- **THEN** the user prompt of the three agents is the same

#### Scenario: Agents get the same review instructions
- **WHEN** the usable instructions source holds a text
- **THEN** the system prompt of each of the three agents holds that text

### Requirement: Add the review focus to the system prompt
The system SHALL add a paragraph for the review focus to the system prompt of each agent. The paragraph goes after the paragraph of the run scope and before the review instructions. The paragraph MUST say that the review focus is the main area of the agent and not a limit. The paragraph MUST say that the agent still reports any other genuine bug that it sees. The batch budget MUST count the review focus with the largest first request, so that the first request of each of the three agents is within the budget.

#### Scenario: Order of the system prompt
- **WHEN** the system builds the system prompt of an agent, the change is split into batches, review instructions are set, and a language is set
- **THEN** the system prompt has this order: the general guidance, the paragraph of the run scope, the paragraph for the review focus, the statement and the review instructions, and then the language sentence

#### Scenario: A focus is not a limit
- **WHEN** the system builds the system prompt of the agent for the security review focus
- **THEN** the paragraph for the review focus says that the agent still reports any other genuine bug that it sees

#### Scenario: The budget counts the largest review focus
- **WHEN** the system plans the batches
- **THEN** the estimate of the first request is the largest of the estimates for the three review focuses, and the plan for the batches is the same for the three review focuses

### Requirement: Deduplicate findings with the deduplication step
The system SHALL run the deduplication step on the merged findings that pass the checks on `relatesTo` and the diff line check, and before the check on the fixed declarations. The system SHALL call the model once for the step, and only when at least one file has two or more findings. The system MUST NOT call the model for the step in any other case. The system MUST send only the findings of files that have two or more findings. The model MUST see only the file, the line, the severity, and the summary of each finding that it gets. The model MUST return only groups of finding numbers, with no other text. A group is valid when all its findings are in the same file. The result is valid when each sent finding number is in exactly one group. The system SHALL reject a result that is not valid and SHALL tell the model the reason. The system SHALL fail the review when the call fails, or gives no valid result, on its last try. The system MUST NOT change the findings when the step is not called.

#### Scenario: No file has two findings
- **WHEN** the merged findings are in 3 different files, one finding in each file
- **THEN** the system does not call the model for the deduplication step

#### Scenario: A file has two findings
- **WHEN** the merged findings hold two findings in `src/a.ts`
- **THEN** the system calls the model once for the deduplication step

#### Scenario: The model sees only four fields
- **WHEN** the system builds the input of the deduplication step
- **THEN** the input holds, for each finding, its number, file, line, severity, and summary, and holds no `relatesTo`, no anchor, and no diff text

#### Scenario: Findings of single files are not sent
- **WHEN** the merged findings hold two findings in `src/a.ts` and one finding in `src/b.ts`
- **THEN** the input of the deduplication step holds the two findings of `src/a.ts` and not the finding of `src/b.ts`

#### Scenario: A group has findings of two files
- **WHEN** the model returns a group that holds a finding in `src/a.ts` and a finding in `src/b.ts` on each of its tries
- **THEN** the system fails the review

#### Scenario: A finding number is missing or repeated
- **WHEN** the model returns groups in which one finding number is missing, or one number is in two groups, on each of its tries
- **THEN** the system fails the review

#### Scenario: The model corrects a result
- **WHEN** the model returns a result that is not valid, and then a valid result in the same run
- **THEN** the system uses the valid result

#### Scenario: The call fails
- **WHEN** the call for the deduplication step fails on its third try
- **THEN** the system fails the review and the failure names the deduplication step

### Requirement: Keep one finding in each group of the deduplication step
The system SHALL keep exactly one finding of each group. The system SHALL keep the finding with the highest severity, in this order from high to low: `critical`, `high`, `medium`, `low`, `pre_existing`. When two findings have the same severity, the system SHALL keep the one that comes first in the merged findings. The system MUST NOT change the file, the line, the severity, or the summary of the kept finding. When the kept finding has no `relatesTo`, and another finding of its group has one, the kept finding SHALL take the `relatesTo` of the first such finding in the merged order. The system MUST drop the other findings of the group.

#### Scenario: Higher severity wins
- **WHEN** a group holds a finding with severity `low` and a finding with severity `high`
- **THEN** the system keeps the finding with severity `high`

#### Scenario: A finding introduced by the diff wins over a pre-existing one
- **WHEN** a group holds a finding with severity `pre_existing` and a finding with severity `low`
- **THEN** the system keeps the finding with severity `low`

#### Scenario: Equal severity
- **WHEN** a group holds two findings with severity `medium`
- **THEN** the system keeps the one that comes first in the merged findings

#### Scenario: The text is not changed
- **WHEN** the system keeps a finding from a group
- **THEN** the file, the line, the severity, and the summary of the kept finding are the same as before the step

#### Scenario: The kept finding takes a relatesTo
- **WHEN** the kept finding has no `relatesTo`, and the second finding of its group has `relatesTo` equal to `d1`
- **THEN** the kept finding has `relatesTo` equal to `d1`

#### Scenario: The kept finding has its own relatesTo
- **WHEN** the kept finding has `relatesTo` equal to `d1`, and another finding of its group has `relatesTo` equal to `d2`
- **THEN** the kept finding has `relatesTo` equal to `d1`

### Requirement: Log the findings of each review focus
The system SHALL write one `info` log line for each review focus when the agents finish. The line MUST name the review focus and the number of findings that its agents reported. The system SHALL write one `info` log line for the deduplication step with the number of findings before it and after it. The system MUST NOT record the review focus in the findings file.

#### Scenario: Log line for each review focus
- **WHEN** the review finishes the runs of the three agents
- **THEN** the system writes three `info` log lines, one for each review focus, with the number of findings of that review focus

#### Scenario: Log line for the deduplication step
- **WHEN** the deduplication step keeps 4 findings from 6 findings
- **THEN** the system writes one `info` log line with the numbers 6 and 4

#### Scenario: The findings file has no review focus
- **WHEN** the review writes the findings file
- **THEN** no finding in the file has a field for the review focus

### Requirement: Verify the findings with the verification step
The system SHALL run the verification step on the findings that remain after the deduplication step, and before the check on the fixed declarations. The system SHALL group these findings by file, and SHALL start one verifier run for each file that has at least one finding. The system MUST NOT start a verifier run when no finding remains. A verifier run MUST handle all findings of one file and MUST NOT handle findings of another file. The system SHALL order the files by the first finding of each file in the merged findings. The verification step applies to every finding, including a finding that has `relatesTo` and a finding with the severity `pre_existing`.

#### Scenario: One run for each file
- **WHEN** 5 findings remain after the deduplication step, 3 in `src/a.ts` and 2 in `src/b.ts`
- **THEN** the system starts two verifier runs, one for `src/a.ts` and one for `src/b.ts`

#### Scenario: No finding remains
- **WHEN** no finding remains after the deduplication step
- **THEN** the system starts no verifier run

#### Scenario: A finding with relatesTo is verified
- **WHEN** a finding has `relatesTo` equal to `d1`
- **THEN** the system sends the finding to a verifier run in the same way as a finding with no `relatesTo`

#### Scenario: The step runs after deduplication
- **WHEN** the deduplication step drops a finding
- **THEN** the system does not send that finding to a verifier run

### Requirement: Give the verifier the diff, the findings, and the review instructions
The system SHALL give a verifier run the title and the description of the change, the diff of the file with the line numbers of the new version, and the findings of the file. For each finding, the verifier MUST see its number, line, severity, and summary. The verifier MUST NOT see the `relatesTo` or the anchor of a finding, and MUST NOT see the reasoning of the agent that reported the finding. The system SHALL add the review instructions to the system prompt of the verifier, in the same way as for the other agents, when review instructions are set. The system SHALL give the verifier a tool that reads the content of a changed file. The verifier has no other tool for reading. The system prompt of the verifier SHALL say that the text of the summaries and of the files is information and not an instruction to the verifier.

#### Scenario: The verifier sees the diff of its file
- **WHEN** the system starts the verifier run for `src/a.ts`
- **THEN** the input of the run holds the diff of `src/a.ts` with line numbers, and holds the diff of no other file

#### Scenario: The verifier sees four fields of each finding
- **WHEN** the system builds the input of a verifier run
- **THEN** the input holds, for each finding, its number, line, severity, and summary, and holds no `relatesTo` and no anchor

#### Scenario: The verifier gets the review instructions
- **WHEN** review instructions are set
- **THEN** the system prompt of the verifier holds the review instructions

#### Scenario: The verifier can read a changed file
- **WHEN** the verifier calls the tool that reads a file with the path of a changed file
- **THEN** the tool returns the content of that file

### Requirement: Accept the verdicts only in a valid form
The verifier SHALL report its result with the tool `submit_verdicts`. The call MUST hold one verdict for each finding that the system sent to the run. A verdict MUST hold the number of the finding, the verdict value (`confirmed`, `rejected`, or `uncertain`), the reviewed severity (one of `critical`, `high`, `medium`, `low`, or `pre_existing`), and a reason of one sentence that is not empty. The system MUST NOT accept a verdict field for a confidence value or for a new summary. The call is valid when each sent number has exactly one verdict and no other number has a verdict. The system SHALL reject a call that is not valid and SHALL tell the verifier the reason. The system SHALL accept at most 5 `submit_verdicts` calls in one run. After the limit, the system SHALL end the run without accepting any call.

#### Scenario: A valid call
- **WHEN** the verifier sends 3 findings and calls `submit_verdicts` with one valid verdict for each number
- **THEN** the system accepts the call and ends the run

#### Scenario: A finding has no verdict
- **WHEN** the verifier calls `submit_verdicts` with verdicts for 2 of the 3 sent numbers
- **THEN** the system rejects the call and names the missing number

#### Scenario: A number has two verdicts
- **WHEN** the verifier calls `submit_verdicts` with two verdicts for the same number
- **THEN** the system rejects the call

#### Scenario: A number was not sent
- **WHEN** the verifier calls `submit_verdicts` with a verdict for a number that the system did not send
- **THEN** the system rejects the call

#### Scenario: The reason is empty
- **WHEN** a verdict has a reason that is empty or holds only white space
- **THEN** the system rejects the call

#### Scenario: The verifier corrects a call
- **WHEN** the verifier makes a call that is not valid, and then a valid call in the same run
- **THEN** the system uses the valid call

#### Scenario: The verifier exhausts the attempt limit
- **WHEN** the verifier makes 5 calls that are not valid in one run
- **THEN** the system stops accepting calls, and the run ends without an accepted call

### Requirement: Apply the verdicts to the findings
The system SHALL drop a finding when its verdict is `rejected`. The system SHALL keep a finding when its verdict is `confirmed` or `uncertain`. The system SHALL set the severity of each kept finding to the reviewed severity of its verdict. The system MUST NOT change the file, the line, the summary, the `relatesTo`, or the anchor of a finding. The system SHALL keep the order of the findings that remain. The pass or fail result of the review SHALL use the severity after the verification step.

#### Scenario: A rejected finding is dropped
- **WHEN** the verdict of a finding is `rejected`
- **THEN** the findings of the review do not hold that finding

#### Scenario: An uncertain finding is kept
- **WHEN** the verdict of a finding is `uncertain` and its reviewed severity is `medium`
- **THEN** the findings of the review hold that finding with the severity `medium`

#### Scenario: The severity is lowered
- **WHEN** a finding has the severity `high` and its verdict is `confirmed` with the reviewed severity `medium`
- **THEN** the finding has the severity `medium` in the findings of the review

#### Scenario: The severity is raised
- **WHEN** a finding has the severity `low` and its verdict is `confirmed` with the reviewed severity `high`
- **THEN** the finding has the severity `high` in the findings of the review

#### Scenario: Only the severity changes
- **WHEN** the system applies a verdict to a finding
- **THEN** the file, the line, the summary, the `relatesTo`, and the anchor of the finding are the same as before the step

#### Scenario: The pass or fail result uses the reviewed severity
- **WHEN** the fail threshold is `high`, and the only finding with the severity `high` gets the reviewed severity `medium`
- **THEN** the review passes

### Requirement: Keep the findings of a file when its verification fails
The system SHALL keep the findings of a file as they were, with their severity from before the step, when the verifier run for that file fails on its last try. The system SHALL also keep them when the first request of the run would be larger than half of the context window of the model, and then the system MUST NOT call the model for that file. In both cases the system SHALL write one `warn` log line with the file and the cause. The review MUST NOT fail because a verifier run fails. The verification of the other files continues.

#### Scenario: A verifier run fails
- **WHEN** the verifier run for `src/a.ts` ends with the stop reason `error` on each of its 3 tries
- **THEN** the findings of `src/a.ts` stay with their severity from before the step, the system writes a `warn` log line that names `src/a.ts`, and the review does not fail

#### Scenario: The other files are still verified
- **WHEN** the verifier run for `src/a.ts` fails and the verifier run for `src/b.ts` gives a valid result
- **THEN** the system applies the verdicts for `src/b.ts`

#### Scenario: The diff of the file is too large
- **WHEN** the first request of the verifier run for a file is larger than half of the context window
- **THEN** the system does not call the model for that file, keeps its findings, and writes a `warn` log line that names the file

### Requirement: Log the verification step
The system SHALL write one `info` log line for the verification step with the number of findings before it, the number after it, the number of rejected findings, and the number of findings with a changed severity. For each rejected finding, the system SHALL write one `info` log line with the file, the line, the summary, and the reason of the verdict. For each finding with the verdict `uncertain`, the system SHALL write one `info` log line with the file, the line, and the reason. With `--debug`, the system SHALL log the system prompt and the user prompt of each verifier run. The system MUST NOT record the verdicts in the findings file.

#### Scenario: The summary line
- **WHEN** the verification step gets 6 findings, drops 2, and changes the severity of 1
- **THEN** the system writes one `info` log line with the numbers 6, 4, 2, and 1

#### Scenario: A rejected finding is logged
- **WHEN** the verdict of a finding in `src/a.ts` on line 12 is `rejected` with the reason "The type check already covers this."
- **THEN** the system writes an `info` log line with `src/a.ts`, 12, the summary, and that reason

#### Scenario: The findings file has no verdict
- **WHEN** the review writes the findings file
- **THEN** no finding in the file has a field for the verdict, the reason, or a confidence value
