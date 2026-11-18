## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `checkResolved` in `src/core/review/checks.ts` applies the checks to a declaration. The last check, `anchor_still_present`, reads the current file and drops the declaration when `computeAnchor(file, line)` equals the anchor of the discussion for some line.
- `runChecks` receives declarations from the review focus agents in `output.resolved`. It appends the declarations of the judge and passes the set `judgedIds` to `checkResolved` for the log field `source`.
- `judge.ts` defines `DiscussionJudgment` (`number`, `judgment`, `reason`), `validateJudgments`, and `createSubmitJudgmentsTool`. `engine.ts` maps a `fixed` judgment to `ResolvedDiscussion { discussionId, reason }`.
- `computeAnchor` in `src/core/review/anchor.ts` hashes the file path and the trimmed text of a line.
- `src/core/review/SPEC.md` is the local guide of the directory. `openspec-sync-specs` must refresh it after the implementation.

## Goals / Non-Goals

**Goals:**
- Resolve a discussion when the judge says `fixed`, the fix does not change the anchored line, and the judge points at a line that exists.
- Keep every case that resolves today.
- Keep the change small: one new field, one new way to pass one check.

**Non-Goals:**
- Prove that the evidence line fixes the problem. The code cannot prove it.
- Change the declarations of the review focus agents.
- Change `findings.json`, `publish`, the CLI flags, or the `ReviewResult` type.

## Decisions

### Decision 1: The judge quotes a line and not a line number

The `evidence` field holds the text of one line of the current file. A model counts lines wrongly, and a line number changes with each edit. A quoted line can be found with no count.

The prompt tells the judge to copy the line as it appears in the current file, with no line number. The prompt tells it to choose a line that shows the fix and not the line of the problem.

Alternative: a line number. The code would read the line at that number. A wrong count would drop a correct judgment.

### Decision 2: Either way passes the check

A declaration of the judge passes the anchor check in two ways:

1. No line of the current file has the anchor. This is the rule of today.
2. A line of the current file has the anchor, and the evidence line is valid.

The new way only adds cases. Every case that resolves today still resolves. To roll back, remove way 2.

Alternative: replace the anchor check with the evidence check. A model that quotes a real but unrelated line would resolve a discussion. The anchor check needs no model quality, so it stays.

### Decision 3: What makes an evidence line valid

The code trims the evidence text. It then checks four conditions:

The code normalizes the evidence line and each line of the file before it compares them. To normalize, it trims the text, replaces each run of white space by one space, and removes `;` and `,` at the end. So a carriage return in a CRLF file, a change of the indent, a changed space inside the line, and a missing `;` or `,` at the end do not matter. The smoke test of the first version showed that a model often drops the last `;` or `,`.

- **One line.** The evidence line has no line feed. A quote of two lines is not valid. The code does not pick one line of it, because that would be a new decision about the quote.
- **Not trivial.** The string length of the normalized evidence line is at least 8. A line such as `}` or `</div>` exists in almost every file and proves nothing. Normalizing first makes `};` count as `}`.
- **Exists.** Some line of the current file has the same normalized text as the evidence line. The code compares whole lines and does not search for a part of a line.
- **Not the problem.** At least one matching line has another anchor than the discussion. A match that is only the anchored line would be the problem itself and not the fix. The anchored line without its `;` still matches only that line, so it is not valid.

The prompt also tells the judge to copy one whole line with the characters at its end. It tells the judge to choose one line when the code has more than one line. The smoke test showed that a model joins the lines of a long tag or statement.

The code reads the file once for both ways, so the check adds no file read. The checks that come before the anchor check do not change. A discussion with no anchor is dropped with `no_anchor`, and an unreadable file is dropped with `file_unreadable`, with or without an evidence line.

A file that the change deletes passes with no read, as today. It needs no evidence line.

### Decision 4: The evidence line is optional in the validation

`validateJudgments` accepts a `fixed` judgment without evidence, and a `not_fixed` or `uncertain` judgment with or without it. A rejected call costs a retry and can lose all judgments of a file. A `fixed` judgment without evidence can still pass by way 1.

The tool schema accepts `evidence` as a string or as `null`. The framework rejects a value of another type before `validateJudgments` runs, and a rejection costs a retry. `null` is a type that a model can send for an absent field, so the schema accepts it.

`validateJudgments` is also called alone, so it checks the type itself. A value that is not a string counts as no evidence, and the function does not throw. The function trims a string. It removes the evidence of a judgment that is not `fixed`. It also removes a blank evidence and `null`.

### Decision 5: The evidence line travels with the declaration

`ResolvedDiscussion` does not change, so no new field reaches `findings.json`. `judgeDiscussions` in `engine.ts` keeps its type of a list of declarations. Each item can have an optional `evidence` string, so the type is `ResolvedDiscussion & { evidence?: string }`. The tests that return plain declarations stay valid.

`runChecks` builds a map from discussion ID to evidence line. The map has a key only for a declaration that the merge kept from the judge. These are the IDs that `runChecks` calls `judgedOnly` today. A declaration of a review focus agent never has a key, also when the judge declared the same discussion. A judge declaration with no evidence line has a key with no value, and the log field `source` uses the keys.

`runChecks` passes the map to `checkResolved` in place of the set `judgedIds`. The default value changes from an empty set to an empty map. `checkResolved` returns plain declarations with no `evidence`, so the result has no new field.

### Decision 6: Reasons and logs

- A declaration with no valid way is dropped. The reason is `anchor_still_present` when the judgment has no evidence line. This is the same reason and the same log line as today.
- The reason is `evidence_not_valid` when the judgment has an evidence line and the line fails any of the four conditions. The `warn` line has the field `evidence` with the text.
- A declaration that way 2 accepts gets one `info` line with the discussion ID, the file, and the evidence line.

The `source` field stays on each drop of a judge declaration.

## Risks / Trade-offs

- The model quotes a real line that does not show the fix → The line must exist and must not be the anchored line. The `info` line records the evidence for review. A person can reopen the discussion.
- A note makes the model quote a real line → The anchor check needed a change of the anchored line. The new way needs no change, so it is a real loosening. The prompt tells the judge that the evidence line comes from the current file and not from a note. The prompt is not a guarantee. The `info` line records each accepted evidence line. The open question about `positionCommit` is the main answer, and it is out of scope here.
- The model copies the number of the diff line with the quote → The diff of a prompt shows `N|` before each line. The prompt tells the judge to copy no line number. The check does not remove a prefix. The `warn` line with the field `evidence` shows how often this happens.
- More cases resolve, so more wrong resolves are possible → The change only adds cases where the judge also named evidence in the current file. The smoke test of the first change shows that the dropped judgments were correct.
- The model changes the whitespace of a quote → The code trims both texts. A change inside the line makes the check fail, and the declaration is dropped as before.

## Migration Plan

No data migration. To roll back, remove way 2 in `checkResolved`. The `findings.json` format is the same before and after.

## Open Questions

- Require that the evidence line is new since `positionCommit`. The code would read the old version of the file and check that the line does not exist there. This blocks a judge that quotes old code. It needs one more file read for each discussion. Decide after the logs show how often a quoted line is old code.
- Accept a quote of one physical line of a statement that the source writes on several lines, for example when the model joins them. The code cannot find such a line. Decide after the logs show how often `problem` is `not_in_file` for this reason.
