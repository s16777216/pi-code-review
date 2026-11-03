# Spec Delta

## MODIFIED Requirements

### Requirement: Fetch the merge request diff
The system SHALL fetch the diff for every file the merge request changes, including the file path and the line-level hunks. The system SHALL mark a changed file as omitted because it is too large when GitLab reports `too_large`, and as omitted because it is generated when GitLab reports `generated_file`.

#### Scenario: Diff fetch succeeds
- **WHEN** the system fetches the diff for a merge request
- **THEN** the system has, for each changed file, the old path, the new path, and the hunk text

#### Scenario: GitLab does not return a diff that is too large
- **WHEN** GitLab returns a changed file with `too_large: true` and an empty diff
- **THEN** the system marks that file as omitted because it is too large

#### Scenario: GitLab marks a generated file
- **WHEN** GitLab returns a changed file with `generated_file: true` and `too_large: false`
- **THEN** the system marks that file as omitted because it is generated, and keeps its hunk text

#### Scenario: Both flags are set
- **WHEN** GitLab returns a changed file with both `too_large: true` and `generated_file: true`
- **THEN** the system marks that file as omitted because it is too large
