# Spec Delta

## ADDED Requirements

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
