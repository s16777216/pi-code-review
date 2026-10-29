import type { FailOnSeverity } from '../config.ts';
import type { Finding, Severity } from '../types.ts';

/** Higher rank meets a stricter threshold. `pre_existing` never meets
 * `important` or `nit`, matching the article's view that a bug the change
 * did not introduce should not block that change on its own. */
const SEVERITY_RANK: Record<Severity, number> = {
  pre_existing: 0,
  nit: 1,
  important: 2,
};

/** True when the review passes: no finding's severity meets or exceeds
 * `threshold`. `threshold: 'none'` always passes. This decision only needs
 * `Finding[]` and the threshold — nothing GitLab-specific. */
export function decidePassFail(findings: Finding[], threshold: FailOnSeverity): boolean {
  if (threshold === 'none') return true;
  const thresholdRank = SEVERITY_RANK[threshold];
  return !findings.some((finding) => SEVERITY_RANK[finding.severity] >= thresholdRank);
}
