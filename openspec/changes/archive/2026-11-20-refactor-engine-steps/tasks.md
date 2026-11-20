## 1. Record the behavior before the change

- [x] 1.1 No test checks the `warn` lines of the three steps. Add `engine.stepWarns.test.ts` with 6 tests: for each step, a failed run and a first request that is too large. Run it on the unchanged code and verify that it passes. This is the baseline for 3.2.

## 2. Move the pool

- [x] 2.1 Create `src/core/review/runPool.ts` with `RunLimit`, `runPool`, `MAX_PARALLEL_RUNS`, `REVIEW_PRIORITY`, and `STEP_PRIORITY`, with their comments. Do not change their code.
- [x] 2.2 Import them in `engine.ts` from `runPool.ts` and remove them from `engine.ts`. Change the import in `sharedLimit.test.ts`. Verify that `npm test` passes.

## 3. Share the run of one file

- [x] 3.1 Add the private method `runForFile` to `AgentReviewEngine` as in Decision 2. Make `verifyFile`, `judgeFile`, and `decideFile` use it. Verify that `npm test` passes.
- [x] 3.2 Run `engine.stepWarns.test.ts` again. Verify that all 6 tests pass with no change to the test. If a test fails, fix the code and do not change the test.

## 4. Check and document

- [x] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npx tsc --noEmit`. Verify that all pass and that the golden file did not change.
- [x] 4.2 Run `openspec-sync-specs` for this change to add `runPool.ts` to `src/core/review/SPEC.md`. Ask the user to approve it first. Verify with `openspec validate refactor-engine-steps --strict`.
