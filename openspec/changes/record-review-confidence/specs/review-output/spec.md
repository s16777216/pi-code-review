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

#### Scenario: Finding with no confidence
- **WHEN** `FINDING.md` contains `${confidence}: ${summary}`, and a finding from an older findings file has no confidence and summary `Null check missing`
- **THEN** the paragraph for that finding is `unknown: Null check missing`

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
