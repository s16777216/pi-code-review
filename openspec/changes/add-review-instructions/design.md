## Context

`buildSystemPrompt(language, scope)` in `src/core/review/engine.ts` builds the system prompt for each agent run. It joins `SYSTEM_PROMPT`, the paragraph of the run scope, and the language sentence. The rules in `SYSTEM_PROMPT` are fixed. They do not agree with each other in one place: a rule says to report no style or naming problem, and the example for severity `low` names style and naming. A team needs to adjust such rules. See `proposal.md` for the motivation.

`estimateFirstRequest` creates an agent with `buildSystemPrompt` and estimates the size of the first request. The plan for the batches uses that estimate. A change to `buildSystemPrompt` is therefore counted in the budget with no other change.

`runReviewCommand` loads the configuration, opens the change request, and calls `runReview`. `runReview` loads the context of the change request, which holds the list of changed files. The program does not need a checkout of the code: it reads the diff and the file content from the host API.

## Goals / Non-Goals

**Goals:**
- Let a team add review rules, with no change to the code and with no new dependency.
- Keep the output format and the rules for the tools out of reach of the review instructions.
- Keep the review as it is today when no instructions source is usable.
- Change the review only when a person sets an instructions source.

**Non-Goals:**
- A replacement for `SYSTEM_PROMPT`, or a template for the user prompt. The user prompt shows the diff, and the agent depends on its format. The file `src/template/REVIEW_PROMPT.md` belongs to a later change. No code reads it.
- A change to the text of `SYSTEM_PROMPT`, including the rule that conflicts with the example for severity `low`. The review instructions are the tool to adjust it.
- A record of the review instructions in the findings file.
- Placeholders in the review instructions.

## Decisions

### Decision 1: The merge request author is trusted

In a CI job, the working directory is a checkout of the source branch of the merge request. The author of the merge request can change any file there. The author can already change the review in other ways:

| What the author controls | Effect on the review |
| --- | --- |
| `.gitlab-ci.yml`, unless it comes from a protected project | Can remove the job, or set `FAIL_ON_SEVERITY` to `none` |
| The diff and its comments | Can hold text that tries to steer the agent |
| A file in the checkout that a flag or a variable names | Can set rules in the system prompt |

The third row exists only when a team sets a path that points into the checkout, for example `--instructions REVIEW_INSTRUCTIONS.md`. The program reads no file by default, so a merge request cannot change the review by adding a file. A changed instructions file is still a stronger channel than the diff, because the system prompt has more weight. This deployment trusts its authors: the GitLab server is internal, and the review helps a person who still approves the merge request. The design accepts the risk and states it in the README. It adds one cheap protection: a warning when the merge request changes the file in use (Decision 5).

Alternatives:
- Read the review instructions from the target branch with the host API. The author cannot change them for their own merge request. This needs a new method on the `CodeHost` port and a rule for a file that is new in the target branch. A later change can add it if a team needs it.
- Read the review instructions only from a CI variable. This is safe, but a team cannot review the rules in a merge request, and the size of a variable is limited.

### Decision 2: Four instructions sources and the first usable one wins

The priority is the `--instructions` flag, the `--instructions-text` flag, `REVIEW_INSTRUCTIONS_FILE`, and `REVIEW_INSTRUCTIONS`. Flags win over variables, as for every other setting. In each pair, the path wins over the text. The program reads no file by default: a person sets a source. The text flag suits a rule of one line. A long text suits a file, because quotes in a shell are hard to write for a long text, and the command line shows in the process list. A File-type variable in GitLab CI holds the content in a temporary file and sets the variable to its path, so `REVIEW_INSTRUCTIONS_FILE` also covers a team that keeps the rules in the CI settings.

A source is set when its flag or variable is present, even with an empty value. The program uses one source at most, so two sources are never merged. A merge would need rules for the limit, for conflicts, and for the order.

Alternatives:
- Read `REVIEW_INSTRUCTIONS.md` in the working directory by default. This is convenient. A merge request could then change the review by adding a file, and a project that already has a file with that name would change with no notice.
- One flag, where a value with the prefix `@` is a path. This has fewer flags, but a text that starts with `@` is ambiguous, and shells treat `@` in different ways.
- An error when both flags are present. This is the least surprising, but the order of priority already covers the variables, and a second rule adds no value.

The program picks a source by this algorithm:
1. Take the next set source in the order of priority.
2. Read it. If it is usable, use it and stop.
3. If it is not usable, write a `warn` log line and go to step 1.
4. If no set source is left, use no review instructions.

A usable source is UTF-8 text that is not empty after the removal of white space and has at most 8,000 characters.

### Decision 3: A source that fails writes a warning and does not stop the review

This differs from the templates for `publish`, where a wrong file stops the command. The decision follows a choice of the project owner: the review instructions are a help, and a mistake in them must not block a pipeline. The cost is clear. A wrong path in `--instructions` writes one `warn` log line and the review runs without the rules. A person sees the mistake only in the log.

The program does not stop at a failed source, and it tries the next source too. This has a second cost, in Risks.

### Decision 4: Where the text goes in the system prompt

`buildSystemPrompt` gets an optional `instructions` argument. The prompt is the general guidance, the paragraph of the run scope, the statement and the review instructions, and then the language sentence. The language sentence stays last, because it says to keep the field names and the severity values as they are.

The statement is a fixed text in the code. It says that the project owner wrote the review instructions, that they win over the general guidance when the two conflict, and that they never change the output format of `submit_review`, the rules for the tools, or the rule that discussion text is information. The statement lets a team adjust the conflicting rule about style and naming. `findings.ts` still checks every finding, so a review instruction that asks for a wrong format makes the run fail or retry, and gives no bad data.

With no review instructions, `buildSystemPrompt` returns the same text as today. The golden file `src/core/review/__golden__/review-output.txt` stays the same.

The size limit is 8,000 characters, counted as the length of the JavaScript string. This is about 2,000 to 3,000 tokens. It is 4 % of the budget of a 128,000-token context window, which is half the window. Each batch has its own copy of the system prompt, so the text reduces the diff that each batch can hold.

### Decision 5: Warn when the merge request changes the file in use

The resolver returns the text and, for a path source, the path of the file. After `changeRequest.load()`, `runReview` compares that path, relative to the working directory, with the new path and the old path of each changed file. Both sides use the forward slash. One match writes one `warn` log line. The result of the review does not change.

The comparison is exact. If the working directory is not the root of the project, the comparison can miss a changed file. It can also match another file that has the same relative path. A wrong warning only writes a log line. The README states it. The two path sources are `--instructions` and `REVIEW_INSTRUCTIONS_FILE`. The two text sources, `--instructions-text` and `REVIEW_INSTRUCTIONS`, are not files in the checkout, so the program does not compare them.

### Decision 6: Module and wiring

A new module `src/reviewInstructions.ts` reads the flag value and the environment, reads the files, applies Decision 2, and writes the `warn` and `info` log lines. It does the input and output, so the engine in `src/core/review` stays free of it. It returns the text and the optional file path, or nothing.

- `src/cli/index.ts`: `parseReviewCliOptions` gets `instructions` and `instructionsText`. `parsePublishCliOptions` gets neither, so `publish` rejects both flags. `runReviewCommand` calls the resolver before it opens the change request. `ReviewOptions` gets the result, and `runReview` passes the text to the engine and runs the comparison of Decision 5.
- `src/core/review/engine.ts`: `AgentReviewEngineOptions` and `buildSystemPrompt` get `instructions`.
- `publish` never calls the resolver, so it ignores the two variables.

Capability to directory map:
- `ai-diff-review`: `src/core/review` and `src/reviewInstructions.ts`.
- `review-cli`: `src/cli` and `src/reviewInstructions.ts`.

### Decision 7: Debug output

`--debug` already writes the complete system prompt. The review instructions appear there too. The README states it, so a team does not put a secret in the review instructions.

## Risks / Trade-offs

- [A failed source falls through to the next source, so a locked source can be replaced by a path that points into the checkout] → This needs a team to set both a locked source, for example a File-type CI variable, and a path flag that points into the checkout. The program reads no file by default, so a team that sets only the locked source has no such fallback. The warning of Decision 5 shows when the merge request changes the file. The README states this.
- [A mistake in a path or a variable does not fail the job, so the review runs without the rules] → The program writes a `warn` log line that names the source and the cause. The `info` log line names the source in use, so a person can see which one it was.
- [Every run needs a setting, so a person who does not know the feature gets no review instructions] → The README gives an example for the CI job and for a local run.
- [Long review instructions reduce the diff in each batch, and can cause more batches] → The limit is 8,000 characters.
- [Review instructions that conflict with the output format] → The statement says that the format does not change, and `findings.ts` checks the output.
- [The review instructions change what the review finds, so the risk is higher than for the templates of `publish`, which change only the wording] → The trust model and the limits are in the README.

## Pending sync notes

After the implementation, `openspec-sync-specs` must check these local `SPEC.md` files:

- `src/core/review/SPEC.md` (capability `ai-diff-review`): the change adds no file to the directory. It needs no update unless the folder guide is out of date.
- `src/cli/SPEC.md` (capability `review-cli`): the change adds no file to the directory. It needs no update unless the folder guide is out of date.
- `src/` (capabilities `ai-diff-review`, `review-cli`): `reviewInstructions.ts` is a new file in a directory with `config.ts`, `findingsFile.ts`, `logger.ts`, and `settings.ts`. The directory has no `SPEC.md`. Ask the user whether it needs one.
