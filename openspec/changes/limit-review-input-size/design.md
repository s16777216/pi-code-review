# Design

## Context

Facts from the dependencies, checked in `node_modules`:

- `pi-ai`'s `clampMaxTokensToContext` sets the answer budget to `min(maxTokens, contextWindow - estimate - 4096)`, and never less than 1. Every API module calls it through `buildBaseOptions`.
- `pi-ai` exports `estimateContextTokens` at `@earendil-works/pi-ai/utils/estimate`. The `./utils/*` subpath is in its `package.json` `exports`.
- `pi-agent-core`'s agent loop runs `while (true)` as long as the model asks for tools. It has no turn limit option.
- `StopReason` includes `"length"`.

`buildModel` in `src/cli/index.ts` sets `contextWindow: 128_000`. `--max-tokens` defaults to `32_000`. See `proposal.md` for the motivation.

## Goals / Non-Goals

**Goals:**
- Make the answer budget match the real model.
- Stop a review that cannot fit, before it costs a model call.
- Give a clear error when the answer is cut.
- Put a ceiling on what the tool adds to the input.

**Non-Goals:**
- Split a large merge request into batches and merge the results. This needs its own design.
- Shorten the diff in the prompt. A cut diff would hide changed code from the review without a signal.
- Count tokens exactly. An estimate is enough for a guard.
- Make the two tool limits configurable. Fixed values are enough until real runs show a need.

## Decisions

### Decision 1: One new setting, with the current value as default

`--context-window` / `OPENAI_CONTEXT_WINDOW` follows the `--max-tokens` pattern in `config.ts`: optional, positive integer, flag first. The check also requires `contextWindow > maxTokens`. A smaller window cannot hold the requested answer, so that value is a configuration error. `buildModel` reads the value from the config.

Alternative: look up the window from `pi-ai`'s model list. The tool uses OpenAI-compatible endpoints with any model name, so most names are not in that list.

### Decision 2: Estimate with `pi-ai`'s own function

The engine builds the same context that the agent sends (system prompt, tools, user prompt) and calls `estimateContextTokens`. It then applies the same formula as `clampMaxTokensToContext`. The guard and the clamp therefore agree. When the estimate leaves less than 4,096 answer tokens, the engine throws `ReviewFailureError` with both numbers.

The check runs only before the first call. Later tool results can still grow the input. Decision 3 limits that growth.

Alternative: count characters and divide by 4. That can disagree with the clamp that `pi-ai` applies.

### Decision 3: Limit the tool by size per call and by number of calls

Each result is cut at 100,000 characters, about 25,000 tokens. The text ends with `[cut: showing 100000 of N characters]`, so the agent knows that it has a partial file. After 30 calls, the tool returns an error and does not fetch the file.

The worst-case tool input is then 30 × 100,000 characters. That is larger than a 128,000-token window. The limits stop an endless loop. They do not guarantee a fit. The `length` check in Decision 4 covers the rest.

Alternative: one total character budget for all calls. This is more exact, but the agent cannot predict when the budget will end. A call count is simpler to explain in the error text.

### Decision 4: Check `stopReason: "length"` before parsing

The engine already throws for `error` and `aborted`. It adds `length` to that check, with a message that names `--max-tokens` and `--context-window`. Cut JSON is never parsed.

## Risks / Trade-offs

- [The estimate is wrong for some models] → The guard uses the same estimate as the clamp. A wrong estimate affects both in the same way, and the `length` check catches the result.
- [100,000 characters is too small for a generated file] → The agent sees the cut marker. The file stays in the diff hunks.
- [30 calls is too small for a merge request with more than 30 files] → The agent already has every diff. It needs the full file only for context. The limit can become a setting later.
- [The `harden-review-engine-output` change also edits `engine.ts`] → Merge that change first, then rebase this one.
