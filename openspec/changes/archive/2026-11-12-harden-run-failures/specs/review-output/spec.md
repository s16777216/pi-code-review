## RENAMED Requirements

- FROM: `### Requirement: Keep one comment that lists files too large to review`
- TO: `### Requirement: Keep one review status comment`

## MODIFIED Requirements

### Requirement: Keep one review status comment
The system SHALL keep one general merge request comment from this tool that starts with `<!-- pi-code-review unreviewed -->`. This comment is the review status comment. The system SHALL create it when the findings file has a `failed` object, a warning, or an unreviewed file with the reason `too_large`, and the merge request has no such comment. The system SHALL update that comment instead of creating a second one. The body is the marker line, then these parts in this order, each as a separate paragraph: the failure text, one warning text for each warning code that the file has, and the list of files too large to review. Files with the reason `generated` MUST NOT be listed. The failure text, the warning texts, and the paths MUST be the only content that the system takes from the findings file. The text of an error MUST NOT be in the comment. A failure MUST NOT stop `publish`.

The failure text is `**Review failed:**`, then one sentence for the category, then `No finding was posted.` The sentences are: for `model_failed`, "A model call failed after 3 tries."; for `output_cut`, "The model output was cut at the token limit, also after one retry with a larger limit."; for `too_large`, "The change is too large for the context window of the model."; for `other`, "The review stopped because of an error. See the job log."

The warning texts are `**Warning:**` and: for `deduplication_failed`, "The step that removes duplicate findings failed. Some comments may repeat."; for `verification_failed`, "The check of the findings failed for these files. Their findings are not verified:" and the list of paths; for `verification_skipped`, "These files are too large for the check of the findings. Their findings are not verified:" and the list of paths.

The body ends with the sentence "Every changed file was reviewed in the latest review." when the review did not fail and no file is too large.

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
- **WHEN** the merge request has the comment, and the findings file has no file with the reason `too_large`, no warning, and no `failed` object
- **THEN** the system updates the comment to say that every changed file was reviewed

#### Scenario: Only generated files
- **WHEN** the findings file has only files with the reason `generated`, and the merge request has no such comment
- **THEN** the system creates no comment

#### Scenario: Creating the comment fails
- **WHEN** the GitLab API rejects the request to create or update the comment
- **THEN** the system writes one `warn` log line and continues

#### Scenario: The review failed
- **WHEN** the findings file has `failed` with the category `output_cut`
- **THEN** the system creates or updates the comment with the marker line and the failure text for `output_cut`, and the body does not say that every changed file was reviewed

#### Scenario: The review has a warning
- **WHEN** the findings file has one warning with the code `deduplication_failed`, and no file is too large
- **THEN** the system creates or updates the comment with the marker line, the warning text for `deduplication_failed`, and the sentence that every changed file was reviewed

#### Scenario: A verification warning lists the files
- **WHEN** the findings file has two warnings with the code `verification_failed` for `src/a.ts` and `src/b.ts`
- **THEN** the body holds one warning text for `verification_failed` that lists both paths

#### Scenario: The comment from an earlier run is updated
- **WHEN** the merge request has a comment that lists a file too large from an earlier run, and the new findings file has a `failed` object
- **THEN** the system updates that comment and creates no second comment

#### Scenario: The failure comment becomes a clean status
- **WHEN** the merge request has a comment with a failure text, and the new findings file has no `failed` object, no warning, and no file too large
- **THEN** the system updates the comment to say that every changed file was reviewed

#### Scenario: The comment has no error text
- **WHEN** the review failed with an error whose text names an internal host name
- **THEN** the body of the comment does not hold that text
