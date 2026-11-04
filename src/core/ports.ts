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
 * (`introduce-code-host` design, Decision 1). `Snapshot` is what `review`
 * writes to the findings file so that `publish` can find the same change
 * request again; its shape belongs to the host. */
export interface CodeHost<Snapshot, Settings = unknown> {
  /** The host's own CLI flags, added to the flags of each command. */
  readonly flags: Record<string, { type: 'string' }>;
  /** True when this run is about a change request. */
  isChangeRequest(flags: HostFlags): boolean;
  /** Reads the host's settings from its flags and environment variables, or
   * throws `ConfigError`. Synchronous, so a command can read it at a fixed
   * place among its other settings. */
  readSettings(flags: HostFlags): Settings;
  /** Connects with the settings. Calls no API. */
  connect(settings: Settings, logger: Logger): Promise<HostConnection<Snapshot>>;
  /** Checks the snapshot from a findings file, or throws an `Error` that names
   * the field. Pure: calls no API. */
  parseSnapshot(value: unknown): Snapshot;
}

/** A host with its settings read: gives the change request of this run. */
export interface HostConnection<Snapshot> {
  /** The change request, for `review`. */
  openChangeRequest(): ChangeRequest<Snapshot>;
  /** The discussions of the change request that the snapshot names, for `publish`. */
  restore(snapshot: Snapshot): DiscussionGateway;
}

/** One change request, for `review`: the read side. */
export interface ChangeRequest<Snapshot> {
  /** Loads the review input, and the snapshot that `publish` needs. */
  load(): Promise<{ context: ReviewContext; snapshot: Snapshot }>;
}
