# Design

## Context

`SYSTEM_PROMPT` is a constant in `src/core/review/engine.ts`. `AgentReviewEngine` gets its settings through `AgentReviewEngineOptions`. `config.ts` resolves each setting from a CLI flag first and an environment variable second. See `proposal.md` for the motivation.

## Goals / Non-Goals

**Goals:**
- Let a team get finding summaries in its own language with one setting.
- Keep the output of a run without the setting the same as today.

**Non-Goals:**
- Translate the severity labels or other text in `publish` comments. The `TODO.md` item "publish 可自定義輸出模板" covers comment text.
- Translate the system prompt itself. The model follows English instructions well and writes in the requested language.
- Check the language value against a list of known languages.

## Decisions

### Decision 1: Free-text value, passed to the model as written

The value goes into the prompt as the user wrote it: `Traditional Chinese`, `zh-TW`, and `繁體中文` all work. The model understands each form.

The config check rejects three cases: empty after trimming, longer than 64 characters, and a line break. These rules keep the value to one short name. They also stop a long value from adding new instructions to the system prompt by mistake.

Alternative: accept only BCP 47 codes such as `zh-TW`. This needs a validation list and blocks names such as `Taiwanese Mandarin` that the model understands.

### Decision 2: Add one sentence to the system prompt only when the setting is given

`AgentReviewEngineOptions` gets `language?: string`. The engine builds the system prompt from the existing text. When `language` is set, it adds this sentence at the end:

`Write every "summary" in <language>. Keep the JSON field names and the "severity" values exactly as specified above.`

When `language` is not set, the system prompt is the same text as today, byte for byte. A test checks this.

Alternative: put the instruction in the user prompt. The system prompt already holds the output rules, so the language rule belongs with them.

### Decision 3: Only `review` takes the setting

The language changes only what the model writes. `publish` does not call the model, so `parsePublishCliOptions` does not accept `--language`. `parseArgs` with `strict: true` then rejects the flag for `publish`, as it already does for `--model`.

## Risks / Trade-offs

- [The model translates the severity value, for example to `重要`] → The prompt sentence says to keep severity values. A translated severity makes that finding invalid, and the engine handles it like any other invalid finding.
- [The model mixes languages in one summary, for example code names in English] → This is acceptable and often useful for identifiers.
- [The `harden-review-engine-output` change also edits `SYSTEM_PROMPT` in `engine.ts`] → Merge that change first, then rebase this one.
