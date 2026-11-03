# Proposal

## Why

Two gaps from the end-to-end run on gitlab.com:

- `--debug` logs the user prompt and the raw response of each run, but not the system prompt. The system prompt changes with `--language` and with batches, so the debug output cannot show whether the language sentence or the batch paragraph was sent.
- The README does not say that a small `--context-window` leaves little room for the answer. `pi-ai` keeps 4,096 tokens free, and a batch can use up to half of the window. To set up the batch test, the answer room had to be worked out by hand before a window was chosen. With a smaller window, a run stops at the token limit, and the error only says to raise the setting.

## What Changes

- Under `--debug`, the `review prompt` log line of each run also has the system prompt that the run sends, in a `systemPrompt` field.
- The README explains how much answer room a run has, and gives a lower bound for `--context-window`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `debug-logging`:
  - Modified: "Log the AI review's prompt and response under debug" — also logs the system prompt.

## Impact

- Affected code: `src/core/review/engine.ts` (one log field).
- Affected tests: `src/core/review/engine.test.ts`.
- Affected docs: `README.md`, the "Debug logging" and "Large merge requests" sections, and the `OPENAI_CONTEXT_WINDOW` row.
- No change to any output except the debug log.
