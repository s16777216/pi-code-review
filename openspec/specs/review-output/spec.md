## Purpose

The GitLab sink adapter for the `ReviewEngine`. Publishes the engine's findings where a human will see them: inline merge request comments.

## Requirements

### Requirement: Publish findings as inline merge request comments
The system SHALL create one GitLab merge request discussion per valid finding, at the finding's file and line, except in the cases below. A finding whose `relatesTo` names an open discussion MUST NOT create a discussion. A finding whose `relatesTo` names a resolved discussion SHALL become a reply in that discussion, and the system SHALL reopen it. A finding with no `relatesTo` SHALL be handled in the same way when a discussion from this tool has the same anchor.

#### Scenario: Valid finding becomes an inline comment
- **WHEN** the system has a valid finding for a changed file and line
- **THEN** the system creates a merge request discussion at that file and line, with the finding's severity and summary in the comment body

#### Scenario: Discussion creation fails for one finding
- **WHEN** the GitLab API rejects one finding's discussion
- **THEN** the system logs the failure and continues publishing the remaining findings

#### Scenario: Finding relates to an open discussion
- **WHEN** a finding's `relatesTo` names a discussion that is not resolved
- **THEN** the system does not create a discussion or a reply for that finding

#### Scenario: Finding relates to a resolved discussion
- **WHEN** a finding's `relatesTo` names a resolved discussion
- **THEN** the system adds a reply with the finding's severity and summary to that discussion, and marks the discussion as not resolved

#### Scenario: Reopening a discussion fails
- **WHEN** the system adds the reply, and the GitLab API rejects the request to reopen the discussion
- **THEN** the system keeps the reply, writes one `warn` log line, and continues

#### Scenario: Finding relates to a discussion that no longer exists
- **WHEN** a finding's `relatesTo` names an ID that is not in the merge request's discussions
- **THEN** the system creates a new discussion for that finding

#### Scenario: Finding matches an open discussion from this tool by anchor
- **WHEN** a finding has no `relatesTo`, and an open discussion from this tool has the same anchor
- **THEN** the system does not create a discussion for that finding

#### Scenario: Finding matches a resolved discussion from this tool by anchor
- **WHEN** a finding has no `relatesTo`, and only a resolved discussion from this tool has the same anchor
- **THEN** the system adds a reply with the finding's severity and summary to that discussion, and marks the discussion as not resolved

#### Scenario: Finding matches an open and a resolved discussion by anchor
- **WHEN** a finding has no `relatesTo`, and both an open and a resolved discussion from this tool have the same anchor
- **THEN** the system does not create a discussion or a reply for that finding

#### Scenario: Finding matches two resolved discussions by anchor
- **WHEN** a finding has no `relatesTo`, and two resolved discussions from this tool have the same anchor
- **THEN** the system replies in, and reopens, the one that comes last in the merge request's list of discussions

#### Scenario: Finding is on the same line as a person's discussion
- **WHEN** a finding has no `relatesTo`, and a discussion from a person is on the same line
- **THEN** the system creates a new discussion for that finding

#### Scenario: Existing discussions cannot be read
- **WHEN** the GitLab API returns an error for the request that lists the discussions
- **THEN** the system writes one `warn` log line and creates a new discussion for every finding

### Requirement: Mark comments posted by this tool
The system SHALL start the body of each discussion that it creates with the marker `<!-- pi-code-review -->`. The marker is an HTML comment, so GitLab does not show it in the rendered comment.

#### Scenario: A posted comment carries the marker
- **WHEN** the system creates a discussion for a finding
- **THEN** the discussion body starts with `<!-- pi-code-review -->`, followed by the severity and the summary

### Requirement: Record the anchor in each posted comment
The system SHALL write the finding's anchor into the hidden marker of each discussion and reply that it creates, as `<!-- pi-code-review anchor=<anchor> -->`.

#### Scenario: A posted comment carries the anchor
- **WHEN** the system creates a discussion for a finding with the anchor `3f9a1c0b2d4e5f60`
- **THEN** the discussion body starts with `<!-- pi-code-review anchor=3f9a1c0b2d4e5f60 -->`

### Requirement: Count skipped findings toward pass or fail
The system SHALL decide pass or fail from every finding in the findings file. A finding for which the system creates no discussion MUST count toward the decision.

#### Scenario: Every finding relates to an open discussion
- **WHEN** every finding relates to an open discussion, one finding has severity `high`, and the threshold is `high`
- **THEN** the system creates no discussion, and the `publish` command exits with a non-zero code

### Requirement: Resolve discussions declared fixed
For each fixed declaration in the findings file, the system SHALL add a reply with the reason to the discussion, and then resolve the discussion. The text of the reply SHALL come from the resolved template. The system MUST NOT resolve a discussion that this tool did not start. A failure for one declaration MUST NOT stop the others.

#### Scenario: Declared discussion is resolved
- **WHEN** the findings file declares an open discussion from this tool as fixed
- **THEN** the system adds a reply that starts with the marker and contains the reason, and then resolves the discussion

#### Scenario: Discussion was resolved after the review
- **WHEN** the findings file declares a discussion as fixed, and the discussion is already resolved at publish time
- **THEN** the system adds no reply and makes no change

#### Scenario: Discussion no longer exists
- **WHEN** the findings file declares a discussion as fixed, and the discussion is not in the merge request at publish time
- **THEN** the system writes one `warn` log line and continues

#### Scenario: Discussion was not started by this tool
- **WHEN** the findings file declares a discussion that has no marker at publish time
- **THEN** the system does not reply to or resolve that discussion, and writes one `warn` log line

#### Scenario: Resolve request fails
- **WHEN** the system adds the reply, and the GitLab API rejects the resolve request
- **THEN** the system keeps the reply, writes one `warn` log line, and continues with the other declarations

#### Scenario: Pass or fail ignores declarations
- **WHEN** the findings file has declarations and findings
- **THEN** the system decides pass or fail from the findings only

#### Scenario: Reply uses the resolved template
- **WHEN** a resolved template is set, and the findings file declares an open discussion from this tool as fixed
- **THEN** the reply starts with the marker line, and then has the text that the resolved template gives

### Requirement: Merge findings on the same line into one comment
After the system decides what to do with each finding, it SHALL create one discussion for all findings that would each create a discussion on the same file and line, and one reply for all findings that would each reply to the same discussion. The comment MUST start with one marker line, followed by one paragraph for each finding, in findings file order. The finding template SHALL give the text of each paragraph. The system MUST join the paragraphs with one blank line, and a template MUST NOT change how the system joins them.

#### Scenario: Two findings on the same line
- **WHEN** two findings without `relatesTo` are on the same file and line, and no discussion from this tool has their anchor
- **THEN** the system creates one discussion at that position, whose body has the marker line and then both findings, each with its own severity

#### Scenario: Two findings on different lines with the same text
- **WHEN** two findings are on different lines of the same file, and the two lines have the same text
- **THEN** the system creates one discussion for each finding

#### Scenario: Two findings reply to the same discussion
- **WHEN** two findings would each reply to the same resolved discussion
- **THEN** the system adds one reply with both findings, and reopens the discussion once

#### Scenario: One finding in a group
- **WHEN** only one finding would create a discussion at a file and line
- **THEN** the discussion body is the marker line followed by that finding's paragraph

#### Scenario: Merged findings use the finding template
- **WHEN** `FINDING.md` contains `- ${summary}`, and two findings are on the same file and line
- **THEN** the discussion body is the marker line, then `- ` and the first summary, then a blank line, then `- ` and the second summary

#### Scenario: Template cannot change the marker
- **WHEN** `FINDING.md` contains the text `<!-- pi-code-review anchor=0000000000000000 -->`
- **THEN** the first line of the discussion body is still the marker line that the system writes, with the anchor of the finding

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
### Requirement: Render comments from templates
The system SHALL build the text of a finding and the text of a resolved reply from a template. A template is a plain-text file in the template directory: `FINDING.md` for one finding, and `RESOLVED.md` for a resolved reply. The built-in templates are the files `FINDING.md` and `RESOLVED.md` that the package ships. A file with the same name in the template directory replaces the built-in file. When a built-in file is missing or not valid, the system MUST stop with an error that names the file, and MUST NOT use other text.

A template SHALL fill these placeholders: `${severity}`, `${summary}`, `${file}`, and `${line}` in `FINDING.md`, and `${reason}` in `RESOLVED.md`. The text `\${` stands for a literal `${`. All other text is plain text and the system MUST NOT change it. This includes any other `${name}`, `$name`, a lone `$`, `{`, `}`, and a backslash that is not followed by `${`. A placeholder reads only the value of the finding or of the fixed declaration, and MUST NOT read an environment variable. The system SHALL read a template file as UTF-8 text, convert each CRLF line break to LF, and remove the line breaks at its end.

#### Scenario: No template directory
- **WHEN** no template directory is set, and a finding has severity `high` and summary `Null check missing`
- **THEN** the paragraph for that finding is `**Severity**: high`, a blank line, and `**Reason**: Null check missing`

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

### Requirement: Check templates before publishing
The system SHALL check each template that it reads before it creates, replies to, or updates anything on the host. A template is not valid when `FINDING.md` has no `${summary}`, when `RESOLVED.md` has no `${reason}`, or when the file cannot be read as UTF-8 text. The template directory is not valid when it does not exist. The system SHALL check the built-in template files in the same way. An escaped `\${summary}` or `\${reason}` MUST NOT count as the main field. The system MUST stop when a template or the template directory is not valid, and MUST report an error that names the file or the directory and the cause.

When a template has a text of the form `${name}` that is not an escape and is not a placeholder of that file, the system SHALL write one `warn` log line for the file that names the file and the text, and SHALL continue. In this check, `name` is a sequence of letters, digits, and underscores that starts with a letter or an underscore.

#### Scenario: Template without the main field
- **WHEN** `FINDING.md` has no `${summary}`
- **THEN** the system stops before it calls the host API, and reports an error that names `FINDING.md` and `${summary}`

#### Scenario: Resolved template without the main field
- **WHEN** `RESOLVED.md` has no `${reason}`
- **THEN** the system stops before it calls the host API, and reports an error that names `RESOLVED.md` and `${reason}`

#### Scenario: Main field is only escaped
- **WHEN** `FINDING.md` contains `\${summary}` and no other `${summary}`
- **THEN** the system stops before it calls the host API, and reports an error that names `FINDING.md` and `${summary}`

#### Scenario: Misspelled placeholder
- **WHEN** `FINDING.md` contains `${summary} ${severty}`
- **THEN** the system writes one `warn` log line that names `FINDING.md` and `${severty}`, and publishes with the template

#### Scenario: Escaped text raises no warning
- **WHEN** `FINDING.md` contains `${summary} \${HOME}`
- **THEN** the system writes no `warn` log line for the template

#### Scenario: Template directory is missing
- **WHEN** the template directory does not exist
- **THEN** the system stops before it calls the host API, and reports an error that names the directory

#### Scenario: Template file cannot be read
- **WHEN** `FINDING.md` exists but the system cannot read it
- **THEN** the system stops before it calls the host API, and reports an error that names `FINDING.md`

#### Scenario: Valid templates
- **WHEN** every template in the directory is valid
- **THEN** the system publishes with those templates
