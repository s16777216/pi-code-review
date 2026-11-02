# Spec Delta

## MODIFIED Requirements

### Requirement: Review writes findings to a file
The `review` command SHALL write the findings, the accepted fixed declarations, and the diff refs needed to publish them to a JSON file. The default file path MUST be `findings.json` in the working directory.

#### Scenario: Review produces a findings file
- **WHEN** the `review` command finishes a review
- **THEN** the system writes a JSON file containing every valid finding, every accepted fixed declaration, and the diff refs for the reviewed merge request

#### Scenario: Review produces no findings
- **WHEN** the `review` command finds no valid findings
- **THEN** the system still writes a findings file, with an empty list of findings

#### Scenario: Review produces no fixed declarations
- **WHEN** the `review` command accepts no fixed declaration
- **THEN** the system writes an empty `resolved` list
