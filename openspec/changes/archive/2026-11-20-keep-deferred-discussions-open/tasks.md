## 1. The rule in the prompt

- [x] 1.1 Extend the paragraph of `keep_open` in `VERIFY_AGENT_SYSTEM_PROMPT` in `verifyAgent.ts` with the two sentences of Decision 1. Verify with a unit test in `verifyAgent.test.ts` that the prompt names a decision to leave the problem for a later change.
- [x] 1.2 Verify with a unit test that the prompt tells the agent to use `keep_open` when the only support for a fix is a statement in a reply that it cannot check in the diff or in the files that it can read.
- [x] 1.3 Verify with a unit test that the prompt still tells the agent to resolve a discussion when the code changed to fix the problem.

## 2. Check and document

- [x] 2.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that build, test, and lint pass. If `format:check` fails, compare with `master` and name each failure that already exists there. Run `UPDATE_GOLDEN=1` for the golden file only if the test fails.
- [x] 2.2 Run `openspec-sync-specs` for this change to refresh the main spec. Add one sentence to the section "Final decisions" of `docs/how-it-works.md`. Verify with `openspec validate keep-deferred-discussions-open --strict`.
- [x] 2.3 Smoke test: run `picr review` with `--debug` on merge request 60 two times, and do not run `publish`. Find the discussions on `AttachmentUpload.vue` line 239 and `squad.vue` line 506. Record, for each run, the decision of the verify agent for each one and its reason. This task is not an acceptance gate, because the model answers differ between runs.

  Result (merge request 60, two runs): AttachmentUpload.vue:239 got `not_fixed` from the judge in both runs, so it never reached the verify agent and the rule was not tested. squad.vue:506 got `fixed` from the judge and `resolve` from the verify agent in both runs. Its reason cites code evidence and also the statement of the author about the backend. In run 2, show.vue:590 (a declined discussion) got `resolve` from the verify agent, with the reason that the author confirmed the build resolves the component.
