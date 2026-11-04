# Design

## Context

Facts in the current code (`src/core/review/`):

- `ReviewContext.changedFiles` is `ChangedFileDiff[]`: plain data (`oldPath`, `newPath`, `hunks` as raw text, `deleted?`, `omitted?`) that the host builds. The GitLab provider and the test fakes build it as object literals.
- `diff.ts` has free functions over that data:
  - `parseDiffHunks`, `numberDiffHunks`, `splitHunks`, `hunkStartLine`, and `changedFilePath`.
  - `checkNewFileLine(files, path, line)` and `getNewFileLineText(files, path, line)`. These find the file by `newPath`, then parse its hunks again on each call.
- Who uses them:
  - `batch.ts` calls `splitHunks` and `hunkStartLine`.
  - `prompt.ts` calls `numberDiffHunks` and `parseDiffHunks` (for the +/- counts), and has its own `fileState`.
  - `checks.ts` calls `checkNewFileLine` up to three times for one finding (twice in `keepOwnLines`, once in `runChecks`) and `getNewFileLineText` once. `keepOwnLines` joins the hunk text of a batch's items of one path into a new `ChangedFileDiff`, so that it can call `checkNewFileLine` on it. `checkResolved` scans `changedFiles` for a deleted file.
- A `BatchItem` is `{ file: ChangedFileDiff; hunks: string; part? }`. For a part of a split file, `hunks` holds only that part's text.
- `buildReviewPrompt` marks the batch's files in the file list by object identity (`inBatch.has(file)`), which works because a `BatchItem.file` is the context's own object.
- `engine.ts` threads `batch: PromptBatch | undefined` through `planRuns`, `estimateFirstRequest`, `createAgent`, `runAll`, `runWithRetries`, and `runOnce`, and branches on it in five places:
  - The system prompt paragraph (`buildSystemPrompt`).
  - The prompt layout (`buildReviewPrompt`).
  - The log field (`batchField`).
  - The merge (`keepOwnLines` or not).
  - The failure text (`batchFailure`).

See `proposal.md` for the motivation. The project owner decided:

1. Model the diff with value objects (item 1 of the object-oriented review).
2. Replace `batch?` with polymorphism (item 2).
3. Leave the split of `AgentReviewEngine` into smaller objects for later (item 3), and do not turn the checks or the agent tools into objects (item 4).

## Goals / Non-Goals

**Goals:**
- Each diff is parsed once per review, and the line rules live in one class.
- No code outside the scope classes checks whether a run is a batch.
- Byte-identical prompts, and the same findings, log lines, and errors.

**Non-Goals:**
- Change `ReviewContext` or any port. Hosts keep building plain `ChangedFileDiff` data.
- Split `AgentReviewEngine` into a planner, a run, a retry policy, and a scheduler.
- Turn the checks in `checks.ts` or the agent tools into classes.
- Move `ReviewFailureError` out of `findings.ts`.

## Decisions

### Decision 1: `ChangedFile`, a value object built from the host's data

```ts
// core/review/changedFile.ts
class ChangedFile {
  static from(diff: ChangedFileDiff): ChangedFile;
  readonly path: string;            // today's changedFilePath
  readonly oldPath: string | null;
  readonly newPath: string | null;
  readonly deleted: boolean;
  readonly omitted?: OmittedReason;
  readonly hunkText: string;        // the raw text, for the token estimate
  hasNewLine(line: number): boolean;        // an added or context line
  newLineText(line: number): string | null;
  numbered(): string;               // today's numberDiffHunks output
  counts(): { added: number; removed: number };
  state(): string;                  // today's fileState: added, deleted, renamed from X, modified
  hunks(): ChangedFile[];           // one ChangedFile per hunk, same paths and line numbers
  withHunks(parts: ChangedFile[]): ChangedFile;  // the same file with only these hunks
}
```

The constructor parses the hunk text once, with today's `parseDiffHunks`, and keeps the lines. Every method answers from that parse, with the same rules as today's functions. `parseDiffHunks`, `numberDiffHunks`, `splitHunks`, and `hunkStartLine` stay in `diff.ts` as the parsing algorithm, with their tests. `ChangedFile` is immutable.

### Decision 2: `ChangeSet`, the files of one change

```ts
class ChangeSet {
  static from(files: ChangedFileDiff[]): ChangeSet;   // keeps the host's order
  readonly files: readonly ChangedFile[];
  file(path: string): ChangedFile | undefined;        // by newPath, as today
  lineCheck(path: string, line: number): NewFileLineCheck;   // same three values
  lineText(path: string, line: number): string | null;
  isOmitted(path: string): boolean;
  isDeleted(path: string): boolean;                   // by oldPath or newPath, as checkResolved
  reviewable(): ChangedFile[];                        // not omitted
}
```

`AgentReviewEngine.review` builds it once with `ChangeSet.from(context.changedFiles)` and passes it to the planner, the scopes, and the checks. `checkNewFileLine` and `getNewFileLineText` are removed. Their tests move to `changedFile.test.ts`, as tests of `lineCheck` and `lineText`, with the same cases.

`ReviewContext.changedFiles` stays `ChangedFileDiff[]`, and the agent's file-content tool keeps reading it. The value objects are the engine's own model, not part of the host contract.

### Decision 3: `RunScope`, one class for each kind of run

```ts
// core/review/scope.ts
interface RunScope {
  /** The paragraph added to the system prompt, or null. */
  systemPromptParagraph(): string | null;
  prompt(context: ReviewContext, changes: ChangeSet): string;
  logFields(): { batch?: number };
  /** Drops this run's findings outside its own lines (today's keepOwnLines). */
  filterFindings(findings: Finding[], changes: ChangeSet, logger: Logger): Finding[];
  describeFailure(error: unknown): unknown;
}

class WholeChange implements RunScope { … }     // today's batch === undefined
class Batch implements RunScope {               // part k of n
  constructor(items: BatchItem[], index: number, count: number);
}
```

- `WholeChange`:
  - It adds no paragraph.
  - Its prompt is today's single-run prompt.
  - It has no log field.
  - It keeps every finding.
  - It returns the error unchanged.
- `Batch`:
  - Its paragraph, its prompt, its `{ batch: k }` field, and its `Batch k of n failed: …` text are today's.
  - `filterFindings` is today's `keepOwnLines`, with the same `outside_batch` warning. It checks a line with `item.file.hasNewLine`, so it no longer joins strings.
- `planRuns` returns `RunScope[]`. Every method that takes `batch` now takes a `RunScope`.
- `buildSystemPrompt(language, scope)` adds `scope.systemPromptParagraph()`. With no scope, it uses `WholeChange`, so today's tests of the single-run system prompt keep their meaning.

### Decision 4: `BatchItem` holds a `ChangedFile`

A `BatchItem` becomes `{ file: ChangedFile; part?: { index; count } }`. For a part, `file` is the `withHunks` result, so the part's text, numbering, and lines come from the object. `planBatches` takes `ChangedFile[]` (the reviewable files), and packs them with today's rules, order, and errors.

The batch file list marks the batch's files by path, not by object identity, because a part is a new object. Each changed file has one path in a change, so the marks do not change.

### Decision 5: Pin the behavior first

Before any code moves, a new characterization test records today's exact output for fixed inputs:
- The single-run prompt and system prompt.
- The prompt of each batch, including a split file, its parts, and an omitted file.
- The findings and warnings that come out of `runChecks` for a fixed agent output with valid lines, lines outside a batch, an omitted file, an unknown `relatesTo`, and a fixed declaration.

The test compares them with stored strings. It stays unchanged through the refactor, so any change in output fails it.

## Risks / Trade-offs

- [More types] → Two value classes and one interface with two classes replace about ten free functions and five branches. The free parsing functions stay as the algorithm.
- [A hidden output change] → Decision 5's characterization test, the existing engine and prompt tests, and the unchanged entrypoint tests catch it.
- [The ChangeSet and the context can drift] → The engine builds the `ChangeSet` from the context once per review, and the context does not change during a review.

## Migration Plan

No migration. Nothing outside `src/core/review/` changes.

## Open Questions

(none)
