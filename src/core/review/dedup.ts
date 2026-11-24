import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { silentLogger, type Logger } from '../../logger.ts';
import type { Finding, Severity } from '../types.ts';
import { MAX_SUBMIT_ATTEMPTS } from './agent.ts';
import { ReviewFailureError } from './findings.ts';

// The deduplication step (`add-multi-agent-review` design, Decisions 4 to 6).
// The model only groups the findings that report the same problem. The code
// checks the groups and picks the finding to keep, so the model cannot change
// a summary, lose a finding, or make one up.

/** The finding numbers start at 1 and follow the merged order of the findings. */
export interface NumberedFinding {
  number: number;
  finding: Finding;
}

/** The findings that the step sends to the model: only the findings of files
 * that have two or more findings, each with its number in the merged order.
 * The list is empty when no file has two findings, and then the step makes no
 * model call. */
export function selectForDedup(findings: readonly Finding[]): NumberedFinding[] {
  const perFile = new Map<string, number>();
  for (const finding of findings) perFile.set(finding.file, (perFile.get(finding.file) ?? 0) + 1);
  return findings.flatMap((finding, index) =>
    (perFile.get(finding.file) ?? 0) >= 2 ? [{ number: index + 1, finding }] : [],
  );
}

/** The user prompt: the four fields of each sent finding, and no other. */
export function buildDedupPrompt(sent: readonly NumberedFinding[]): string {
  const items = sent.map(({ number, finding }) => ({
    number,
    file: finding.file,
    line: finding.line,
    severity: finding.severity,
    summary: finding.summary,
  }));
  return `Group the findings below.\n\n${JSON.stringify(items, null, 2)}`;
}

/** Checks the groups of the model. Each sent number must be in exactly one
 * group, every number must have been sent, and all numbers of a group must be
 * in the same file. Throws `ReviewFailureError` with the first problem. */
export function validateGroups(groups: readonly (readonly number[])[], sent: readonly NumberedFinding[]): number[][] {
  const fileOf = new Map(sent.map(({ number, finding }) => [number, finding.file] as const));
  const seen = new Set<number>();
  groups.forEach((group, index) => {
    if (group.length === 0) {
      throw new ReviewFailureError(`Group ${index} is empty.`);
    }
    for (const number of group) {
      if (!fileOf.has(number)) {
        throw new ReviewFailureError(`Group ${index} has the number ${number}, which is not a finding that was sent.`);
      }
      if (seen.has(number)) {
        throw new ReviewFailureError(`The number ${number} is in more than one group.`);
      }
      seen.add(number);
    }
    const files = new Set(group.map((number) => fileOf.get(number)));
    if (files.size > 1) {
      throw new ReviewFailureError(`Group ${index} has findings of more than one file.`);
    }
  });
  const missing = sent.map(({ number }) => number).filter((number) => !seen.has(number));
  if (missing.length > 0) {
    throw new ReviewFailureError(`These numbers are in no group: ${missing.join(', ')}.`);
  }
  return groups.map((group) => [...group]);
}

/** From high to low. A finding that the diff introduces wins over a bug that
 * existed before it, whatever the impact of the older bug is. */
const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'pre_existing'];

/** Keeps one finding of each group and drops the others. The kept finding has
 * the highest severity, and the earliest one when the severities are equal.
 * Its text does not change. When it has no `relatesTo`, it takes the first
 * one that another finding of its group has. The kept findings keep their
 * order. `groups` holds the numbers of `validateGroups`. */
export function keepOnePerGroup(findings: readonly Finding[], groups: readonly (readonly number[])[]): Finding[] {
  return settle(findings, groups, false);
}

/** `keepOnePerGroup`, and then the end of the step (`record-review-confidence`, Decisions 1 and 2). Each
 * kept finding gets its corroboration: the number of distinct review focuses in its group, or `1` when
 * no group holds it. The `focus` of every finding is removed, so it never reaches a prompt or the file.
 * `groups` can be empty: the step made no model call, or it failed. */
export function settleGroups(findings: readonly Finding[], groups: readonly (readonly number[])[]): Finding[] {
  return settle(findings, groups, true);
}

function settle(findings: readonly Finding[], groups: readonly (readonly number[])[], annotate: boolean): Finding[] {
  const corroboration = new Map<number, number>();
  const replaced = new Map<number, Finding>();
  const dropped = new Set<number>();
  for (const group of groups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a - b);
    const kept = ordered.reduce((best, number) =>
      SEVERITY_ORDER.indexOf(findings[number - 1]!.severity) < SEVERITY_ORDER.indexOf(findings[best - 1]!.severity)
        ? number
        : best,
    );
    for (const number of ordered) if (number !== kept) dropped.add(number);
    corroboration.set(kept, new Set(ordered.map((number) => findings[number - 1]!.focus)).size);

    const keptFinding = findings[kept - 1]!;
    if (keptFinding.relatesTo === undefined) {
      const donor = ordered.find((number) => findings[number - 1]!.relatesTo !== undefined);
      if (donor !== undefined) replaced.set(kept, { ...keptFinding, relatesTo: findings[donor - 1]!.relatesTo! });
    }
  }
  return findings.flatMap((finding, index) => {
    if (dropped.has(index + 1)) return [];
    const result = replaced.get(index + 1) ?? finding;
    if (!annotate) return [result];
    const { focus: _focus, ...rest } = result;
    return [{ ...rest, corroboration: Math.max(1, corroboration.get(index + 1) ?? 1) }];
  });
}

const SubmitGroupsParams = Type.Object({
  groups: Type.Array(Type.Array(Type.Integer())),
});

/** The tool of the step: the model's only way to give its groups. A result
 * that is not valid is rejected with the reason, and the model can send a
 * corrected one, up to `MAX_SUBMIT_ATTEMPTS` calls in one run, as for
 * `submit_review`. */
export function createSubmitGroupsTool(
  sent: readonly NumberedFinding[],
  onSubmit: (groups: number[][]) => void,
  logger: Logger = silentLogger(),
): AgentTool<typeof SubmitGroupsParams> {
  let calls = 0;
  return {
    name: 'submit_groups',
    label: 'Submit groups',
    description:
      'Submits the groups of findings that report the same problem. Call this once, with every finding number in exactly one group.',
    parameters: SubmitGroupsParams,
    async execute(_toolCallId, params) {
      calls += 1;
      const atLimit = calls >= MAX_SUBMIT_ATTEMPTS;
      try {
        onSubmit(validateGroups(params.groups, sent));
      } catch (error) {
        if (!(error instanceof ReviewFailureError)) throw error;
        logger.warn({ error: error.message }, 'rejected a submit_groups call with groups that are not valid');
        const text = atLimit
          ? `submit_groups can be called at most ${MAX_SUBMIT_ATTEMPTS} times; this call is not valid and was the last one allowed: ${error.message}`
          : `This submit_groups call is not valid and none of it was kept. Fix the problem and call submit_groups again with every finding number in exactly one group: ${error.message}`;
        return { content: [{ type: 'text', text }], details: null, isError: true, terminate: atLimit };
      }
      return { content: [{ type: 'text', text: 'Groups submitted.' }], details: null, terminate: true };
    },
  };
}
