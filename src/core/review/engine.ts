import { Agent } from '@earendil-works/pi-agent-core';
import { estimateTextTokens } from '@earendil-works/pi-ai/utils/estimate';
import type { Api, AssistantMessage, Model, Provider, TextContent } from '@earendil-works/pi-ai';
import { silentLogger, type Logger } from '../../logger.ts';
import type { Finding, ReviewContext } from '../types.ts';
import { createGetFileContentTool } from './agent.ts';
import { checkNewFileLine } from './diff.ts';
import { parseFindings, ReviewFailureError } from './findings.ts';
import { buildReviewPrompt } from './prompt.ts';

export const SYSTEM_PROMPT = `You are an automated code reviewer for a single code change.

Read the change's diff hunks. In each diff, the number before "|" is the line's number in the new version of the file; it is not part of the code. Lines with no number were removed. Call the get_file_content tool for any changed file when the diff hunks alone are not enough context. Do not guess about code you have not read.

Report only genuine bugs or correctness problems. Do not report style, formatting, or naming nits as a separate category from real nits; use "nit" severity for anything minor enough that a human would not block on it.

For each problem, decide a severity:
- "important": the change's own diff introduces this bug.
- "nit": a minor issue worth a comment but not worth blocking on.
- "pre_existing": a bug in code the change did not modify.

When you are done, output ONLY a JSON array of findings, with no other text. Each finding is an object with exactly these fields: "file" (the changed file's path), "line" (the number shown before "|" on that line of the diff), "severity" (one of "important", "nit", "pre_existing"), and "summary" (one sentence). Output "[]" when you find nothing to report.`;

/** `pi-ai` keeps this many tokens free when it caps the answer size
 * (`CONTEXT_SAFETY_TOKENS` in its `simple-options.js`). */
const CONTEXT_SAFETY_TOKENS = 4096;
/** The review fails up front when the first request would leave fewer
 * answer tokens than this. */
export const MIN_ANSWER_TOKENS = 4096;

export interface ReviewEngine {
  review(context: ReviewContext): Promise<Finding[]>;
}

export interface AgentReviewEngineOptions {
  /** The pi-ai provider to stream from. Production code passes `openaiProvider()`;
   * tests pass `fauxProvider().provider` so no network call happens. */
  provider: Provider;
  model: Model<Api>;
  apiKey: string;
  /** Logs the built prompt and the agent's raw response under `--debug`.
   * Defaults to a silent logger, so existing call sites and tests are
   * unaffected. */
  logger?: Logger;
}

/** The `ReviewEngine` implementation. Nothing in this file names GitLab —
 * it only knows `ReviewContext` in and `Finding[]` out. */
export class AgentReviewEngine implements ReviewEngine {
  constructor(private readonly options: AgentReviewEngineOptions) {}

  async review(context: ReviewContext): Promise<Finding[]> {
    const { provider, model, apiKey } = this.options;
    const logger = this.options.logger ?? silentLogger();
    const tool = createGetFileContentTool(context);

    const agent = new Agent({
      streamFn: (streamModel, streamContext, streamOptions) =>
        provider.streamSimple(streamModel, streamContext, { ...streamOptions, apiKey }),
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        tools: [tool],
      },
    });

    const prompt = buildReviewPrompt(context);
    logger.debug({ prompt }, 'review prompt');
    assertInputFits(model, prompt);
    await agent.prompt(prompt);

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((message): message is AssistantMessage => message.role === 'assistant');
    if (!lastAssistant) {
      throw new ReviewFailureError('The agent run ended without producing an assistant message.');
    }
    if (lastAssistant.stopReason === 'error' || lastAssistant.stopReason === 'aborted') {
      throw new ReviewFailureError(
        `The agent run failed (stopReason: ${lastAssistant.stopReason}): ${lastAssistant.errorMessage ?? 'no error message'}`,
      );
    }
    if (lastAssistant.stopReason === 'length') {
      throw new ReviewFailureError(
        'The model stopped at its output token limit, so its answer is cut and cannot be parsed. Raise --max-tokens (OPENAI_MAX_TOKENS), or set --context-window (OPENAI_CONTEXT_WINDOW) to the model\'s real context window.',
      );
    }
    logger.debug(
      {
        stopReason: lastAssistant.stopReason,
        usage: lastAssistant.usage,
        contentBlockTypes: lastAssistant.content.map((block) => block.type),
      },
      'review final assistant message',
    );

    const text = lastAssistant.content
      .filter((block): block is TextContent => block.type === 'text')
      .map((block) => block.text)
      .join('');

    logger.debug({ response: text }, 'review response');
    const findings = parseFindings(text, logger);
    return findings.filter((finding) => {
      const reason = checkNewFileLine(context.changedFiles, finding.file, finding.line);
      if (reason === 'ok') return true;
      logger.warn(
        { file: finding.file, line: finding.line, reason },
        'discarded a finding that cannot be placed on the diff',
      );
      return false;
    });
  }
}

/** Fails the review before the first model call when the input leaves less
 * than `MIN_ANSWER_TOKENS` for the answer. Uses `pi-ai`'s own estimate, so it
 * agrees with the cap `pi-ai` puts on the answer; it also counts the system
 * prompt, which `pi-ai`'s cap does not, so it is slightly stricter. A model
 * with no known window (`contextWindow <= 0`) is not checked, as in `pi-ai`. */
function assertInputFits(model: Model<Api>, prompt: string): void {
  if (model.contextWindow <= 0) return;
  const estimatedInput = estimateTextTokens(SYSTEM_PROMPT) + estimateTextTokens(prompt);
  const answerRoom = model.contextWindow - estimatedInput - CONTEXT_SAFETY_TOKENS;
  if (answerRoom < MIN_ANSWER_TOKENS) {
    throw new ReviewFailureError(
      `The review input is too large for the model: about ${estimatedInput} tokens in a ${model.contextWindow}-token context window, leaving ${Math.max(0, answerRoom)} tokens for the answer (at least ${MIN_ANSWER_TOKENS} needed). Set --context-window (OPENAI_CONTEXT_WINDOW) if the model's real window is larger.`,
    );
  }
}
