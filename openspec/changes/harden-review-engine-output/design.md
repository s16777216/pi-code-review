# Design

## Context

`AgentReviewEngine.review` sends one prompt to one agent and parses the last assistant message. Three small functions shape the result:

- `buildReviewPrompt` (`prompt.ts`) prints each file's raw hunk text.
- `parseFindings` (`findings.ts`) parses the JSON array and throws `ReviewFailureError` on the first bad field.
- `isValidNewFileLine` (`diff.ts`) filters the findings. It returns a boolean, so the engine cannot tell why a finding failed.

See `proposal.md` for the motivation.

## Goals / Non-Goals

**Goals:**
- Give the agent the exact new-file line number for each line it can comment on.
- Keep every valid finding when a sibling finding is invalid.
- Make each dropped finding visible in the default log output.

**Non-Goals:**
- Replace the free-text JSON output with a `report_findings` tool. See Decision 4.
- Change how `pre_existing` findings are filtered. Whether to keep that severity needs a separate decision.
- Split large merge requests into batches, or cap the size of `get_file_content` results.
- Retry a failed agent run.
- Rewrite the system prompt beyond the one sentence about line numbers.

## Decisions

### Decision 1: Number the lines in the prompt, not in the parser

`diff.ts` gets a function `numberDiffHunks(hunks)`. It keeps each `@@` header as it is. It prefixes each added and context line with its new-file line number and a `|` separator. It prefixes each removed line with spaces of the same width. The diff marker (`+`, `-`, space) stays after the separator.

```
@@ -10,3 +10,4 @@
  10 |  const a = 1;
  11 | +const b = 2;
     | -const c = 3;
  12 |  return a;
```

The system prompt gets one sentence: the number before `|` is the new-file line number, and it is not part of the code. The agent MUST report that number in `line`.

Alternatives:
- Send raw hunks and ask the agent to count. This is the current behavior and the source of the problem.
- Send both the raw and the numbered hunks. This doubles the tokens and gives the agent two sources that can disagree.

### Decision 2: Drop an invalid finding, keep a failed parse

`parseFindings(text, logger?)` still throws `ReviewFailureError` when the text is not valid JSON or is not an array. Inside the array, it validates each element on its own. An invalid element produces one `warn` log line and is skipped.

Whole-output failure stays strict. If the output has no usable structure, the engine has nothing to trust, and an empty result would look like "no bugs found".

Alternatives:
- Return `{ findings, dropped }` and let the caller log. This changes the return type for every caller and test. The optional logger argument keeps old call sites valid.
- Also tolerate bad JSON. A review that silently returns nothing is worse than a visible failure.

### Decision 3: Return the discard reason from the diff check

`diff.ts` gets `checkNewFileLine(files, path, line)`. It returns `'ok'`, `'file_not_changed'`, or `'line_not_in_diff'`. `isValidNewFileLine` stays as a thin wrapper, so existing tests and callers do not change. The engine logs one `warn` line per discarded finding with `file`, `line`, and `reason`.

The level is `warn` because pino shows it at the default `info` level. The user sees the line without `--debug`.

### Decision 4: Defer the structured-output tool

A `report_findings` tool would let the model schema validate each finding. It also changes the agent protocol: the engine would read tool calls instead of text, and every test fake would need an update. Decision 2 already removes the all-or-nothing failure, which was the main reason for the tool. The tool can come in a later change if invalid findings are still common in real runs. The new `warn` lines give the data to decide.

## Risks / Trade-offs

- [The agent copies the number gutter into a summary or confuses it with code] → The system prompt names the gutter, and the `|` separator keeps it visually apart. Tests check the prompt text.
- [The prompt grows by about 7 characters per line] → Accepted. The cost is small next to the hunk text.
- [The agent still reports a wrong line] → The diff check still discards it, and the new log line shows it.
- [Dropping an invalid finding hides a model that often breaks the format] → Each drop logs a `warn` line. The user can count them.
- [The number formatter duplicates the hunk walk in `parseDiffHunks`] → Share the `HUNK_HEADER` pattern and keep the two functions next to each other, with tests for both on the same input.

## Open Questions

- None that change the specs or the tasks.
