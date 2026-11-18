## Why

A review agent can declare that a discussion is fixed. The declaration is optional, and the agents use it by chance. In a smoke test on merge request 60, one run had no declaration and a later run had about 20.

The discussion judgment step now judges every open discussion that no finding links to. It gives one path for a fixed judgment, and a verifier check on that path is planned. A declaration from a review agent skips the judge, so it skips that check too. It also needs extra rules: the judge does not select a discussion that an agent declared, and the merge keeps the declaration of the agent first.

## What Changes

- **BREAKING**: The `submit_review` tool no longer has the `resolved` field. A review agent cannot declare a discussion fixed. A `resolved` array in a call is ignored.
- The system prompt of the review agents no longer tells them to declare a discussion fixed. The paragraph and the `resolved` field in the output description are removed.
- The discussion judgment step no longer excludes a discussion for the reason that an agent declared it. The step selects a discussion when this tool started it, it is not resolved, it has an anchor and a file, and no remaining finding links to it.
- The judge is the only source of fixed declarations. The merge of declarations, the rule that the declaration of an agent comes first, and the rule that an evidence line does not apply to an agent declaration are removed.
- The check on fixed declarations is unchanged for a declaration of the judge.
- No change to `findings.json`, to `publish`, to the CLI flags, or to the `ReviewResult` type. `findings.json` keeps the `resolved` list, and the file reader keeps its validation.
- Out of scope: the second run of the verifier on the `fixed` judgments. A separate change adds it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Do not offer fixed declarations to the review agent".
  - Removed: "Declare fixed discussions".
  - Modified: "Produce structured findings" drops the word declaration from two scenarios.
  - Modified: "Limit submit_review attempts in one run" drops the word declaration from its scenario.
  - Modified: "Accept a fixed declaration only after the checks" accepts only a declaration of the judge.
  - Modified: "Accept a judged declaration by its evidence line" drops the rule and the scenario about an agent declaration.
  - Removed and added under a new name, because a modified requirement must keep all its scenarios: "Run the checks once on the merged output" becomes "Run the checks in order on the merged output", with no merge of declarations.
  - Removed and added under a new name: "Judge open discussions with the discussion judgment step" becomes "Select and judge the open discussions", with no exclusion of a declared discussion.
  - Removed and added under a new name: "Turn a fixed judgment into a fixed declaration" becomes "Turn a fixed judgment into a declaration", with no merge with agent declarations.

## Impact

- Affected code: `src/core/review/agent.ts` (the `resolved` field and its validation), `src/core/review/engine.ts` (the prompt paragraph, the merge of declarations, the call of the judgment step), `src/core/review/checks.ts` (`runChecks` takes no agent declarations), `src/core/review/judge.ts` (`selectDiscussions` takes no declared IDs), `src/core/review/findings.ts` (`ParsedReviewOutput`), and `src/core/review/fauxFocus.ts` plus the tests that use agent declarations.
- Golden file `src/core/review/__golden__/review-output.txt`: the system prompt changes, so the file needs a regeneration.
- Local guide to refresh after implementation: `src/core/review/SPEC.md`.
- Docs to update after implementation: `docs/how-it-works.md` (the review agents section and the discussion judgment section).
- Fewer tokens in each review agent run, and no declaration path that skips the judge.
- A review agent no longer resolves a discussion that it read with `list_discussions`. The judge reads the current code of that discussion. Each discussion that an agent would have declared now costs a share of one judge run for its file.
- Depends on `judge-evidence-line`. Archive that change first, because this change modifies a requirement that it adds.
