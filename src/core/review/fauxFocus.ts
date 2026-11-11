import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import type { FauxProviderHandle, FauxResponseFactory, FauxResponseStep } from '@earendil-works/pi-ai';
import { REVIEW_FOCUSES } from './focus.ts';

// Test support for the faux provider. A review now runs one agent for each
// review focus, so a script that was written for one agent would be read by
// three. These helpers route each call by the focus in the system prompt.

/** The first words of the paragraph of a review focus, as the system prompt
 * of its agent shows them. */
function focusMarker(index: number): string {
  return `Your review focus is ${REVIEW_FOCUSES[index]!.name}.`;
}

/** Which review focus (an index into `REVIEW_FOCUSES`) an agent has, or `-1`
 * for an agent with no review focus (the deduplication step). */
export function focusOfCall(context: unknown): number {
  const text = JSON.stringify(context);
  return REVIEW_FOCUSES.findIndex((_, index) => text.includes(focusMarker(index)));
}

/** True when the call is the deduplication step. */
export function isDedupCall(context: unknown): boolean {
  return JSON.stringify(context).includes('submit_groups');
}

/** A `submit_groups` call that keeps every finding in a group of its own, so
 * a test that does not care about the deduplication step keeps its findings. */
function singletonGroups(context: unknown) {
  const numbers = [...JSON.stringify(context).matchAll(/number\\?": (\d+)/g)].map((match) => Number(match[1]));
  const unique = [...new Set(numbers)];
  return fauxAssistantMessage([fauxToolCall('submit_groups', { groups: unique.map((n) => [n]) } as never)], {
    stopReason: 'toolUse',
  });
}

/** True when the call is a verifier run of the verification step. */
export function isVerifyCall(context: unknown): boolean {
  return JSON.stringify(context).includes('submit_verdicts');
}

/** A `submit_verdicts` call that confirms every finding with the severity it
 * has, so a test that does not care about the verification step keeps its
 * findings as they are. It reads the findings from the last user message. */
export function confirmAll(context: unknown) {
  const messages = (context as { messages?: { role: string; content: unknown }[] }).messages ?? [];
  const user = [...messages].reverse().find((message) => message.role === 'user');
  const content = user?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part: { text?: string }) => part.text ?? '').join(' ')
        : '';
  const items = [...text.matchAll(/"number": (\d+),\s*"line": \d+,\s*"severity": "(\w+)"/g)];
  const verdicts = items.map((match) => ({
    number: Number(match[1]),
    verdict: 'confirmed',
    severity: match[2],
    reason: 'The code shows the problem.',
  }));
  return fauxAssistantMessage([fauxToolCall('submit_verdicts', { verdicts } as never)], { stopReason: 'toolUse' });
}

function emptyReview() {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings: [], resolved: [] } as never)], {
    stopReason: 'toolUse',
  });
}

/** Sets the responses of the first review focus (logic correctness), in the
 * order of the calls, as a script for one agent used to work. The agents of
 * the other focuses report nothing and make one call each. The step list is
 * shared by all agents of the first focus, so a script for several batches
 * still reads in the order of the calls. */
export function logicOnly(faux: FauxProviderHandle, steps: FauxResponseStep[]): void {
  const queue = [...steps];
  const dispatch: FauxResponseFactory = (context, options, state, model) => {
    if (isDedupCall(context)) return singletonGroups(context);
    if (isVerifyCall(context)) return confirmAll(context);
    if (focusOfCall(context) > 0) return emptyReview();
    const step = queue.shift();
    if (step === undefined) throw new Error('The test script has no more responses for the first review focus.');
    return typeof step === 'function' ? step(context, options, state, model) : step;
  };
  faux.setResponses(Array.from({ length: 500 }, () => dispatch));
}

/** Sets one script for each review focus. A script is the list of responses
 * for the calls of that focus, in order. A focus with no script reports
 * nothing. `dedup` answers the deduplication step, if the test reaches it. */
export function perFocus(
  faux: FauxProviderHandle,
  scripts: { [focus: number]: FauxResponseStep[] },
  dedup?: FauxResponseStep[],
  verify?: FauxResponseStep[],
): void {
  const queues = new Map<number, FauxResponseStep[]>(
    REVIEW_FOCUSES.map((_, index) => [index, [...(scripts[index] ?? [])]]),
  );
  const dedupQueue = [...(dedup ?? [])];
  const verifyQueue = verify === undefined ? undefined : [...verify];
  const dispatch: FauxResponseFactory = (context, options, state, model) => {
    if (isVerifyCall(context)) {
      const next = verifyQueue?.shift();
      if (verifyQueue === undefined) return confirmAll(context);
      if (next === undefined) throw new Error('The test script has no response for the verification step.');
      return typeof next === 'function' ? next(context, options, state, model) : next;
    }
    const focus = focusOfCall(context);
    const queue = focus === -1 ? dedupQueue : queues.get(focus)!;
    const step = queue.shift();
    if (step === undefined) {
      if (focus === -1) throw new Error('The test script has no response for the deduplication step.');
      return emptyReview();
    }
    return typeof step === 'function' ? step(context, options, state, model) : step;
  };
  faux.setResponses(Array.from({ length: 500 }, () => dispatch));
}
