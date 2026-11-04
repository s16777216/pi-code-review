# Design

## Context

Facts in the current code, after `separate-gitlab-from-shared-code`:

- `core/ports.ts` has `SourceProvider` (`buildReviewContext()`) and `SinkProvider` (`publish(findings, resolved, unreviewedFiles)`).
- `GitLabSourceProvider`:
  - It builds the `ReviewContext` from a `MergeRequestProvider` (the GitLab client).
  - It keeps the diff refs for `getDiffRefs()`, a method that is not on the port.
  - It maps each `GitLabDiscussion` to a `ReviewDiscussion`. The mapping drops system notes, strips the marker, and reads `fromThisTool` and the anchor from the marker.
- `GitLabSinkProvider` holds all of the publish rules, written against `GitLabDiscussion`. These are:
  - Indexing the existing discussions by ID and by open or resolved own anchor.
  - Deciding each finding's target: skip, reply, or new.
  - Merging findings on one line or one discussion.
  - The comment body.
  - Reply and reopen.
  - The fixed-declaration checks.
  - The comment on unreviewed files, through `unreviewedNote.ts`.
  - The `onDiscussionError` test hook.

  The GitLab-specific parts are few: the client calls, and the position, which needs the diff refs and `oldPath`, `newPath`, and `newLine`.
- `providers/gitlab/marker.ts` and `discussions.ts` hold the marker format and the rules that read it. These are `hasMarker`, `stripMarker`, `isFromThisTool`, `discussionAnchor`, and `isDiscussionResolved`, plus `userNotes`, which drops system notes.
- `cli/index.ts`:
  - It parses the GitLab flags `--gitlab-url`, `--project-id`, `--mr`, and `--token` in both commands.
  - It builds `GitLabClient`, `GitLabSourceProvider`, and `GitLabSinkProvider`.
  - `runReview` and `runPublish` take a GitLab client, so that tests can pass a fake.
- `config.ts` builds `ReviewConfig` and `PublishConfig`, each with a `gitlab` field read by `loadGitlabConnectionConfig`. The GitLab settings are read first, so a missing GitLab setting is reported before a missing OpenAI setting.
- `readFindingsFile(path, parseDiffRefs)` checks the diff refs with a parser that the caller gives, before any API call.
- The CLI handles exactly one merge request in each run.

See `proposal.md` for the motivation. The project owner decided:

1. Design the ports in an object-oriented way.
2. Merge the platform's discussion actions with the merge request object: one class implements both the review side and the discussion side. Keep a separate, small entry object for what happens before a merge request is known.
3. Keep the interfaces small and separate, even where one class implements several of them.
4. Split the general comment into two actions, create and update, instead of one "upsert".

## Goals / Non-Goals

**Goals:**
- `cli/index.ts`, `config.ts`, and `findingsFile.ts` reference no GitLab name. The only reference to the GitLab provider is `gitlabHost`, in the composition root.
- The publish rules exist once, in `core/`, and are tested without GitLab types.
- A second host needs one class and one entry object, with no change to `core/` or the CLI.

**Non-Goals:**
- Choose between hosts at run time, for example by detecting `GITHUB_ACTIONS` or with a `--host` flag. That needs a second host first.
- Change the findings file format. The snapshot is still written as `diffRefs`, with the same fields.
- Rename any flag, environment variable, or log message.
- Turn `runReview` and `runPublish` into command classes. Passing the ports as parameters gives the same testability.

## Decisions

### Decision 1: Three ports, by scope

```ts
// core/ports.ts

/** One platform. What happens before a change request is known. */
interface CodeHost<Snapshot> {
  /** The platform's own CLI flags, merged into each command's flags. */
  readonly flags: Record<string, { type: 'string' }>;
  /** True when this run is about a change request (GitLab: an MR iid is set). */
  isChangeRequest(flags: HostFlags): boolean;
  /** Reads the platform's settings, or throws ConfigError. Calls no API. */
  open(flags: HostFlags, logger: Logger): Promise<ChangeRequest<Snapshot>>;
  /** Checks the snapshot from a findings file, or throws. Pure: calls no API. */
  parseSnapshot(value: unknown): Snapshot;
  /** Reads the settings and gives the discussions of the change request
   * that the snapshot names, or throws ConfigError. Calls no API. */
  restore(snapshot: Snapshot, flags: HostFlags, logger: Logger): Promise<DiscussionGateway>;
}

/** One change request, for `review`. */
interface ChangeRequest<Snapshot> {
  /** Loads the review input, and the snapshot that `publish` needs. */
  load(): Promise<{ context: ReviewContext; snapshot: Snapshot }>;
}

/** The platform's basic actions on one change request's discussions, for `publish`. */
interface DiscussionGateway {
  list(): Promise<HostDiscussion[]>;
  createDiscussion(position: { file: string; line: number }, body: string): Promise<void>;
  reply(discussionId: string, body: string): Promise<void>;
  setResolved(discussionId: string, resolved: boolean): Promise<void>;
  createNote(body: string): Promise<void>;
  updateNote(noteId: number, body: string): Promise<void>;
}
```

`HostFlags` is `Record<string, string | undefined>`, the raw values of the host's own flags. `open` and `restore` are async because creating the GitLab client is, but they still call no API, so a missing setting is reported before any network call.

The ports are split by scope:
- `CodeHost` has no merge request yet.
- `ChangeRequest` is one merge request on the read side.
- `DiscussionGateway` is one merge request on the write side.

`review` gets only `ChangeRequest`, so it cannot post anything, by type. `publish` gets only `DiscussionGateway`.

`load()` returns the snapshot together with the context, so there is no method that fails when it is called too early, as `getDiffRefs()` does today.

`ReviewContext.listDiscussions` stays as it is. `ChangeRequest.load()` builds it from the same `list()` call that the gateway has, with the shared mapping of Decision 4.

Alternative: one `CodeHost` that also holds the discussion actions. Every action would then need the merge request as a parameter, or the host would have a state before and after a merge request is bound to it.

### Decision 2: One GitLab class, one entry object

`providers/gitlab/mergeRequest.ts` has `class GitLabMergeRequest implements ChangeRequest<GitLabDiffRefs>, DiscussionGateway`. It keeps the client, the MR iid, and, once known, the diff refs. `createDiscussion` builds today's GitLab position from the diff refs and the file and line.

`providers/gitlab/host.ts` exports `gitlabHost: CodeHost<GitLabDiffRefs>`:
- `flags` declares `gitlab-url`, `project-id`, `mr`, and `token`.
- `isChangeRequest` is today's `isMergeRequestPipeline`.
- `open` and `restore` read the settings with `loadGitlabConnectionConfig`, create the client, and return a `GitLabMergeRequest`.
- `parseSnapshot` is `parseGitLabDiffRefs`.

`GitLabClient` stays as the thin HTTP layer under the class. `providers/index.ts` exports only `gitlabHost`.

### Decision 3: `Publisher` holds the publish rules

`core/publish/publisher.ts` has `class Publisher`, built from a `DiscussionGateway` and a logger. It moves the following from `GitLabSinkProvider` and `unreviewedNote.ts` without changing any rule or log line:
- The indexes.
- The target decision.
- The merge of findings.
- The comment body.
- Reply and reopen.
- The checks before resolving.
- The comment on unreviewed files.

`publish(findings, resolved, unreviewedFiles)` keeps today's order: the findings, then the declarations, then the comment on unreviewed files. The `onDiscussionError` hook becomes a `Publisher` option.

The rules use `HostDiscussion` (Decision 4) in place of `GitLabDiscussion`. The `GitLabSinkProvider` tests that check rules move to `publisher.test.ts`, with a fake gateway, and keep their assertions.

### Decision 4: A host-neutral discussion, and the marker in `core/`

`core/publish/discussion.ts` defines:

```ts
interface HostDiscussion {
  id: string;
  /** `null` for a general comment. */
  position: { file: string | null; line: number | null; commit: string | null } | null;
  /** True when the platform reports every resolvable note as resolved. */
  resolved: boolean;
  /** The notes that a person or this tool wrote, oldest first. */
  notes: { id: number; author: string; body: string }[];
}
```

The adapter does what only it knows: it drops GitLab system notes, and it computes `resolved` with today's rule. `marker.ts` and the rules that read the marker move to `core/publish/`:
- `hasMarker` and `stripMarker`.
- `isFromThisTool` and `discussionAnchor`.
- The unreviewed-comment marker.
- The mapping from `HostDiscussion` to `ReviewDiscussion`.

The `Publisher` and `ChangeRequest.load()` use the same mapping.

### Decision 5: The CLI depends on the ports only

- `runReview({ config, changeRequest, provider, logger })` and `runPublish({ config, gateway, findingsFile, logger })` take the ports. The CLI tests fake `ChangeRequest` and `DiscussionGateway`, so they no longer need GitLab types.
- `runReviewCommand` and `runPublishCommand` get a `CodeHost`. `main` passes `gitlabHost`, so `main` is the only place that names the GitLab provider.
- Each command parses its own flags plus `host.flags`.
- `ReviewConfig` and `PublishConfig` lose their `gitlab` field. The host reads its own settings in `open` or `restore`.
- To keep today's error order, each command calls `host.open` or `host.restore` before it loads its other settings. `publish` reads and checks the findings file with `host.parseSnapshot` before `restore`, as today.
- `FindingsFile<Snapshot>` keeps its `diffRefs` key.

### Decision 6: Folders

- `core/ports.ts`: the three ports and `HostFlags`.
- `core/publish/`: `publisher.ts`, `discussion.ts`, and `marker.ts`.
- `providers/gitlab/`: `client.ts`, `config.ts`, `diffRefs.ts`, `mergeRequest.ts`, and `host.ts`.

`sourceProvider.ts`, `sinkProvider.ts`, `discussions.ts`, `marker.ts`, and `unreviewedNote.ts` are removed from `providers/gitlab/`.

## Risks / Trade-offs

- [The ports are shaped by one platform] → GitHub's review threads, resolve model, and general comments differ from GitLab's, so the ports may change when GitHub is added. They are internal types, because the package has no library API, so a change is cheap.
- [A large move] → The tasks move one part at a time, and `npm test` passes after each task. The rule tests move with their assertions unchanged.

## Migration Plan

No migration. Nothing outside `src/` changes, except the README's architecture lines.

## Open Questions

(none)
