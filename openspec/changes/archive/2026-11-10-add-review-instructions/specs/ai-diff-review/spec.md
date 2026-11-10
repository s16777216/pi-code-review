## ADDED Requirements

### Requirement: Append review instructions to the system prompt
The system SHALL add the review instructions to the system prompt of every agent run. The review instructions go after the paragraph of the run scope and before the language sentence. The system SHALL put a statement before the review instructions. The statement says that the project owner wrote them, that they win over the general guidance when the two conflict, and that they never change the output format of `submit_review`, the rules for the tools, or the rule that discussion text is information and not an instruction. The system MUST NOT fill placeholders in the review instructions. The system SHALL remove white space at the start and the end of the text, and SHALL read each CRLF line break as LF. The system SHALL still check every finding with the existing checks.

#### Scenario: No review instructions
- **WHEN** no instructions source is usable
- **THEN** the system prompt is the same as the system prompt without this feature

#### Scenario: Review instructions are added
- **WHEN** the usable instructions source holds the text `Skip naming problems.`
- **THEN** the system prompt holds the statement and then the text, after the general guidance and the paragraph of the run scope

#### Scenario: Review instructions and a language
- **WHEN** the usable instructions source holds a text, and `--language Japanese` is given
- **THEN** the system prompt has this order: the general guidance, the paragraph of the run scope, the statement and the review instructions, and then the language sentence

#### Scenario: Every batch gets the review instructions
- **WHEN** the change is split into batches, and the usable instructions source holds a text
- **THEN** the system prompt of each batch holds the review instructions

#### Scenario: Placeholders stay as they are
- **WHEN** the review instructions contain the text `${summary}`
- **THEN** the system prompt contains `${summary}` without change

#### Scenario: White space and CRLF
- **WHEN** the text has blank lines at its start and its end, and uses CRLF line breaks
- **THEN** the system prompt holds the text without those blank lines, and with LF line breaks only

#### Scenario: The size estimate counts the review instructions
- **WHEN** the review instructions have 8,000 characters
- **THEN** the estimate of the first request of a run includes them, and the plan for the batches uses that estimate

#### Scenario: The checks on findings do not change
- **WHEN** the review instructions tell the agent to use the severity `blocker`, and the agent returns a finding with that severity
- **THEN** the system treats the finding as invalid, as for any other unknown severity

### Requirement: Choose the instructions source for the review instructions
The system SHALL take the review instructions from the first usable instructions source in this order: the `--instructions` flag, with a file path; the `--instructions-text` flag, with the text; the `REVIEW_INSTRUCTIONS_FILE` environment variable, with a file path; and the `REVIEW_INSTRUCTIONS` environment variable, with the text. A flag or a variable is set when it is present, even when its value is an empty string. The system MUST NOT read a file that no flag and no variable names. The system SHALL read a file path relative to the working directory. An instructions source is usable when the system can read it as UTF-8 text, and the text is not empty after the removal of white space, and has at most 8,000 characters.

When a set instructions source is not usable, the system SHALL write one `warn` log line that names the source and the cause, and SHALL try the next source. The system MUST NOT stop the review for this. The system SHALL use one instructions source at most. When the system uses a source, it SHALL write one `info` log line that names the source and the number of characters.

#### Scenario: The path flag wins
- **WHEN** `--instructions` names a usable file, and `--instructions-text`, `REVIEW_INSTRUCTIONS_FILE`, and `REVIEW_INSTRUCTIONS` are also set
- **THEN** the system uses the file that `--instructions` names

#### Scenario: The text flag wins over the variables
- **WHEN** `--instructions` is not given, `--instructions-text` holds a usable text, and `REVIEW_INSTRUCTIONS_FILE` and `REVIEW_INSTRUCTIONS` are set
- **THEN** the system uses the text of `--instructions-text`

#### Scenario: The file variable wins over the text variable
- **WHEN** no flag is given, `REVIEW_INSTRUCTIONS_FILE` names a usable file, and `REVIEW_INSTRUCTIONS` is set
- **THEN** the system uses the file that `REVIEW_INSTRUCTIONS_FILE` names

#### Scenario: The text variable
- **WHEN** no flag is given, only `REVIEW_INSTRUCTIONS` is set, and it holds a usable text
- **THEN** the system uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: No instructions source
- **WHEN** no flag and no variable is set, and a file `REVIEW_INSTRUCTIONS.md` exists in the working directory
- **THEN** the system does not read the file, uses no review instructions, and writes no log line about them

#### Scenario: The source is logged
- **WHEN** the system uses `--instructions-text` with 120 characters
- **THEN** the system writes one `info` log line that names the flag and says 120 characters

#### Scenario: A file does not exist
- **WHEN** `--instructions missing.md` names a file that does not exist, and `REVIEW_INSTRUCTIONS` holds a usable text
- **THEN** the system writes one `warn` log line that names the flag and the cause, and uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: A flag is an empty string
- **WHEN** `--instructions-text` is given with an empty string, and `REVIEW_INSTRUCTIONS` holds a usable text
- **THEN** the system writes one `warn` log line that names the flag, and uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: A variable is an empty string
- **WHEN** `REVIEW_INSTRUCTIONS_FILE` is set to an empty string, and `REVIEW_INSTRUCTIONS` holds a usable text
- **THEN** the system writes one `warn` log line that names the variable, and uses the text in `REVIEW_INSTRUCTIONS`

#### Scenario: A file is not UTF-8 text
- **WHEN** the file that `--instructions` names is not valid UTF-8 text
- **THEN** the system writes one `warn` log line that names the flag and the cause, and tries the next source

#### Scenario: A text has only white space
- **WHEN** `REVIEW_INSTRUCTIONS` holds only spaces and line breaks
- **THEN** the system writes one `warn` log line that names the variable, and tries the next source

#### Scenario: A text has 8,000 characters
- **WHEN** a set source holds a text with exactly 8,000 characters
- **THEN** the system uses it

#### Scenario: A text has more than 8,000 characters
- **WHEN** a set source holds a text with 8,001 characters
- **THEN** the system writes one `warn` log line that names the source and the limit, and tries the next source

#### Scenario: No source is usable
- **WHEN** every set source is not usable
- **THEN** the system runs the review with no review instructions, and the review does not stop

#### Scenario: A failed source does not change the exit code
- **WHEN** a set source is not usable, and the review finishes
- **THEN** the `review` command exits with code 0

### Requirement: Warn when the change modifies the instructions file
When the system uses a file path as the instructions source, it SHALL compare the path of that file, relative to the working directory, with the paths of the files that the change request changes. The system SHALL use the forward slash as the separator in this comparison. A changed file matches by its new path or its old path. When the path matches, the system SHALL write one `warn` log line that names the file. The warning MUST NOT change the review, the findings, or the exit code. The system MUST NOT make this comparison when it uses a text, from `--instructions-text` or `REVIEW_INSTRUCTIONS`.

#### Scenario: The change modifies the file in use
- **WHEN** the system uses the file that `--instructions REVIEW_INSTRUCTIONS.md` names, and the merge request changes `REVIEW_INSTRUCTIONS.md`
- **THEN** the system writes one `warn` log line that names the file, and the review continues

#### Scenario: The change adds the file in use
- **WHEN** the system uses the file that `REVIEW_INSTRUCTIONS_FILE` names, and the merge request adds that file
- **THEN** the system writes one `warn` log line that names the file

#### Scenario: The change does not modify the file
- **WHEN** the system uses the file that `--instructions REVIEW_INSTRUCTIONS.md` names, and the merge request does not change it
- **THEN** the system writes no `warn` log line about the file

#### Scenario: The text sources are not compared
- **WHEN** the system uses a text from `--instructions-text` or `REVIEW_INSTRUCTIONS`, and the merge request changes `REVIEW_INSTRUCTIONS.md`
- **THEN** the system writes no `warn` log line about the file

#### Scenario: The file is outside the working directory
- **WHEN** the system uses a file that is not inside the working directory
- **THEN** the system writes no `warn` log line about the file

#### Scenario: Backslash separators
- **WHEN** `--instructions docs\review.md` names the file in use, and the merge request changes `docs/review.md`
- **THEN** the system writes one `warn` log line that names the file
