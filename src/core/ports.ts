import type { HostDiscussion } from './publish/discussion.ts';
import type { Finding, ResolvedDiscussion, ReviewContext, UnreviewedFile } from './types.ts';

/** Produces the engine's input. The engine does not know, and must not need
 * to know, which concrete `SourceProvider` it got a `ReviewContext` from. */
export interface SourceProvider {
  buildReviewContext(): Promise<ReviewContext>;
}

/** Publishes the engine's findings. One host (GitLab, GitHub, Gitea, ...)
 * implements this however fits its own API; the engine does not depend on
 * any of them. */
export interface SinkProvider {
  /** Publishes the findings, resolves the discussions that the review
   * declared fixed (only ones this tool started), and shows the files that
   * the review did not review. */
  publish(findings: Finding[], resolved?: ResolvedDiscussion[], unreviewedFiles?: UnreviewedFile[]): Promise<void>;
}

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
