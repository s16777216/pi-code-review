## MODIFIED Requirements

### Requirement: Keep a declined discussion open
The system prompt of the verify agent MUST tell the agent to find the last statement of a person about the problem of a discussion. A statement says that the problem stays by decision, or that the problem is fixed. A person decides that the problem stays when the author does not accept the finding, and when the author leaves the problem for a later change. The system prompt MUST tell the agent to use `keep_open` for a declaration when the last statement says that the problem stays. This rule MUST hold when the code changed, when the reason of the person is right, when the agent cannot check the reason, and when the reason of the judge says that there is no problem. The system prompt MUST tell the agent that resolving such a discussion is a decision for a person. The system prompt MUST NOT tell the agent to keep a discussion open when the last statement says that the problem is fixed and the code changed to fix the problem. The system prompt MUST tell the agent to use `keep_open` when no person decided that the problem stays, and the only support for a fix is a statement in a reply that the agent cannot check in the diff or in the files that it can read.

#### Scenario: The prompt has the rule
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt tells the agent to use `keep_open` when the last statement of a person says that the problem stays by decision, and says that resolving such a discussion is a decision for a person

#### Scenario: The rule covers a reason of the judge
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt says that the rule applies also when the reason of the judge says that there is no problem

#### Scenario: A fix after a reply is still resolved
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt does not tell the agent to keep a discussion open when the last statement says that the problem is fixed and the code changed to fix the problem

#### Scenario: The rule covers a decision to defer
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt says that a decision to leave the problem for a later change is a decision that the problem stays

#### Scenario: The rule covers a statement that the agent cannot check
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt tells the agent to use `keep_open` when no person decided that the problem stays and the only support for a fix is a statement in a reply that the agent cannot check

#### Scenario: The rule does not depend on the reason of the person
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt tells the agent not to judge if the reason of the person is right or if the agent can check it

#### Scenario: The rule holds when the code changed
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt says that the rule applies also when the code changed after the decision

#### Scenario: The last statement decides
- **WHEN** the system builds the system prompt of the verify agent
- **THEN** the prompt says that a later statement that the problem is fixed replaces an earlier decision that the problem stays

### Requirement: Keep a declined discussion open in the judgment
The system prompt of the judge MUST tell the judge to find the last statement of a person about the problem of a discussion. A statement says that the problem stays by decision, or that the problem is fixed. A person decides that the problem stays when the author does not accept the finding, and when the author leaves the problem for a later change. The system prompt MUST tell the judge to give `not_fixed` when the last statement says that the problem stays. This rule MUST hold when the code changed, when the reason of the person is right, and when the judge cannot check the reason. The system prompt MUST tell the judge to give `uncertain` when no person decided that the problem stays, and the only support for a fix is a statement in a reply that the judge cannot check in the diff or in the files that it can read. The system prompt MUST NOT tell the judge to give `not_fixed` when the last statement says that the problem is fixed and the code changed to fix the problem.

#### Scenario: The prompt covers a decision to not accept
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt tells the judge to give `not_fixed` when the last statement of the author says that the author does not accept the finding

#### Scenario: The prompt covers a decision to defer
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt says that a decision to leave the problem for a later change is a decision that the problem stays

#### Scenario: The prompt covers a statement that the judge cannot check
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt tells the judge to give `uncertain` when no person decided that the problem stays and the only support for a fix is a statement in a reply that the judge cannot check

#### Scenario: A fix of the code is still fixed
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt does not tell the judge to give `not_fixed` when the last statement says that the problem is fixed and the code changed to fix the problem

#### Scenario: The rule does not depend on the reason of the person
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt tells the judge not to judge if the reason of the person is right or if the judge can check it

#### Scenario: The rule holds when the code changed
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt says that the rule applies also when the code changed after the decision

#### Scenario: The last statement decides
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt says that a later statement that the problem is fixed replaces an earlier decision that the problem stays
