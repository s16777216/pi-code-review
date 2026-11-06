## Context

`Severity` (`src/core/types.ts`) is a single-axis enum consumed in exactly four places: `passFail.ts`'s `SEVERITY_RANK` (threshold comparison), the `submit_review` tool's TypeBox schema in `agent.ts` (what the LLM is allowed to return), `engine.ts`'s `SYSTEM_PROMPT` (what the LLM is told the values mean), and `findings.ts`'s `VALID_SEVERITIES` (post-hoc validation shared by both the engine and the findings-file reader). `publisher.ts` only interpolates `finding.severity` into `**[${severity}]**` — it has no literal-value branching, so it needs no code change. See proposal.md for why this is changing.

## Goals / Non-Goals

**Goals:**
- Give the agent a real 4-level impact rubric (`critical`/`high`/`medium`/`low`) for diff-introduced bugs, replacing the binary `important`/`nit`.
- Keep `pre_existing` as an orthogonal 5th value with the same role it has today (bugs outside the diff, never blocking by default).
- Keep `--fail-on` / `FAIL_ON_SEVERITY` working against the new rank order, with a sensible new default.

**Non-Goals:**
- No migration path for old findings files written with `important`/`nit` — a findings file is produced and consumed within one `review` → `publish` pipeline run, never persisted across this change.
- Not introducing a second axis (e.g. letting a `pre_existing` finding also carry a critical/high/medium/low grade). `pre_existing` stays a single terminal value, matching today's shape.

## Decisions

- **Rank order**: `pre_existing (0) < low (1) < medium (2) < high (3) < critical (4)`, mirroring the existing `passFail.ts` shape (`pre_existing` pinned lowest, same comment rationale: a bug the change didn't introduce shouldn't block it by default). Alternative considered: giving `pre_existing` its own axis entirely (e.g. `{ introduced: bool, level: ... }`) — rejected as a bigger API/schema change than this TODO item calls for, and `Finding.severity` staying a flat enum keeps `passFail.ts`, the JSON schema, and the findings-file format unchanged in shape.
- **Default `--fail-on` threshold**: moves from `important` to `high`. Today's default blocks on any diff-introduced bug (`important`); of the new four levels, `high` is the closest match — it blocks on bugs that clearly misbehave on the common path, while letting `medium`/`low` findings surface as comments without failing CI by default. Alternative considered: defaulting to `medium` (closer to "block on anything but cosmetic") — rejected as more likely to produce noisy CI failures on launch than the existing `important` default did.
- **Agent prompt rewrite**: the four definitions are written as impact statements (what breaks, how visibly) rather than process statements (what kind of issue), so the agent has a concrete rubric instead of a vague size judgment. `pre_existing` keeps its original phrasing ("a bug in code the change did not modify") since that's a factual check, not a judgment call.
- **No findings-file migration shim**: rejected adding a compatibility layer that maps `important`→`high`/`nit`→`low` for old findings files, since `review` and `publish` are typically run back-to-back in the same CI job with a freshly generated file; carrying old literals forward would mask the fact that the agent's own output format changed.

## Risks / Trade-offs

- [Existing CI pipelines pinning `--fail-on important` or `--fail-on nit` will break (`ConfigError: Invalid FAIL_ON_SEVERITY value`)] → Expected and acceptable per proposal.md (marked **BREAKING**); the error message already names the valid values, so the failure is immediately actionable.
- [The agent may not cleanly separate `medium` vs `high` in practice, since "common path" vs "edge case" can be judgment calls] → Mitigation is prompt wording only for this change; if the four-level split proves too noisy in practice, that's a follow-up tuning change, not a blocker for this one.
- [Golden fixture (`__golden__/review-output.txt`) is a byte-exact snapshot of the system prompt and sample output] → Must be regenerated (not hand-edited) after the prompt and schema land, by rerunning the same render routine `characterization.test.ts` uses, then diffed by eye to confirm only the expected text moved.

## Migration Plan

Single-PR change: land the type/prompt/validation/config changes, update tests and the golden fixture, update docs. No rollout sequencing needed — `review` and `publish` are both updated atomically in the same deploy. Rollback is a plain revert, since no persisted data outlives one pipeline run.
