# Spec Delta

## MODIFIED Requirements

### Requirement: Each command accepts only the configuration it needs
The `review` command SHALL accept GitLab connection configuration, OpenAI configuration, and the review language. The `publish` command SHALL accept GitLab connection configuration and the severity threshold. Neither command SHALL accept configuration that only the other command uses.

#### Scenario: Review does not accept the severity threshold
- **WHEN** a person passes a severity-threshold flag to the `review` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish does not accept OpenAI configuration
- **WHEN** a person passes an OpenAI model or API key flag to the `publish` command
- **THEN** the system rejects the command line with a clear error

#### Scenario: Publish does not accept the review language
- **WHEN** a person passes the `--language` flag to the `publish` command
- **THEN** the system rejects the command line with a clear error
