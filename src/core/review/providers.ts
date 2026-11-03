import type { Finding, ResolvedDiscussion, ReviewContext, UnreviewedFile } from '../types.ts';

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
