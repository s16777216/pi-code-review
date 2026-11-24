import type { Confidence, StoredVerdict } from '../types.ts';

/** The confidence of a finding, from its corroboration (the number of distinct review focuses that
 * reported it) and the verdict of the verifier (`record-review-confidence` spec, "Derive confidence").
 * A finding with the verdict `unverified` (the verification of its file failed or was skipped), or with no
 * verdict (a findings file of an older version), counts as `uncertain`.
 * The confidence never changes a severity. */
export function deriveConfidence(corroboration: number, verdict: StoredVerdict | undefined): Confidence {
  const corroborated = corroboration >= 2;
  if ((verdict ?? 'uncertain') === 'confirmed') return corroborated ? 'high' : 'medium';
  return corroborated ? 'medium' : 'low';
}
