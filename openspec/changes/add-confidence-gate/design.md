## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `AgentReviewEngine.review()` runs one agent for each pair of run scope and review focus. It merges the outputs in run order: `findings.push(...kept)`. The focus of each output is known at that point (`runs[i].focus`) and is then lost. `runChecks` copies each finding with a spread (`{ ...finding, anchor }`), so a new field on a finding survives it.
- The deduplication step sends only the findings of files that have two or more findings. `validateGroups` already requires that all numbers of a group are in one file. `keepOnePerGroup` keeps the finding with the highest severity and drops the others. A failed step keeps all findings and writes the warning `deduplication_failed`.
- The verifier gives `confirmed`, `rejected`, or `uncertain` for each finding. `applyVerdicts` drops `rejected` findings and sets the severity of the others. It returns the verdict next to each result, and nothing keeps it after that. A file whose verification fails or is skipped keeps its findings with the warning `verification_failed` or `verification_skipped`.
- The verify agent (`applyDecisions`) can drop a finding or change its `relatesTo`. It builds each result with a spread, so extra fields survive.
- `validateFinding` returns only the known fields. `readFindingsFile` uses it, so a new field is lost on read unless the function knows it.
- `decidePassFail(findings, threshold)` has no other input. The `publish` command calls it. The severity setting is `FAIL_ON_SEVERITY` (flag `--fail-on`), and it already stops with exit code 2 on a bad value.
- The comment text comes from `FINDING.md`. The filler knows four placeholders, and the main spec says that other `${name}` text stays plain.
- Main specs: `ai-diff-review`, `review-cli`, and `review-output` hold the rules that this change touches. The old severities `important` and `nit` appear only in archived changes. The main specs use `critical`, `high`, `medium`, `low`, and `pre_existing`, so the draft has no conflict with them.

## Goals / Non-Goals

**Goals:**
- Give each finding a confidence that a program derives from data that the review already has.
- Let a team fail a merge request on severity and confidence together, with no change for a team that does not set the new setting.
- Keep the data (corroboration and verdict) that a later change needs to calibrate or replace the table.

**Non-Goals:**
- Change severity, or drop a finding, because of its confidence.
- Add verifiers, scores, or calibration. The table is the first version.
- Change the default of `FAIL_ON_CONFIDENCE`.

## Decisions

### Decision 1: Carry the focus on the finding, and remove it after deduplication

`Finding` gets an optional internal field `focus` (the focus name). The engine sets it when it merges the outputs. The deduplication step reads it to count the distinct focuses of a group, and removes it from every finding at its end. The field never reaches the verifier prompt, the verify agent prompt, or the findings file.

The prompts already build each item from named fields, so the focus is not sent by chance. A test makes this a rule, because a focus name in the verifier prompt could bias the verdict.

Alternative: a side table that maps a finding to its focus. `runChecks` copies each finding, so the object identity is lost and a table needs a key. The field is simpler.

### Decision 2: Corroboration is computed in the deduplication step

For each group that the model gives, corroboration is the number of distinct `focus` values of its findings, and the kept finding gets it. A finding that is in no group has `1`. A failed step gives `1` to every finding. Two findings of one focus in one group count once, because corroboration measures agreement between different focuses. The same focus in two batches also counts once.

The model makes the groups, and a wrong group changes the count. `validateGroups` already limits a group to one file. This change adds no further check (see Open Questions).

### Decision 3: Confidence is derived in the verification step from a table

`applyVerdicts` sets `verdict` (`confirmed` or `uncertain`) and `confidence` on each kept finding. The table is the one in the spec. A file with no verdict (failed or skipped verification) uses the verdict `uncertain` for the table, and the finding has no `verdict` field, so a reader can tell a real `uncertain` from a missing verdict.

The confidence is set where the verdict exists. The verify agent step runs later and keeps the field, because it copies findings with a spread. A test makes this a rule.

Alternative: derive the confidence in `publish` from the stored `corroboration` and `verdict`. This keeps the table out of `review`, and a team could change the table without a new review. The cost is that every reader of the findings file must know the table. The decision is to store `confidence` and also the two inputs, so both ways stay open.

### Decision 4: The gate is one function with two thresholds

`decidePassFail(findings, severityThreshold, confidenceThreshold)` fails when one finding meets both thresholds. A finding with no `confidence` counts as `high`, so a findings file from an older `review` gives the same result as before. `FAIL_ON_CONFIDENCE` is parsed in `config.ts` next to `FAIL_ON_SEVERITY`, with the same error and the exit code 2. The flag is `--fail-on-confidence`. The existing severity flag is `--fail-on`, so the two names are not a pair. This change does not rename `--fail-on`.

### Decision 5: One placeholder and one template line show the confidence

The filler gets the placeholder `${confidence}`. The built-in `FINDING.md` gets the line `**Confidence**: ${confidence}` between the severity and the reason. A team with its own template is not changed until it adds the placeholder.

The draft also asks that a finding of confidence `low` is marked as needing a person's check. A template has no condition, so the filler cannot add the mark for `low` only. This change shows the value and leaves the mark to the text of a team's template. See Open Questions.

### Decision 6: The count goes to the log and to the review status comment

`publish` counts the findings that meet the severity threshold but not the confidence threshold. The count goes to the `info` log line of the result and, when it is more than 0, to the review status comment as `**Gate:** Findings that met the severity threshold but not the confidence threshold: N.` The status comment is today created only for a failure, a warning, or a file too large, and it holds only those texts. The spec delta of `review-output` widens both rules for this line.

Alternative: log only. The log is easy to miss in a CI job, and the draft asks for the comment so that a person sees what the threshold let pass. The cost is one more case for the comment, and a comment on a merge request that otherwise has none.

### Decision 7: Spec layout

A new capability `review-gate` holds the new rules (the draft, with the edits that the Risks section lists). Two modified requirements of `review-cli` (exit code of `publish`, configuration of each command) and two of `review-output` (templates, review status comment) carry the full new text, because the old text names the severity threshold only or lists a closed set of placeholders and contents. The rules of `ai-diff-review` (deduplication keeps the highest severity, verdicts set severity, a failed verification keeps the findings) stay true, and the new fields are additions that none of them forbids.

## Risks / Trade-offs

- A security finding that only the security focus reports has corroboration `1`, so its confidence is `medium` at most. A team that sets `FAIL_ON_CONFIDENCE=high` could let it pass → The default `low` changes nothing. Check real data before anyone sets a higher value (Open Question 1).
- Most findings may be `medium`, because there is one verifier and `confirmed` is common → Confidence then separates few findings. The stored inputs let a later change add verifiers or scores without a new data model.
- A wrong deduplication group changes the corroboration → Groups are limited to one file by existing code. A line distance check is deferred.
- The draft says "SHOULD also write the verdict". The spec in this change says MUST, because the calibration in Open Question 3 needs it, and the cost is one field → The wording can go back to SHOULD in review.
- The status comment gets a new reason to exist → A merge request can get a comment for a count only. Decision 6 gives the alternative.

## Migration Plan

No data migration. An older findings file reads as confidence `high`. To roll back, revert the commits. A new findings file read by an older `publish` works, because unknown fields are ignored.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md`, `src/template/SPEC.md`, and `src/SPEC.md` if the findings file is listed there. Ask the user to approve each file first.

## Open Questions

1. **Focus partition bias.** The three focuses split by domain, so a security bug is mostly found by the security focus only. Check real data before `FAIL_ON_CONFIDENCE` is set above `low` anywhere. This does not change the spec.
2. **Verifier count.** With one verifier, `confirmed` is common. A later change can add verifiers for `critical` and `high` findings. This would add a `high` path for single-focus findings.
3. **Upgrade to scores.** A later version can replace the table with scores from several verifiers, aggregated by median, and mapped to `low`, `medium`, and `high` by thresholds from real data. The gate rules would not change. The stored `corroboration` and `verdict` are the data for that.
4. **Mark for `low` confidence.** Whether the filler should give a ready note for `low` (a second placeholder with an empty value for the other two). It has a cost: an empty value leaves an empty line in the comment.
5. **Posting policy.** A later change could drop findings that are both low severity and low confidence. It is out of scope.
6. **Deduplication check.** A program check that a group has findings near the same line.
7. **Verifier severity.** The verifier can still change severity alone. The median of several verifiers would make it stable.
