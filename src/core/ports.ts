import type { Logger } from '../logger.ts';
import type { HostDiscussion } from './publish/discussion.ts';
import type { ReviewContext } from './types.ts';

/** The host's basic actions on one change request's discussions, for
 * `publish` (`introduce-code-host` design, Decision 1). The publish rules are
 * in `Publisher`; an implementation only talks to the host. */
export interface DiscussionGateway {
  /** Every discussion of the change request, oldest first. */
  list(): Promise<HostDiscussion[]>;
  /** Starts a discussion on a new-file line. */
  createDiscussion(position: { file: string; line: number }, body: string): Promise<void>;
  reply(discussionId: string, body: string): Promise<void>;
  setResolved(discussionId: string, resolved: boolean): Promise<void>;
  /** Creates a general comment on the change request. */
  createNote(body: string): Promise<void>;
  /** Replaces the body of a comment. */
  updateNote(noteId: number, body: string): Promise<void>;
}

/** The raw values of a host's own CLI flags, by flag name. */
export type HostFlags = Record<string, string | undefined>;

/** One platform: what happens before a change request is known
 * (`introduce-code-host` design, Decision 1). `Snapshot` and `Source` are what
 * `review` writes to the findings file so that `publish` can find the same
 * change request again (`publish-target-from-findings` design). `Source`
 * names the change request; `Snapshot` is the state that `publish` needs to
 * post to it. Their shapes belong to the host. */
export interface CodeHost<Snapshot, Source, ReviewSettings = unknown, PublishSettings = unknown> {
  /** The host's own CLI flags for `review`. */
  readonly reviewFlags: Record<string, { type: 'string' }>;
  /** The host's own CLI flags for `publish`. None of them names a change request. */
  readonly publishFlags: Record<string, { type: 'string' }>;
  /** True when this run is about a change request. */
  isChangeRequest(flags: HostFlags): boolean;
  /** Reads the host's settings for `review` from its flags and environment
   * variables, or throws `ConfigError`. Synchronous, so a command can read it
   * at a fixed place among its other settings. */
  readReviewSettings(flags: HostFlags): ReviewSettings;
  /** Reads the host's settings for `publish`, in the same way. */
  readPublishSettings(flags: HostFlags): PublishSettings;
  /** Connects for `review`. Calls no API. Gives the change request of this run
   * and the source to write to the findings file. */
  openChangeRequest(
    settings: ReviewSettings,
    logger: Logger,
  ): Promise<{ changeRequest: ChangeRequest<Snapshot>; source: Source }>;
  /** Connects for `publish` to the change request that `source` names. Calls no API. */
  restore(settings: PublishSettings, source: Source, snapshot: Snapshot, logger: Logger): Promise<DiscussionGateway>;
  /** Checks the snapshot from a findings file, or throws an `Error` that names
   * the field. Pure: calls no API. */
  parseSnapshot(value: unknown): Snapshot;
  /** Checks the source from a findings file, or throws an `Error` that names
   * the field. Pure: calls no API. */
  parseSource(value: unknown): Source;
}

/** One change request, for `review`: the read side. */
export interface ChangeRequest<Snapshot> {
  /** Loads the review input, and the snapshot that `publish` needs. */
  load(): Promise<{ context: ReviewContext; snapshot: Snapshot }>;
}
