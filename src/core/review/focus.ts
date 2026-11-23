import { systemPrompts } from './prompt.ts';

/** A review focus: the main area of one agent
 * (`add-multi-agent-review` design, Decisions 1 and 2). The review runs one
 * agent for each review focus on every run scope. The three focuses are fixed:
 * a person cannot change their number or their text. */
export interface ReviewFocus {
  /** Short name for the log lines and the failure message. */
  readonly name: string;
  /** The paragraph for the system prompt. */
  readonly paragraph: string;
}

/** The paragraph of a focus: its own text, one space, and the sentence that all
 * focuses share. The text is in the built-in system prompts, and it is read when
 * the paragraph is used (`move-system-prompts-to-templates`, Decision 3). */
function paragraphOf(own: 'focusLogic' | 'focusSecurity' | 'focusResources'): string {
  const prompts = systemPrompts();
  return `${prompts[own]} ${prompts.focusCommon}`;
}

/** The review focuses, in the order of the runs and of the merge. */
export const REVIEW_FOCUSES: readonly ReviewFocus[] = [
  {
    name: 'logic correctness',
    get paragraph() {
      return paragraphOf('focusLogic');
    },
  },
  {
    name: 'security',
    get paragraph() {
      return paragraphOf('focusSecurity');
    },
  },
  {
    name: 'resources and concurrency',
    get paragraph() {
      return paragraphOf('focusResources');
    },
  },
];
