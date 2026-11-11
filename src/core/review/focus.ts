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

/** What every paragraph says after the text of its own focus. */
const NOT_A_LIMIT =
  'This focus is your main area, not a limit: when you see another genuine bug, report it too. The rule to report only genuine bugs still applies, so this focus does not make style or naming findings valid.';

/** The review focuses, in the order of the runs and of the merge. */
export const REVIEW_FOCUSES: readonly ReviewFocus[] = [
  {
    name: 'logic correctness',
    paragraph: `Your review focus is logic correctness. Look first for wrong conditions, off-by-one errors, null or undefined values that are not handled, wrong handling of errors and of return values, wrong changes of state, and code that does not do what the title and the description of the change say. ${NOT_A_LIMIT}`,
  },
  {
    name: 'security',
    paragraph: `Your review focus is security. Look first for injection, a missing check of authentication or authorization, unsafe handling of input and of file paths, secrets in code or in logs, unsafe deserialization, and unsafe use of cryptography. ${NOT_A_LIMIT}`,
  },
  {
    name: 'resources and concurrency',
    paragraph: `Your review focus is resources and concurrency. Look first for race conditions, shared state without protection, deadlocks, leaks of files, connections, or memory, missing cleanup, transactions and data that can become inconsistent, retries and timeouts, and growth without a bound. ${NOT_A_LIMIT}`,
  },
];
