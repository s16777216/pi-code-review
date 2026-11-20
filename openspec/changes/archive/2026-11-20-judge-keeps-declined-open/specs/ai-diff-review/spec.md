## ADDED Requirements

### Requirement: Keep a declined discussion open in the judgment
The system prompt of the judge MUST tell the judge to give `not_fixed` when a person replied that the problem stays by decision and the code is unchanged. A person decides that the problem stays when the author does not accept the finding, and when the author leaves the problem for a later change. The system prompt MUST tell the judge to give `uncertain` when the only support for a fix is a statement in a reply that the judge cannot check in the diff or in the files that it can read. The system prompt MUST NOT tell the judge to give `not_fixed` when the code changed to fix the problem.

#### Scenario: The prompt covers a decision to not accept
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt tells the judge to give `not_fixed` when the author does not accept the finding and the code is unchanged

#### Scenario: The prompt covers a decision to defer
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt says that a decision to leave the problem for a later change is a decision that the problem stays

#### Scenario: The prompt covers a statement that the judge cannot check
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt tells the judge to give `uncertain` when the only support for a fix is a statement in a reply that the judge cannot check

#### Scenario: A fix of the code is still fixed
- **WHEN** the system builds the system prompt of the judge
- **THEN** the prompt does not tell the judge to give `not_fixed` when the code changed to fix the problem
