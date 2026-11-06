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
- **THEN** the system writes one `warn` log line that names each invalid finding or declaration in that call

#### Scenario: Agent corrects a rejected call
- **WHEN** the agent calls `submit_review` again in the same run after a rejected call, and every finding and declaration of the new call is valid
- **THEN** the system accepts the new call's findings and declarations as the run's output

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

### Requirement: Retry a model run that ends with an error
The system SHALL start a run again, with a new agent and new tools, when its final message has the stop reason `error`, or when the run ends with no accepted `submit_review` call. The system SHALL try a run at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. Each retry MUST write one `warn` log line with the batch number, the try number, and the error message. The system MUST NOT retry a run that stops with `length` or `aborted`.

#### Scenario: Run passes on the second try
- **WHEN** a run's first try ends with the stop reason `error` and its second try produces an accepted `submit_review` call
- **THEN** the system uses the output of the second try and logs one retry

#### Scenario: Run stops at the token limit
- **WHEN** a run's final message has the stop reason `length`
- **THEN** the system does not retry the run

#### Scenario: Run ends with no accepted submission
- **WHEN** a run's final message has a normal stop reason, and the agent never made an accepted `submit_review` call
- **THEN** the system treats the run as a failed try, the same as a run that stops with the reason `error`

## ADDED Requirements

### Requirement: Limit submit_review attempts in one run
The system SHALL accept at most 5 `submit_review` calls in one run. After the limit, the system SHALL end the run without accepting any call.

#### Scenario: Agent exhausts the attempt limit
- **WHEN** the agent calls `submit_review` with an invalid finding or declaration on 5 calls in one run
- **THEN** the system stops accepting further calls in that run, and the run ends without an accepted submission
