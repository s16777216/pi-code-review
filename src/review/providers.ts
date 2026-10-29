import type { Finding, ReviewContext } from '../types.ts';

/** Produces the engine's input. The engine does not know, and must not need
 * to know, which concrete `SourceProvider` it got a `ReviewContext` from. */
export interface SourceProvider {
  buildReviewContext(): Promise<ReviewContext>;
}

/** Publishes the engine's findings. One host (GitLab, GitHub, Gitea, ...)
 * implements this however fits its own API; the engine does not depend on
 * any of them. */
export interface SinkProvider {
  publish(findings: Finding[]): Promise<void>;
}
