# Spec Delta

## ADDED Requirements

### Requirement: Keep one comment that lists files too large to review
When the findings file has unreviewed files with the reason `too_large`, the system SHALL keep one general merge request comment from this tool that starts with `<!-- pi-code-review unreviewed -->` and lists their paths. The system SHALL update that comment instead of creating a second one. Files with the reason `generated` MUST NOT be listed. A failure MUST NOT stop `publish`.

#### Scenario: First run with a file too large
- **WHEN** the findings file has one file with the reason `too_large`, and the merge request has no such comment from this tool
- **THEN** the system creates one general comment that starts with the marker and names that file

#### Scenario: Same files on a later run
- **WHEN** the merge request already has the comment, and its body is the body that the system would write
- **THEN** the system does not create or update a comment

#### Scenario: Different files on a later run
- **WHEN** the merge request already has the comment, and the files too large are different
- **THEN** the system updates that comment to list the current files, and creates no other comment

#### Scenario: No file is too large any more
- **WHEN** the merge request has the comment, and the findings file has no file with the reason `too_large`
- **THEN** the system updates the comment to say that every changed file was reviewed

#### Scenario: Only generated files
- **WHEN** the findings file has only files with the reason `generated`, and the merge request has no such comment
- **THEN** the system creates no comment

#### Scenario: Creating the comment fails
- **WHEN** the GitLab API rejects the request to create or update the comment
- **THEN** the system writes one `warn` log line and continues
