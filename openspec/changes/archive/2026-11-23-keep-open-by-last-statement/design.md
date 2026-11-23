## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `JUDGE_SYSTEM_PROMPT` in `src/core/review/judge.ts` and `VERIFY_AGENT_SYSTEM_PROMPT` in `src/core/review/verifyAgent.ts` each have a rule for a decision of a person. Both rules need "the code is unchanged".
- The judge sees the current code and the notes of a discussion. It does not see the history of the code, so it cannot know if the code changed after a note.
- The verify agent gets the declarations of the judge with their reason. A reason that says that there is no problem has led the agent to resolve a declined discussion.
- A discussion has notes with an `author` and a `body`. The agent reads the notes to find what a person said.
- Only `fixed` goes from the judge to the verify agent. A discussion with `not_fixed` or `uncertain` stays open.
- Tests on merge request 60: with an extra rule in the review instructions of the judge, `show.vue` line 590 gave 0 of 8 `fixed`, `show.vue` line 652 (a true fix) gave 8 of 8, and `AttachmentUpload.vue` line 239 gave 0 of 8.

## Goals / Non-Goals

**Goals:**
- Make a statement of a person decide the result of a discussion that the person declined or deferred.
- Make the prompt follow the last statement when a thread has more than one.
- Use the same words in both prompts.

**Non-Goals:**
- Add a rule of the code that reads the replies. The code cannot read the meaning of a reply.
- Run one agent for each discussion. A test showed that the prompt is enough.
- Cover a fix that handles only a part of the problem.
- Change the output format, the validation, or the verify step.

## Decisions

### Decision 1: The last statement of a person decides

A statement is a note of a person, not of this tool, that says one of two things: the problem stays by decision, or the problem is fixed. A note that says neither, for example a question or a thanks, is not a statement. The agent finds the last statement and follows it.

- The last statement says that the problem stays: the judge gives `not_fixed` and the verify agent gives `keep_open`.
- The last statement says that the problem is fixed, or there is no statement: the agent decides from the code, as before.

Alternative: any earlier decision keeps the discussion open. An author who declines and then fixes the problem would keep a discussion open for ever. The last statement avoids this.

### Decision 2: The agent does not judge the reason or the code

When the last statement says that the problem stays, the agent MUST NOT judge if the reason is right, if it can check the reason, or if the code changed. The judge cannot see the history of the code, so it cannot tell a declined discussion from a fixed one. A person can always resolve the discussion.

Alternative: keep the condition "the code is unchanged". The tests showed that the agent then decides that the code has no problem and gives `fixed`.

### Decision 3: The two prompts use the same words

The judge and the verify agent have one paragraph each with the same rule. The verify agent keeps its own check, because the judge can be wrong. The existing rule for a statement that the agent cannot check stays and applies when no person decided that the problem stays.

### Decision 4: Verify with the real model

A unit test checks the text of the prompts. A test with the real model on merge request 60 checks the four known cases. One more test changes the notes of a discussion in memory, so that the author declines and then writes that the fix is done. The result MUST be `fixed`.

### Decision 5: The rule is a first step, before the code

Each prompt puts the rule before the decision from the code, and ends it with "Stop there". The prompt does not put the rule as an extra sentence of the `not_fixed` or `keep_open` item. A first version with the extra sentence gave `fixed` for `AttachmentUpload.vue` line 239 in 9 of 24 runs on the real model: the model checked the code first, saw that the frontend code was right, and gave `fixed`. The version with the rule as the first step gave `not_fixed` in 24 of 24 runs.

## Risks / Trade-offs

- The agent reads the last statement wrong → A person resolves or reopens the discussion. The test with a changed thread shows how often.
- A discussion that the code fixed stays open after a decision → A person resolves it. Where a project needs all threads resolved before a merge, this costs one click.
- A prompt rule is not a guarantee, and the model output differs between runs → The judge and the verify agent give two checks.

## Migration Plan

No data migration. To roll back, restore the two paragraphs.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: none. `src/core/review/SPEC.md` names the files and not the prompt text.

## Open Questions

- Whether a reply of a person who is not the author counts as a decision. This change uses the existing words "a person".
- Whether the rule needs a test with a thread of three or more statements.
