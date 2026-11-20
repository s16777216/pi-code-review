## 1. The rule in the prompt

- [x] 1.1 Add the paragraph of Decision 1 to `VERIFY_AGENT_SYSTEM_PROMPT` in `verifyAgent.ts`, after the rules of the declaration. Verify with a unit test in `verifyAgent.test.ts` that the prompt tells the agent to use `keep_open` when a person replied that the problem stays by decision and the code did not change, and that resolving such a discussion is a decision for a person.
- [x] 1.2 Verify with a unit test that the paragraph names the case of a reason of the judge that says there is no bug.

## 2. Check and document

- [x] 2.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that build, test, and lint pass. If `format:check` fails, compare with `master` and name each failure that already exists there. Run `UPDATE_GOLDEN=1` for the golden file only if the test fails.
- [x] 2.2 Run `openspec-sync-specs` for this change to refresh the main spec. Add one sentence to the section "Final decisions" of `docs/how-it-works.md`. Verify with `openspec validate keep-declined-discussions-open --strict`.
- [x] 2.3 Smoke test: run `picr review` with `--debug` on merge request 60 two times, and do not run `publish`. Find the discussion on `commander.vue` line 14, where the author declined the finding. Record, for each run, the decision of the verify agent for it and its reason. This task is not an acceptance gate, because the model answers differ between runs.
