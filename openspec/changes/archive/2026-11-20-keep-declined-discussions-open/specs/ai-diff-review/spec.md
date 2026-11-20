## ADDED Requirements

### Requirement: Keep a declined discussion open
The system prompt of the verify agent MUST tell the agent to use `keep_open` for a declaration when a person replied that the problem stays by decision, for example when the author does not accept the finding, and the code that the note describes did not change. The system prompt MUST tell the agent that resolving such a discussion is a decision for a person. The system prompt MUST tell the agent that this rule applies also when the reason of the judge says that there is no problem.

#### Scenario: The prompt has the rule
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt tells the agent to use `keep_open` when a person replied that the problem stays by decision and the code did not change, and says that resolving such a discussion is a decision for a person

#### Scenario: The rule covers a reason of the judge
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt says that the rule applies also when the reason of the judge says that there is no problem

#### Scenario: A fix after a reply is still resolved
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt does not tell the agent to keep a discussion open when the code changed to fix the problem
