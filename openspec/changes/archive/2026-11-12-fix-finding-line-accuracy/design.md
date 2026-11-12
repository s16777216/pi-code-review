## Context

`SYSTEM_PROMPT` in `src/core/review/engine.ts` tells the agent that `line` is "the number shown before `|` on that line of the diff". It does not say which line of the problem to pick. `VERIFY_SYSTEM_PROMPT` in `src/core/review/verify.ts` defines the three verdicts and the severity rules. It says nothing about the content of the `reason`.

The check on a line (`lineCheck` in `ChangeSet`) accepts any line that is in the diff, also a context line. `applyVerdicts` changes only the severity of a finding. The verification step logs `rejected` and `uncertain` verdicts at `info` level. It logs no `confirmed` verdict.

See `proposal.md` for the motivation and `specs/ai-diff-review/spec.md` for the requirements.

## Goals / Non-Goals

**Goals:**
- Make the line of a finding point at the problem more often.
- Make a verifier reject a finding that the code contradicts, and show its evidence.
- Let a person read the reason of every verdict afterwards.

**Non-Goals:**
- A change of the line by the verifier. The line stays as the review agent reported it.
- A check in code of the line, or of the quote in a reason. A check on the line would need a rule for "the line of the problem", and no simple rule is right for all code.
- A change of the meaning of `uncertain`. A finding with the verdict `uncertain` stays.
- A log line at `info` level for each verdict. It makes the CI log longer.

## Decisions

### Decision 1: The line rule is in `SYSTEM_PROMPT`, once, for every review agent

`SYSTEM_PROMPT` is the base of the prompt of all three review focuses and of every batch. One new paragraph there reaches every run. The paragraph says four things. Report the line that holds the problem. For a problem in lines that the diff adds or changes, stay in that run of added or changed lines, and not in a context line outside it. For a problem in code that the diff does not change (a `pre_existing` problem, or a problem that the change causes in other code), report the line of that code. Do not report the line that opens the function, block, or call around the problem, unless that line holds the problem. The run of added or changed lines is not the hunk. A hunk also holds context lines, and the first line of the hunk was a context line in the case that started this change.

The paragraph goes right after the sentence that defines `line` in the description of `submit_review`, in the last paragraph of `SYSTEM_PROMPT`, so the agent reads the rule where it learns the field. The text of the review focus paragraphs does not change.

Alternative: a check in code that rejects a finding on the first line of a hunk. This is not reliable. A hunk can start on the line that holds the problem. The data of the real run showed 5 of 6 findings on the exact line, so a rule in code would reject more right findings than wrong ones.

### Decision 2: The verifier asks for a quote, and rejects a contradicted summary

`VERIFY_SYSTEM_PROMPT` gets two sentences in the part about the verdicts. The first says that the `reason` quotes the code that shows the verdict, from the line of the finding or from a line near it. The second says to use `rejected` when the code contradicts the summary. It gives the example from the real run: the summary says that an argument is missing, and the code has the argument.

The tool `submit_verdicts` and `validateVerdicts` do not change. The `reason` is still "one sentence that is not empty". A quote fits in one sentence. The code cannot check that a `reason` has a quote, and the spec says so.

Alternative: force the verifier to call `get_file_content` at least once before it can give a verdict. This needs a change in the tool logic and in the spec. The diff of the file is already in the first request of the verifier. The problem in the real run was not a missing read, because the code was in the diff.

### Decision 3: Log each verdict at `debug` level in `verify()`

`verify()` in `engine.ts` already loops over the `AppliedVerdict` entries of each file. The new code writes one `logger.debug` line for each entry, with `file`, `line`, `verdict`, `severity` (the reviewed severity), and `reason`. The line comes from `item.original`, and the severity from `item.result` or, for a rejected finding, from `item.verdict.severity`. The message is `verification step verdict`.

The `debug` level means that a normal CI log does not change. `--debug` already logs the prompts, so the person who runs `--debug` expects the extra lines.

Alternative: log at `info` level. A review with 60 findings would add 60 lines to every CI log, and the `info` log already has the lines for `rejected` and `uncertain` verdicts.

### Decision 4: Regenerate the golden file

The golden file pins `SYSTEM_PROMPT`, and so the two prompt changes change it. Regenerate it with `UPDATE_GOLDEN=1`. It must keep LF line breaks.

## Risks / Trade-offs

- [A prompt is guidance and the model can ignore it] → The change reduces the problem and does not remove it. The `debug` lines of Decision 3 let a person see the next case and decide on a stronger rule.
- [The verifier can reject too much when told to reject a contradicted summary] → The prompt limits the rule to a contradiction that the code shows. The verdict `uncertain` stays for the cases in which the verifier cannot decide.
- [A quote makes the `reason` longer, and so the answer uses more output tokens] → One short quote for each finding. The retry for the token limit already covers a verifier run that is cut.
- [The rule for the changed lines can make an agent move a finding about unchanged code onto a changed line] → The second rule covers unchanged code. The first sentence of the paragraph has priority.

## Migration Plan

No migration. The findings file does not change. Rollback is a revert of the two prompts and the log line.

## Pending local documentation

No local `SPEC.md` needs a change. The change adds no file and does not change the responsibility of a file. The sentences in `src/core/review/SPEC.md` about `engine.ts` and `verify.ts` stay true.
