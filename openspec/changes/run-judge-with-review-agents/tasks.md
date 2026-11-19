## 1. Shared limit

- [ ] 1.1 Move the limit of `runPool` in `engine.ts` to one counter of active runs in the engine. Each pool job takes a slot before it starts, and gives it back when it ends or throws. Waiting jobs start in the order of their requests. Verify with unit tests: the active count never goes over 3 with two pools at the same time, a throwing job gives back its slot, and a pool with fewer jobs than 3 works as before.
- [ ] 1.2 Keep the tests of the limit for the review agents, the verifier, and the judge. Verify that they pass with no change in their expectations.

## 2. Start the judge early

- [ ] 2.1 In `review()`, start `judgeDiscussions` before `runAll`, and keep its promise. Change the argument of `runChecks` to a function that returns the promise. Attach a handler to the promise that records an error, so that a review failure leaves no unhandled rejection. Verify with an engine test that the judge call starts before the last review agent call ends.
- [ ] 2.2 Add a stop flag. `review()` sets it when the review fails, and the pool of the judge reads it with the `stopped` argument. Verify with a test that a failed review starts no new judge run and leaves no unhandled rejection.
- [ ] 2.3 Add an engine test with 6 review agent runs and 2 judge runs: at most 3 of the 8 runs are active at the same time.

## 3. Tests and golden file

- [ ] 3.1 Update the tests that depend on the order of the log lines or of the model calls. Change an expectation only when the order is the reason. Update the golden file with `UPDATE_GOLDEN=1`. Verify that the file stays LF and that `npm test` passes.

## 4. Check and document

- [ ] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that build, test, and lint pass. If `format:check` fails, compare with `master` and name each failure that already exists there.
- [ ] 4.2 Archive `add-verify-agent` first. Rebuild the delta of this change from the main spec. Run `openspec-sync-specs` for this change, and update `docs/how-it-works.md`. Verify with `openspec validate run-judge-with-review-agents --strict`.
- [ ] 4.3 Smoke test: run `picr review` with `--debug` on merge request 60, and do not run `publish`. Record the time of the whole review and the time at which the judgment summary line appears. This task is not an acceptance gate, because the model answers differ between runs.
