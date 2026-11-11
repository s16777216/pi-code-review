## ADDED Requirements

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

## RENAMED Requirements

- FROM: `### Requirement: Limit parallel batch runs`
- TO: `### Requirement: Limit parallel runs`

## MODIFIED Requirements

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

### Requirement: Limit parallel runs
The system SHALL run at most 3 agent runs at the same time. All agents of all run scopes use this one limit. The other runs SHALL wait in this order: by run scope, and then by review focus.

#### Scenario: Parallel runs are limited
- **WHEN** a review has 5 batches, and so 15 agent runs
- **THEN** at most 3 of their runs are active at the same time

#### Scenario: One run scope
- **WHEN** a review has one run scope, and so 3 agent runs
- **THEN** the 3 runs can be active at the same time

### Requirement: Run the checks once on the merged output
The system SHALL merge the outputs of all agents before it runs the checks on `relatesTo`, the diff line check, the anchor, the deduplication step, and the fixed declarations, in this order. The merge SHALL keep the findings in the order of the run scopes, and in each run scope in the order of the review focuses. The merge SHALL keep the first fixed declaration for each discussion ID in that order. In the check on fixed declarations, "the same output" MUST mean the merged output of the review.

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

### Requirement: Retry a model run that ends with an error
The system SHALL start a run again, with a new agent and new tools, when its final message has the stop reason `error`, or when the run ends with no accepted `submit_review` call. The same rule applies to the call of the deduplication step. The system SHALL try a run at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. Each retry MUST write one `warn` log line with the batch number when the run has one, the review focus, the try number, and the error message. The system MUST NOT retry a run that stops with `length` or `aborted`.

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

### Requirement: Fail the review when a batch fails
The system SHALL fail the review when a run still fails after its last try. The system SHALL then abort the active runs and start no more runs. The failure MUST name the batch number when the run has one, the review focus, and the cause.

#### Scenario: One batch fails
- **WHEN** a review has 4 batches and the run of batch 2 for the review focus security fails on its third try
- **THEN** the system aborts the active runs, starts no more runs, and reports a review failure that names batch 2, the review focus security, and the cause

#### Scenario: A run of the whole change fails
- **WHEN** the change fits one run scope and the run for the review focus logic correctness fails on its third try
- **THEN** the system aborts the active runs and reports a review failure that names the review focus logic correctness and the cause

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
