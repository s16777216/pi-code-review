# Spec Delta

## MODIFIED Requirements

### Requirement: Build review input from the review context
The system SHALL build the agent's input from the `ReviewContext`'s title, description, and the diff of every changed file. The input of every agent run in one review MUST contain the title and the description. When the review runs in batches, the diff of every changed file MUST be in the input of exactly one run, and a file that is split at hunk boundaries MUST have each of its hunks in the input of exactly one run. The system SHALL print the new-file line number in front of every added line and every context line. The system MUST NOT depend on any GitLab-specific data beyond what `ReviewContext` exposes.

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

### Requirement: Fail before the model call when the input is too large
The system SHALL estimate the token size of the first model request of every run before it sends any request. The system MUST fail the review before the first model call when one hunk does not fit the batch budget alone, or when the review needs more than 20 batches. The batch budget is half of the context window, rounded down.

#### Scenario: Input fits the batch budget
- **WHEN** the estimated first request of a single run is within the batch budget
- **THEN** the system sends the request as one run

#### Scenario: One hunk is too large
- **WHEN** a hunk's estimated first request, as the only item of a batch, is larger than the batch budget
- **THEN** the system does not call the model, and reports a review failure that names the file and the hunk's first new-file line

#### Scenario: Too many batches
- **WHEN** the review needs 21 batches
- **THEN** the system does not call the model, and reports a review failure that gives the number of batches and the context window

## ADDED Requirements

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
