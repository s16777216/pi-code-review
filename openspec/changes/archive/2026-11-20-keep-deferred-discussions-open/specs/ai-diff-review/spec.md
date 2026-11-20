## MODIFIED Requirements

### Requirement: Keep a declined discussion open
The system prompt of the verify agent MUST tell the agent to use `keep_open` for a declaration when a person replied that the problem stays by decision, and the code that the note describes did not change. A person decides that the problem stays when the author does not accept the finding, and when the author leaves the problem for a later change. The system prompt MUST tell the agent that resolving such a discussion is a decision for a person. The system prompt MUST tell the agent that this rule applies also when the reason of the judge says that there is no problem. The system prompt MUST tell the agent to use `keep_open` when the only support for a fix is a statement in a reply that the agent cannot check in the diff or in the files that it can read.

#### Scenario: The prompt has the rule
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt tells the agent to use `keep_open` when a person replied that the problem stays by decision and the code did not change, and says that resolving such a discussion is a decision for a person

#### Scenario: The rule covers a reason of the judge
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt says that the rule applies also when the reason of the judge says that there is no problem

#### Scenario: A fix after a reply is still resolved
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt does not tell the agent to keep a discussion open when the code changed to fix the problem

#### Scenario: The rule covers a decision to defer
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt says that a decision to leave the problem for a later change is a decision that the problem stays

#### Scenario: The rule covers a statement that the agent cannot check
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt tells the agent to use `keep_open` when the only support for a fix is a statement in a reply that the agent cannot check in the diff or in the files that it can read
