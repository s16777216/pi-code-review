## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `AgentReviewEngine.review()` runs one agent for each pair of run scope and review focus. It merges the outputs in run order: `findings.push(...kept)`. The focus of each output is known at that point (`runs[i].focus`) and is then lost. `runChecks` copies each finding with a spread (`{ ...finding, anchor }`), so a new field on a finding survives it.
- The deduplication step sends only the findings of files that have two or more findings. `validateGroups` already requires that all numbers of a group are in one file. `keepOnePerGroup` keeps the finding with the highest severity and drops the others. A failed step keeps all findings and writes the warning `deduplication_failed`.
- The verifier gives `confirmed`, `rejected`, or `uncertain` for each finding. `applyVerdicts` drops `rejected` findings and sets the severity of the others. It returns the verdict next to each result, and nothing keeps it after that. A file whose verification fails or is skipped keeps its findings with the warning `verification_failed` or `verification_skipped`.
- The verify agent (`applyDecisions`) can drop a finding or change its `relatesTo`. It builds each result with a spread, so extra fields survive.
- `validateFinding` returns only the known fields. `readFindingsFile` uses it, so a new field is lost on read unless the function knows it.
- The comment text comes from `FINDING.md`. The filler knows four placeholders, and the main spec says that other `${name}` text stays plain.
- `decidePassFail` and the review status comment use severity and the warnings only. This change does not touch them.
- Main specs: `ai-diff-review` and `review-output` hold the rules that this change touches. The old severities `important` and `nit` appear only in archived changes. The main specs use `critical`, `high`, `medium`, `low`, and `pre_existing`, so there is no conflict with them.

## Goals / Non-Goals

**Goals:**
- Give each finding a confidence that a program derives from data that the review already has.
- Keep the data (corroboration and verdict) that a later change needs to find out whether the confidence is useful.
- Show the confidence to the people who read the comments.

**Non-Goals:**
- Use the confidence to decide pass or fail, to drop a finding, or to change a severity.
- Add verifiers, scores, or calibration. The table is the first version.
- Change the review status comment.

## Decisions

### Decision 1: Carry the focus on the finding, and remove it after deduplication

`Finding` gets an optional internal field `focus` (the focus name). The engine sets it when it merges the outputs. The deduplication step reads it to count the distinct focuses of a group, and removes it from every finding at its end. The field never reaches the verifier prompt, the verify agent prompt, or the findings file.

The prompts already build each item from named fields, so the focus is not sent by chance. A test makes this a rule, because a focus name in the verifier prompt could bias the verdict.

Alternative: a side table that maps a finding to its focus. `runChecks` copies each finding, so the object identity is lost and a table needs a key. The field is simpler.

### Decision 2: Corroboration is computed in the deduplication step

For each group that the model gives, corroboration is the number of distinct `focus` values of its findings, and the kept finding gets it. A finding that is in no group has `1`. A failed step gives `1` to every finding. Two findings of one focus in one group count once, because corroboration measures agreement between different focuses. The same focus in two batches also counts once.

The model makes the groups, and a wrong group changes the count. `validateGroups` already limits a group to one file. This change adds no further check (see Open Questions).

### Decision 3: Confidence is derived in the verification step from a table

`applyVerdicts` sets `verdict` (`confirmed` or `uncertain`) and `confidence` on each kept finding. The table is the one in the spec. A file with no verdict (failed or skipped verification) gets the verdict `unverified`, and the table treats it as `uncertain` (Decision 6).

The confidence is set where the verdict exists. The verify agent step runs later and keeps the field, because it copies findings with a spread. A test makes this a rule.

Alternative: derive the confidence in `publish` from the stored `corroboration` and `verdict`. This keeps the table out of `review`, and a team could change the table without a new review. The cost is that every reader of the findings file must know the table. The decision is to store `confidence` and also the two inputs, so both ways stay open. The `verdict` is a MUST in the spec, because a later calibration needs it.

### Decision 4: One placeholder and one template line show the confidence

The filler gets the placeholder `${confidence}`. The built-in `FINDING.md` gets the line `**Confidence**: ${confidence}` between the severity and the reason. A team with its own template does not change until it adds the placeholder. A finding with no confidence (from an older findings file) fills the placeholder with `unknown`. The earlier draft treated such a finding as `high` for the gate. With no gate, `high` would be a wrong claim in a comment, so the value is `unknown`.

A mark that asks a person to check a finding of confidence `low` is not part of this change. A template has no condition, so the filler cannot add a mark for `low` only. See Open Questions.

### Decision 5: Spec layout and the name of the change

A new capability `review-confidence` holds the new rules. One requirement of `review-output` (render comments from templates) is modified, because the old text lists a closed set of placeholders and gives the exact text of the default comment. The rules of `ai-diff-review` (deduplication keeps the highest severity, verdicts set severity, a failed verification keeps the findings) stay true, and the new fields are additions that none of them forbids.

`review-cli` needs no change, because `publish` still decides pass or fail from severity alone. The change folder was named `add-confidence-gate` in the first draft. It is now `record-review-confidence`, because the gate is out of scope.

### Decision 6: A finding that was not verified has the verdict `unverified`

The first version left the `verdict` out when verification failed or was skipped. This gave two problems. A reader of the findings file had to handle a finding with a `confidence` and no `verdict`. A calibration could not tell "the verifier said `uncertain`" from "the verifier did not run", and these two are not the same evidence.

The verdict now has three values: `confirmed`, `uncertain`, and `unverified`. The program sets `unverified` for a finding of a file whose verification failed or was skipped (the warnings `verification_failed` and `verification_skipped`, and a file that is not in the change). The table treats `unverified` as `uncertain`, so no confidence changes and no pass or fail result changes. A model cannot give it: the tool `submit_verdicts` still accepts `confirmed`, `rejected`, and `uncertain` only, and the check of agent output keeps no verdict.

A findings file of an older version has no `verdict` and no `confidence`. It reads with no error, and the placeholder gives `unknown` (Decision 4). The reader accepts a finding with no `verdict`, because only the engine writes the field, and the engine always writes it.

Alternative: leave the field out, as in the first version. It keeps the type smaller, but it loses the difference above, and it keeps the risk for a reader that expects both fields.

### Decision 7: Delay the gate

The first draft of this change added a setting `FAIL_ON_CONFIDENCE` and a gate that fails only when a finding meets the severity threshold and the confidence threshold. This change does not do that, for these reasons:

- The three focuses split by domain, so a security problem is mostly found by the security focus alone. Its corroboration is `1`, and its confidence is `medium` at most. A high confidence threshold would let a real security finding pass.
- There is one verifier, and it answers `confirmed` for most findings. Most findings may then have the same confidence (`medium` or `high`), and the confidence separates few of them.
- Nobody has data that links the confidence to the choice of a person (accept or decline the finding). Without it, no value of the threshold is known to be safe.

So the gate would have a setting that nobody can set with confidence. This change records the data first. The condition to add the gate is in Open Questions.

## Risks / Trade-offs

- Most findings may get the same confidence, so the line in the comment gives little information → The line is small, and the findings file keeps the inputs for a better rule.
- A wrong deduplication group changes the corroboration → Groups are limited to one file by existing code. A line distance check is deferred.
- The built-in comment grows by one line for every finding, and a team with a golden test of its own comments sees a change → A team can keep its own template, which does not change.
- The `verdict` field is a MUST for a calibration that has not started → It is one field, and the data cannot be rebuilt later. It is on every finding, so a reader does not need a rule for a missing field.

## Migration Plan

No data migration. An older findings file reads with no error, and the placeholder fills with `unknown`. To roll back, revert the commits.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md` and `src/template/SPEC.md`, and `src/SPEC.md` if it lists the findings file. Ask the user to approve each file first.

## Open Questions

1. **Condition to add the gate.** Collect findings files from real reviews and the choice of a person for each finding (accept or decline). Check whether the confidence tells the two apart, in particular for security findings. Add `FAIL_ON_CONFIDENCE` only if it does. The gate rule of the first draft (fail when a finding meets both thresholds, default `low`) can be the start.
2. **Limits of the table.** The focus partition and the single verifier (Decision 7) set a ceiling for this table. A change to the table needs the data of question 1.
3. **Several verifiers with scores.** A later change can replace the table. Several verifiers each give a score from 1 to 5, with a written anchor for each value. The system takes the median and records the lowest score and the spread, and maps the median to `low`, `medium`, and `high` with thresholds from real data. The gate rules would not change, only the source of the confidence. Run it as a separate change, after question 1.
4. **Mark for `low` confidence.** A request to a person to check a finding of low confidence needs a condition that a template does not have. One way is a second placeholder with an empty value for the other two levels. It has a cost: an empty value leaves an empty line in the comment.
5. **Posting policy.** A later change could drop findings that are both low severity and low confidence. It is out of scope.
6. **Deduplication check.** A program check that a group has findings near the same line.
7. **Verifier severity.** The verifier can still change severity alone. The median of several verifiers would make it stable.
