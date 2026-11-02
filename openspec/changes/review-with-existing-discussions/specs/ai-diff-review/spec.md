# Spec Delta

## ADDED Requirements

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
