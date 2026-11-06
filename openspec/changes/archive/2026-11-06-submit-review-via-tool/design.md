## Context

See proposal.md - Why. The relevant code paths today:

- `src/core/review/engine.ts` (`runOnce`): runs one agent turn, then joins every `text` content block of the last assistant message and hands that string to `parseReviewOutput`.
- `src/core/review/findings.ts` (`parseReviewOutput`, `validateFinding`, `validateResolvedDiscussion`): `parseReviewOutput` does `JSON.parse` on that string, then calls the two `validate*` functions per item, dropping an invalid item with a `warn` log line.
- `src/core/review/agent.ts`: declares the agent's other tools (`get_file_content`, `list_discussions`) with the `AgentTool` shape from `@earendil-works/pi-agent-core`.
- `@earendil-works/pi-agent-core`'s `AgentToolResult` already supports a `terminate: true` hint: when every tool result of a batch sets it, the agent loop ends after that batch, with no further model call needed.
- `src/findingsFile.ts` reads a different, unrelated JSON file (the one `review` writes to disk for `publish`), through the same `validateFinding`/`validateResolvedDiscussion` functions. This change does not touch that path.

## Goals / Non-Goals

**Goals:**
- Make the agent's structured output a tool call, not free text, so a stray sentence cannot break parsing.
- Let the agent see and fix a validation error in the same run, instead of failing the run on the first bad item.
- Keep `validateFinding`/`validateResolvedDiscussion` as the single source of truth for what a valid finding/declaration is, shared with `findingsFile.ts`.

**Non-Goals:**
- Changing the on-disk findings file format, or anything in `src/findingsFile.ts` or `publish`.
- Changing the semantic checks that run after the engine produces findings (`relatesTo` resolution, the diff line check, anchors, fixed-declaration checks) — these stay in `runChecks` and are out of scope.
- Supporting incremental/additive `submit_review` calls. Each call is a complete, standalone replacement of the run's findings and declarations.

## Decisions

### One `submit_review` tool call is the only way to produce a run's output

The tool's parameters mirror `Finding`/`ResolvedDiscussion` directly (minus `anchor`, which the engine always computes itself and which the agent-facing schema never exposes):

```ts
const SubmitReviewParams = Type.Object({
  findings: Type.Array(Type.Object({
    file: Type.String(),
    line: Type.Integer(),
    severity: Type.Union([Type.Literal('important'), Type.Literal('nit'), Type.Literal('pre_existing')]),
    summary: Type.String(),
    relatesTo: Type.Optional(Type.String()),
  })),
  resolved: Type.Array(Type.Object({
    discussionId: Type.String(),
    reason: Type.String(),
  })),
});
```

`execute()` validates every item with the existing `validateFinding`/`validateResolvedDiscussion`. Alternative considered: validate only the fields TypeBox cannot express (e.g., non-empty strings) and trust TypeBox for the rest. Rejected: `validateFinding`/`validateResolvedDiscussion` are already the shared, tested contract with `findingsFile.ts`; re-deriving a second, partial check in the tool schema risks the two drifting apart.

### A call with any invalid item is rejected whole, not partially accepted

On any invalid finding or declaration, `execute()` returns `isError: true` with a message listing every invalid item (file/field/reason), and keeps none of that call's items — not even the valid ones. The model sees this as a tool error and can call `submit_review` again with a corrected, complete payload.

Alternative considered: keep today's behavior (accept the valid items, drop only the invalid ones, same as the old `parseReviewOutput`). Rejected: today's drop-and-log behavior existed because there was no way to tell the model anything was wrong — the run was already over. A tool call is answered before the run ends, so the model can simply fix the one bad field and resend everything, which is more reliable than permanently losing a finding to a typo. The proposal's "What Changes" already flags this as **BREAKING**.

Alternative considered: make `submit_review` additive (each call adds to a running total, invalid items are simply skipped). Rejected: additive calls need a mental model for "does a second call's `resolved` entry for the same `discussionId` replace or duplicate the first?" that the current code has no answer for. A full-replacement call has one unambiguous meaning: "this is the run's complete, current answer."

### A capped number of attempts, enforced inside the tool

```ts
export const MAX_SUBMIT_ATTEMPTS = 5;
```

A closure variable inside `createSubmitReviewTool` counts calls. On the `MAX_SUBMIT_ATTEMPTS`-th invalid call, the tool returns `isError: true, terminate: true` — the loop ends, and `runOnce` (below) sees no accepted submission, which becomes a retryable error at the run level (new agent, new tools, existing `MAX_RUN_TRIES` mechanism). This is the same mechanism `get_file_content`/`list_discussions` already use for their own call caps (`agent.ts`), except those let the run continue with the information already gathered, while `submit_review` has no such fallback — there is nothing to continue toward once the agent cannot submit a valid review.

Alternative considered: no cap, trust the model to converge. Rejected: an unbounded loop of bad calls burns tokens with no guaranteed end; every other tool in `agent.ts` already caps its calls per run for the same reason.

### `runOnce` tracks the submission via a closure, not the final message's text

```ts
let submission: ParsedReviewOutput | undefined;
const submitTool = createSubmitReviewTool((output) => { submission = output; });
```

`createAgent` gains an optional `onSubmit?: (output: ParsedReviewOutput) => void` parameter (default a no-op) so its only other caller, `estimateFirstRequest` (token-budget planning), keeps working unchanged — it only needs the tool's *declaration* for the estimate, never a real submission.

After `agent.prompt(prompt)` resolves, `runOnce` keeps its existing `stopReason` checks unchanged (`'error'` → retryable, `'aborted'`/`'length'` → throw). When the stop reason is normal: if `submission` is set, return `{ output: submission }`; otherwise return `{ retryableError: 'The agent run ended without an accepted submit_review call.' }`. This folds the "no submission" case into the exact same retry path `'error'` already uses — no new control flow in `runWithRetries`/`runAll`.

The final `text`/`parseReviewOutput` call is removed from `runOnce` entirely; nothing in the engine reads the last assistant message's text anymore.

### System prompt

Replace the final paragraph of `SYSTEM_PROMPT` (today: "When you are done, output ONLY a JSON object with no other text...") with an instruction to call `submit_review` once, when done, naming the same fields in the same words (so the per-field guidance — what "line" means, when to use `relatesTo`, etc. — does not need to move into the tool's `description`, which stays short).

### `findings.ts` cleanup

`validateFinding`/`validateResolvedDiscussion`/`ReviewFailureError` stay, now with two callers: `findingsFile.ts` and the new tool. `parseReviewOutput`/`parseFindings`/`extractJsonText`/`withoutAgentAnchor` lose their only caller (`engine.ts`'s `runOnce`). Confirm with a repo-wide search before deleting them (`cli/` or elsewhere might not use them, but check); if nothing else calls them, delete them and their dedicated tests along with this change, rather than leaving dead exports.

## Risks / Trade-offs

- [Risk] A model whose tool-calling path is less reliable than its plain-text path could, in principle, do worse under this design. → Mitigation: tool-calling (function calling) is the standard, provider-enforced structured-output mechanism for the models this project targets (OpenAI-compatible APIs via `pi-ai`); it is strictly more constrained than free text, so this risk is theoretical. The existing `get_file_content`/`list_discussions` tools already depend on the same mechanism working reliably.
- [Risk] Rejecting a whole call on one bad item could make a run take more turns (and tokens) than the old drop-and-keep behavior for a model that reliably gets most fields right but flubs one. → Mitigation: the error message names the exact bad item and field, which is the kind of feedback that resolves in one extra turn for a capable model; the `MAX_SUBMIT_ATTEMPTS` cap bounds the cost, and run-level retry already exists as a backstop.
- [Risk] Deleting `parseReviewOutput` and friends removes code that might be useful for a future "replay a saved raw agent response" debugging tool. → Mitigation: none planned; `git history` keeps the code retrievable if ever needed, and dead exports are a worse default than deletion.

## Migration Plan

No data migration. This changes only the in-memory agent protocol for one `review` run; the on-disk findings file format and `publish` are untouched. Deploy as a normal release; no feature flag, since there is no way to keep the old free-text path working alongside the new tool without maintaining two parsers for an exceptional, broken case.
