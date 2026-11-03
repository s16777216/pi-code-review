# Spec Delta

## MODIFIED Requirements

### Requirement: Log the AI review's prompt and response under debug
When `--debug` is on, the system SHALL log, for each model run, the system prompt and the prompt built for the AI agent, and the agent's raw response text, before that response is parsed into findings.

#### Scenario: A review completes
- **WHEN** `--debug` is on and the system completes an AI review
- **THEN** the debug output includes the system prompt and the prompt sent to the agent, and the agent's raw response text

#### Scenario: A review with a language
- **WHEN** `--debug` is on and `--language` is set
- **THEN** the logged system prompt contains the sentence that asks for summaries in that language
