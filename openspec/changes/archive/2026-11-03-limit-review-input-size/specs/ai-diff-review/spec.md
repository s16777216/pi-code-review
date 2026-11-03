# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
The system SHALL estimate the token size of the first model request before it sends that request. The system MUST fail the review when the estimate leaves less than 4,096 tokens for the answer, after a 4,096-token safety margin.

#### Scenario: Input fits the context window
- **WHEN** the estimated input leaves 4,096 or more tokens for the answer
- **THEN** the system sends the request

#### Scenario: Input is too large
- **WHEN** the estimated input leaves less than 4,096 tokens for the answer
- **THEN** the system does not call the model, and reports a review failure that gives the estimated input size and the context window

### Requirement: Report a review cut at the token limit
The system SHALL report a review failure when the model's final message stops at the output token limit. The error MUST name the `--max-tokens` and `--context-window` settings.

#### Scenario: Final message stops at the token limit
- **WHEN** the agent's final message has the stop reason `length`
- **THEN** the system reports a review failure that names `--max-tokens` and `--context-window`, and does not try to parse the cut output
