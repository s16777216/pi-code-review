## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `review()` in `src/core/review/engine.ts` runs the review agents with `runAll`, merges the findings, and calls `runChecks`. `runChecks` calls `betweenSteps` (deduplication and verification), and then it calls the judgment step and waits for it.
- `runPool(count, job, stopped)` starts at most `MAX_PARALLEL_RUNS` (3) workers for one call. Each phase has its own pool. The pools of two phases never run at the same time today, so the total stays at 3.
- `judgeDiscussions` reads the discussions with `context.listDiscussions()` (cached), selects the discussions with no argument, and runs one judge run for each file in a pool. A failed run gives no declaration and a `warn` line.
- The requirement "Limit parallel runs" says that all runs use one limit of 3. It was true because the phases did not overlap.

## Goals / Non-Goals

**Goals:**
- Start the judge at the beginning of the review, so its time overlaps the time of the review agents.
- Keep at most 3 agent runs at the same time in the whole review.
- Keep the result of a review the same.

**Non-Goals:**
- Raise the limit of 3 runs, or give the judge its own limit.
- Change the prompts, the checks, or the order of the findings.
- Make the deduplication step, which is one call outside the pools, count toward the limit.

## Decisions

### Decision 1: Start the judge before the review agents

`review()` starts `judgeDiscussions` before it calls `runAll`, and keeps the promise. `runChecks` takes a function that returns the promise, so it waits only when it needs the result, after the deduplication and verification steps.

Alternative: start the judge after the review agents and before the deduplication step. This hides only the time of the dedup and verifier steps, and gives up the time of the review agents.

### Decision 2: One shared limit for all pools

The limit moves from each `runPool` call to the engine. The engine has one counter of active runs, and every pool job takes a slot before it starts and gives it back when it ends. The waiting jobs start in the order in which they asked for a slot.

The judge jobs ask for their slots after the review agents have asked for theirs. The judge then uses a slot that no review agent run needs: at the end of the review agent runs, and while the review agents run less than 3 at a time. The verifier runs ask later still, so a judge run that started earlier is not stopped.

Alternative: a separate limit of 3 for the judge. The total would be up to 6 runs at the same time, which can break a rate limit of the model provider that the limit of 3 protects.

### Decision 3: The judge does not fail the review, and the review stops the judge

A judge failure already gives no declaration and a `warn` line, and it does not fail the review. The promise of the judge must not leave an unhandled rejection when the review fails first. `review()` attaches a handler that only records the error, and the wait in `runChecks` still gets the original error.

When the review fails, `review()` sets a stop flag. The pool of the judge reads it through the `stopped` argument of `runPool`, so it starts no new judge run. A run that already started ends by itself.

### Decision 4: The log order changes

The `info` summary line of the judgment step can now come before the `Review focus` lines. The content of the lines does not change. The golden file changes because it records the order of the lines.

## Risks / Trade-offs

- The judge takes slots from the review agents and the review agent runs end later → The judge asks for its slots after the review agent runs, so it takes only a free slot. The total time cannot be worse than the serial order by more than the time of a judge run that is still active when a verifier run asks for a slot.
- A bug in the shared counter holds a slot and stops the review → A test checks that each job gives back its slot also when it throws, and that the active count never goes over 3.
- The `runPool` change affects all steps → The tests of the limit for the review agents, the verifier, and the judge stay, and one new test covers the overlap.

## Migration Plan

No data migration. To roll back, start the judge from `runChecks` again, as before, and give each pool its own limit.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md` (capability `ai-diff-review`). The text may need no change.

## Open Questions

- Whether the deduplication step must count toward the limit. It is one call and it runs when the review agents have ended, so it does not matter today.
