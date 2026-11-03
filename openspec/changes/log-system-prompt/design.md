# Design

## Context

- `AgentReviewEngine.runOnce` builds the system prompt with `buildSystemPrompt(language, batch)` when it creates the agent. It logs `{ batch?, prompt }` with the message `review prompt`, then the final assistant message and the raw response.
- The system prompt is about 1,000 tokens. It differs between a single run and a batch, and with `--language`.
- `pi-ai` caps the answer at the context window minus the estimated input minus 4,096 tokens. A batch's first request can use up to half of the window. Tool results add to the input during the run.

See `proposal.md` for the motivation. The project owner decided to do both items in one change.

## Goals / Non-Goals

**Goals:**
- The debug output shows the exact system prompt of each run.
- The README lets a user pick a context window that leaves room for the answer.

**Non-Goals:**
- Reject a small `--context-window` in the configuration check. The right bound depends on the model and on the merge request.
- Log the tool declarations. They do not change between runs.

## Decisions

### Decision 1: One more field on the existing log line

The `review prompt` line gets a `systemPrompt` field, next to `prompt`. A retry logs it again, as it logs the prompt again. One line for each try keeps the number of debug lines the same, and it puts the two prompts of one try together.

Alternative: one line for the system prompt at the start of the review. In batch mode, each batch has its own system prompt, so one line would not be enough.

### Decision 2: State the answer room in the README

The README states that a run has at most `contextWindow − input − 4096` tokens for its answer, that the first request of a batch can use up to half of the window, and that file reads add to the input. It then gives the bound: `--context-window` should be at least about twice `4096 + --max-tokens`, and should be the model's real window. With the defaults (`128000` and `32000`), the bound is met.

## Risks / Trade-offs

- [The debug output gets longer] → About 1,000 tokens more for each try, only under `--debug`.

## Migration Plan

No migration.

## Open Questions

(none)
