## Purpose

Lets a person diagnose a failed or unexpected `review`/`publish` run by opting into detailed request/response logging, with a guarantee that no secret is ever printed even when that logging is on.

## ADDED Requirements

### Requirement: Provide an opt-in debug flag
The system SHALL accept a `--debug` CLI flag and a `DEBUG` environment variable on both the `review` and `publish` commands, with the CLI flag winning when both are given, consistent with every other setting. Debug logging SHALL be off by default.

#### Scenario: Debug flag is not given
- **WHEN** neither `--debug` nor `DEBUG` is set
- **THEN** the system produces no debug log output

#### Scenario: Debug flag is given
- **WHEN** `--debug` is passed on the command line
- **THEN** the system produces debug log output, regardless of `DEBUG`'s value

### Requirement: Never log a secret
The system MUST NOT print the value of `GITLAB_TOKEN`/`--token`, `OPENAI_API_KEY`/`--openai-api-key`, or the `PRIVATE-TOKEN` request header, under any circumstances, including when `--debug` is on.

#### Scenario: Debug logging is on during a GitLab API call
- **WHEN** the system calls the GitLab API with `--debug` enabled
- **THEN** the debug output does not contain the access token's value

#### Scenario: Debug logging is on during a review
- **WHEN** the system runs an AI review with `--debug` enabled
- **THEN** the debug output does not contain the OpenAI API key's value

### Requirement: Log GitLab API calls under debug
When `--debug` is on, the system SHALL log each GitLab API call's HTTP method, URL, and response status. The system MUST NOT log request or response headers or bodies.

#### Scenario: A GitLab API call completes
- **WHEN** `--debug` is on and the system completes a GitLab API call
- **THEN** the debug output includes that call's method, URL, and response status

### Requirement: Log the AI review's prompt and response under debug
When `--debug` is on, the system SHALL log the prompt built for the AI agent and the agent's raw response text, before that response is parsed into findings.

#### Scenario: A review completes
- **WHEN** `--debug` is on and the system completes an AI review
- **THEN** the debug output includes the prompt sent to the agent and the agent's raw response text

### Requirement: Debug logging does not change outcomes
Enabling `--debug` MUST NOT change a command's exit code, its stdout output, or the contents of the findings file it reads or writes.

#### Scenario: Same run, with and without debug
- **WHEN** the same `review` or `publish` invocation is run once with `--debug` and once without
- **THEN** both runs produce the same exit code and the same findings file contents
