## MODIFIED Requirements

### Requirement: Render comments from templates
The system SHALL build the text of a finding and the text of a resolved reply from a template. A template is a plain-text file in the template directory: `FINDING.md` for one finding, and `RESOLVED.md` for a resolved reply. The built-in templates are the files `FINDING.md` and `RESOLVED.md` that the package ships. A file with the same name in the template directory replaces the built-in file. When a built-in file is missing or not valid, the system MUST stop with an error that names the file, and MUST NOT use other text.

A template SHALL fill these placeholders: `${severity}`, `${confidence}`, `${summary}`, `${file}`, and `${line}` in `FINDING.md`, and `${reason}` in `RESOLVED.md`. The text `\${` stands for a literal `${`. All other text is plain text and the system MUST NOT change it. This includes any other `${name}`, `$name`, a lone `$`, `{`, `}`, and a backslash that is not followed by `${`. A placeholder reads only the value of the finding or of the fixed declaration, and MUST NOT read an environment variable. The system SHALL read a template file as UTF-8 text, convert each CRLF line break to LF, and remove the line breaks at its end.

#### Scenario: No template directory
- **WHEN** no template directory is set, and a finding has severity `high`, confidence `medium`, and summary `Null check missing`
- **THEN** the paragraph for that finding is `**Severity**: high`, a line break, a line with two spaces, a line break, `**Confidence**: medium`, a line break, a line with two spaces, a line break, `**Reason**: Null check missing`, a line break, an empty line, a line break, and `---`

#### Scenario: Custom template with the confidence
- **WHEN** `FINDING.md` contains `${confidence}: ${summary}`, and a finding has confidence `low` and summary `Null check missing`
- **THEN** the paragraph for that finding is `low: Null check missing`

#### Scenario: Default resolved reply
- **WHEN** no template directory is set, and a fixed declaration has the reason `The check was added`
- **THEN** the reply text after the marker line is `**Resolved**: The check was added`

#### Scenario: Built-in file is missing
- **WHEN** a built-in template file is missing from the package
- **THEN** the system stops before it calls the host API, and reports an error that names the file

#### Scenario: Template file has CRLF line breaks
- **WHEN** a template file uses CRLF line breaks
- **THEN** the filled text uses LF line breaks only

#### Scenario: Custom finding template
- **WHEN** `FINDING.md` contains `${severity}: ${summary} (${file}:${line})`, and a finding has severity `high`, summary `Null check missing`, file `src/a.ts`, and line `12`
- **THEN** the paragraph for that finding is `high: Null check missing (src/a.ts:12)`

#### Scenario: Custom resolved template
- **WHEN** `RESOLVED.md` contains `已修正:${reason}`, and a fixed declaration has the reason `The check was added`
- **THEN** the reply text after the marker line is `已修正:The check was added`

#### Scenario: Template file is missing
- **WHEN** the template directory has `FINDING.md` but no `RESOLVED.md`
- **THEN** the system uses the file from the directory for findings, and the built-in file for resolved replies

#### Scenario: Escaped placeholder
- **WHEN** a template contains `\${summary}` and `${summary}`, and a finding has the summary `Fix it`
- **THEN** the filled text is `${summary}` and `Fix it`

#### Scenario: Backslash elsewhere
- **WHEN** a template contains `C:\dir\${summary}`, and a finding has the summary `Fix it`
- **THEN** the filled text is `C:\dir${summary}`

#### Scenario: Other backslashes are plain text
- **WHEN** a template contains `C:\dir\file and \d+ and ${summary}`, and a finding has the summary `Fix it`
- **THEN** the filled text is `C:\dir\file and \d+ and Fix it`

#### Scenario: Dollar signs and braces are plain text
- **WHEN** `FINDING.md` contains `costs $5 { "text": "${summary}" } $`, and a finding has the summary `Fix it`
- **THEN** the filled text is `costs $5 { "text": "Fix it" } $`

#### Scenario: Other names are plain text
- **WHEN** a template contains `uses $HOME and ${HOME} and ${summary}`, and the environment has a variable `HOME`
- **THEN** the filled text keeps `$HOME` and `${HOME}` as they are, and fills only `${summary}`

#### Scenario: Placeholder of the other file
- **WHEN** `RESOLVED.md` contains `${summary} ${reason}`
- **THEN** the filled text keeps `${summary}` as it is, and fills only `${reason}`

#### Scenario: Text of a finding contains a placeholder
- **WHEN** a finding's summary contains the text `${severity}`
- **THEN** the filled text contains that text without change, and the system does not fill it a second time

### Requirement: Keep one review status comment
The system SHALL keep one general merge request comment from this tool that starts with `<!-- pi-code-review unreviewed -->`. This comment is the review status comment. The system SHALL create it when the findings file has a `failed` object, a warning, an unreviewed file with the reason `too_large`, or a count of findings that the confidence threshold let pass (see the capability `review-gate`) that is more than 0, and the merge request has no such comment. The system SHALL update that comment instead of creating a second one. The body is the marker line, then these parts in this order, each as a separate paragraph: the failure text, one warning text for each warning code that the file has, the list of files too large to review, and the line for the count. The line for the count is `**Gate:** Findings that met the severity threshold but not the confidence threshold: N.`, where `N` is the count. The system MUST leave the line out when the count is 0. Files with the reason `generated` MUST NOT be listed. The failure text, the warning texts, the paths, and the count MUST be the only content that the system takes from the findings file and the gate decision. The text of an error MUST NOT be in the comment. A failure MUST NOT stop `publish`.

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

#### Scenario: Findings let pass by the confidence threshold
- **WHEN** two findings meet the severity threshold and not the confidence threshold, the findings file has no `failed` object, no warning, and no file too large, and the merge request has no such comment
- **THEN** the system creates the comment with the marker line, the line `**Gate:** Findings that met the severity threshold but not the confidence threshold: 2.`, and the sentence that every changed file was reviewed

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
