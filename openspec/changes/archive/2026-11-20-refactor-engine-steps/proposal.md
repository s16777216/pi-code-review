## Why

`src/core/review/engine.ts` has 952 lines. It is the largest file of the code, and the next one has 405 lines. It mixes three kinds of code: the pool that limits parallel runs, the order of the steps, and the run of one agent for one file.

The three steps with one run for each file (`verifyFile`, `judgeFile`, `decideFile`) repeat the same five actions. Each step builds the prompt and the agent, checks the size of the first request, runs with retries, and writes a `warn` line when the run fails. A change to this flow needs three edits that must stay equal.

## What Changes

- Move `RunLimit`, `runPool`, `MAX_PARALLEL_RUNS`, `REVIEW_PRIORITY`, and `STEP_PRIORITY` from `engine.ts` to a new file `runPool.ts`. The code does not change. `engine.ts` imports them from the new file.
- Add one private method of `AgentReviewEngine` that runs one agent for one file with the five actions. `verifyFile`, `judgeFile`, and `decideFile` call it and pass only what differs.
- **No change of behavior.** The prompts, the log lines, the warning codes, the retries, and the output stay the same.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none)

This change moves code and does not change a requirement. The file `.openspec.yaml` has `skip_specs: true`.

## Impact

- Code: `src/core/review/engine.ts`, and the new file `src/core/review/runPool.ts`.
- Tests: `sharedLimit.test.ts` changes its import. The new `engine.stepWarns.test.ts` pins the `warn` lines. The other tests stay as they are.
- Docs: `src/core/review/SPEC.md` gets one line for `runPool.ts` (it needs the approval of the user).
- Risk: a changed log line or warning code. The existing tests and the new `engine.stepWarns.test.ts` cover this risk.
