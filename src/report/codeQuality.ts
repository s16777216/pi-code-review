import { createHash } from 'node:crypto';
import type { Finding, Severity } from '../types.ts';

export type CodeQualitySeverity = 'info' | 'minor' | 'major' | 'critical' | 'blocker';

export interface CodeQualityIssue {
  description: string;
  check_name: string;
  fingerprint: string;
  severity: CodeQualitySeverity;
  location: {
    path: string;
    lines: { begin: number };
  };
}

/** GitLab's Code Quality severity scale is wider than ours; only these three
 * are used, matching the design decision in `design.md`. */
const SEVERITY_MAP: Record<Severity, CodeQualitySeverity> = {
  important: 'major',
  nit: 'minor',
  pre_existing: 'info',
};

function fingerprint(finding: Finding): string {
  return createHash('sha256').update(`${finding.file}:${finding.line}:${finding.summary}`).digest('hex');
}

/** Builds a GitLab Code Quality report (the format the `codequality` CI
 * artifact expects) from the engine's findings. */
export function buildCodeQualityReport(findings: Finding[]): CodeQualityIssue[] {
  return findings.map((finding) => ({
    description: finding.summary,
    check_name: `pi-code-review/${finding.severity}`,
    fingerprint: fingerprint(finding),
    severity: SEVERITY_MAP[finding.severity],
    location: {
      path: finding.file,
      lines: { begin: finding.line },
    },
  }));
}
