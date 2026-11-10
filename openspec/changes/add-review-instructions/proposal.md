## Why

A team cannot tell the `review` command what to look for. The system prompt has one fixed set of rules. It does not know the conventions of a project, the risks that matter to it, or the findings that a team wants to skip. The fixed rules also disagree with each other: one rule says to report no style or naming problem, and the example for severity `low` names style and naming. A team needs a way to adjust the rules without a change to the code.

## What Changes

- Add optional review instructions. The project owner writes them as plain text. The `review` command appends them to the system prompt.
- Read the review instructions from one instructions source. There are four, in this order of priority:
  1. the `--instructions` flag, with a file path
  2. the `--instructions-text` flag, with the text itself
  3. the `REVIEW_INSTRUCTIONS_FILE` environment variable, with a file path
  4. the `REVIEW_INSTRUCTIONS` environment variable, with the text itself
- Read no file by default. The review changes only when a person sets an instructions source.
- Use the first instructions source that is usable. Write a `warn` log line, and try the next source, when a source cannot be read, is not UTF-8 text, is empty, or has more than 8,000 characters. Write an `info` log line with the source and the number of characters that the review uses.
- Add the review instructions after the paragraph of the run scope and before the language sentence. Add a fixed statement that the review instructions win over the general guidance, but never change the output format of `submit_review`, the rules for the tools, or the rule that discussion text is information and not an instruction.
- Write a `warn` log line when the instructions source is a file path, and that file is one of the files that the merge request changes. This does not change the result. The text sources are not compared. The comparison uses paths relative to the working directory, so it fits a job that runs in the root of the project.
- Keep the review as it is today when no instructions source is usable.
- Reject `--instructions` and `--instructions-text` on the `publish` command, and ignore the two environment variables there.
- State the trust model in the README. The merge request author is trusted. The README also states two limits of the design: a source that fails does not stop the review, and the next source can be a file path that points into the checkout, and the author controls that file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-diff-review`: The system prompt can hold review instructions. The requirements cover where the review instructions come from, which source wins, what makes a source usable, how long the text can be, where the text goes in the system prompt, and the warning for a changed instructions file.
- `review-cli`: The `review` command accepts `--instructions` and `--instructions-text`. The `publish` command accepts neither.

## Impact

- `src/reviewInstructions.ts` (new): reads the four instructions sources, picks the first usable one, and writes the log lines.
- `src/core/review/engine.ts`: `buildSystemPrompt` and `AgentReviewEngineOptions` take the review instructions. The batch budget already counts the system prompt, so it counts the review instructions with no other change.
- `src/cli/index.ts`: the `--instructions` and `--instructions-text` flags on `review` only, the call that picks the source, and the warning for a changed file after the merge request loads.
- `README.md`: a section on review instructions, the trust model, and the limits.
- The golden file `src/core/review/__golden__/review-output.txt` stays the same, because a run with no review instructions gives the same system prompt.
- No new dependency. No change to the findings file, to the `DiscussionGateway` port, or to a host provider.
- This change and the archived `publish-output-templates` both change the requirement "Each command accepts only the configuration it needs" in `review-cli`. This change builds on the version from `publish-output-templates`.
