## Why

A real review showed two weak points in the quality of a finding. One finding pointed at the line that opens a `watch(` call. The problem was on a changed line three lines below. Another finding said that a call has no argument, but the code on that line has the argument. The verification step did not reject it, and no log shows why. See the checks in the grill of this change: 5 of 6 lines were exact, and 1 was not.

## What Changes

- The system prompt of the review agents tells the agent to report the line that holds the problem. For a problem in lines that the diff adds or changes, the line is in that run of added or changed lines, not a context line outside it. For a problem in code that the diff does not change, the line is the line of that code. The agent does not report the line that opens the function, block, or call around the problem, unless that line holds the problem.
- The system prompt of the verifier tells the verifier to quote the code that shows its verdict in the `reason`. It also tells the verifier to use `rejected` when the code contradicts the summary, for example when the code already does what the summary says is missing.
- With `--debug`, the system writes one `debug` log line for every verdict, `confirmed` too. Today only `rejected` and `uncertain` verdicts have a log line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-diff-review`: add the rule for the line of a finding in the review prompt; add the evidence rule in the verifier prompt; the log of the verification step gets the `debug` line for each verdict.

## Impact

- Code: `src/core/review/engine.ts` (the review prompt and the log line), `src/core/review/verify.ts` (the verifier prompt).
- The golden file `src/core/review/__golden__/review-output.txt` changes, because it pins the prompts.
- No change to the findings file, to the tools, to the checks on a verdict, or to the settings. The verifier still cannot change a line.
- The README text about the verification step and the debug log gets a short update.
- The change does not guarantee a correct line or a correct verdict. A prompt is guidance, and the code does not check it.
