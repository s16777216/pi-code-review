## ADDED Requirements

### Requirement: Tell the agent which line to report
The system prompt of each review agent SHALL tell the agent to report, in the `line` of a finding, the line that holds the problem. It SHALL tell the agent that, when the problem is in lines that the diff adds or changes, the line is in that run of added or changed lines and not a context line outside it. It SHALL tell the agent that, when the problem is in code that the diff does not change, the line is the line of that code that holds the problem. It SHALL tell the agent not to report the line that opens the function, the block, or the call around the problem, unless that line holds the problem. The system MUST NOT check this rule in code.

#### Scenario: The prompt names the line of the problem
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent to report the line that holds the problem

#### Scenario: The prompt keeps a changed problem inside the changed lines
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent that a problem in added or changed lines gets a line of that run of lines and not a context line outside it

#### Scenario: The prompt allows an unchanged line for unchanged code
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent that a problem in code that the diff does not change gets the line of that code that holds the problem

#### Scenario: The prompt excludes the line that opens the block
- **WHEN** the system builds the system prompt of a review agent
- **THEN** the prompt tells the agent not to report the line that opens the function, the block, or the call around the problem, unless that line holds the problem

#### Scenario: A finding on any line of the diff is still valid
- **WHEN** a finding has a line that is in the diff but is not the line of the problem
- **THEN** the system keeps the finding, as before this requirement

### Requirement: Ask the verifier for evidence in each reason
The system prompt of the verifier SHALL tell the verifier to quote, in the `reason` of each verdict, the code that shows the verdict. The quote is from the line of the finding or from a line near it. The prompt SHALL tell the verifier to use the verdict `rejected` when the code contradicts the summary of the finding. The system MUST NOT check in code that a `reason` holds a quote.

#### Scenario: The prompt asks for a quote
- **WHEN** the system builds the system prompt of the verifier
- **THEN** the prompt tells the verifier to quote the code that shows the verdict in the `reason`

#### Scenario: The prompt asks to reject a contradicted summary
- **WHEN** the system builds the system prompt of the verifier
- **THEN** the prompt tells the verifier to use `rejected` when the code contradicts the summary, for example when the code already does what the summary says is missing

#### Scenario: A reason without a quote is accepted
- **WHEN** the verifier calls `submit_verdicts` with a valid verdict whose `reason` holds no quote
- **THEN** the system accepts the call, as before this requirement

## MODIFIED Requirements

### Requirement: Log the verification step
The system SHALL write one `info` log line for the verification step with the number of findings before it, the number after it, the number of rejected findings, and the number of findings with a changed severity. For each rejected finding, the system SHALL write one `info` log line with the file, the line, the summary, and the reason of the verdict. For each finding with the verdict `uncertain`, the system SHALL write one `info` log line with the file, the line, and the reason. With `--debug`, the system SHALL log the system prompt and the user prompt of each verifier run. With `--debug`, the system SHALL also write one `debug` log line for each finding that the step handled, with the file, the line, the verdict, the reviewed severity, and the reason. This applies to the verdicts `confirmed`, `rejected`, and `uncertain`. The system MUST NOT record the verdicts in the findings file.

#### Scenario: The summary line
- **WHEN** the verification step gets 6 findings, drops 2, and changes the severity of 1
- **THEN** the system writes one `info` log line with the numbers 6, 4, 2, and 1

#### Scenario: A rejected finding is logged
- **WHEN** the verdict of a finding in `src/a.ts` on line 12 is `rejected` with the reason "The type check already covers this."
- **THEN** the system writes an `info` log line with `src/a.ts`, 12, the summary, and that reason

#### Scenario: The findings file has no verdict
- **WHEN** the review writes the findings file
- **THEN** no finding in the file has a field for the verdict, the reason, or a confidence value

#### Scenario: Every verdict is logged with debug
- **WHEN** the verification step handles 3 findings with the verdicts `confirmed`, `rejected`, and `uncertain`
- **THEN** the system writes 3 `debug` log lines, and each one has the file, the line, the verdict, the reviewed severity, and the reason

#### Scenario: A confirmed verdict is logged
- **WHEN** the verdict of a finding in `src/a.ts` on line 12 is `confirmed` with the reviewed severity `low` and the reason "Line 12 shows `x = null`."
- **THEN** the system writes a `debug` log line with `src/a.ts`, 12, `confirmed`, `low`, and that reason
