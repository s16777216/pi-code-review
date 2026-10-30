import { Agent } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, Model, Provider, TextContent } from '@earendil-works/pi-ai';
import { buildLogger, type Logger } from '../logger.ts';
import type { Finding, ReviewContext } from '../types.ts';
import { createGetFileContentTool } from './agent.ts';
import { isValidNewFileLine } from './diff.ts';
import { parseFindings, ReviewFailureError } from './findings.ts';
import { buildReviewPrompt } from './prompt.ts';

const SYSTEM_PROMPT = `You are an automated code reviewer for a single code change.

Read the change's diff hunks. Call the get_file_content tool for any changed file when the diff hunks alone are not enough context. Do not guess about code you have not read.

Report only genuine bugs or correctness problems. Do not report style, formatting, or naming nits as a separate category from real nits; use "nit" severity for anything minor enough that a human would not block on it.

For each problem, decide a severity:
- "important": the change's own diff introduces this bug.
- "nit": a minor issue worth a comment but not worth blocking on.
- "pre_existing": a bug in code the change did not modify.

When you are done, output ONLY a JSON array of findings, with no other text. Each finding is an object with exactly these fields: "file" (the changed file's path), "line" (an integer line number in the new version of that file), "severity" (one of "important", "nit", "pre_existing"), and "summary" (one sentence). Output "[]" when you find nothing to report.`;

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
    const logger = this.options.logger ?? buildLogger(false);
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

    const text = lastAssistant.content
      .filter((block): block is TextContent => block.type === 'text')
      .map((block) => block.text)
      .join('');

    logger.debug({ response: text }, 'review response');
    const findings = parseFindings(text);
    return findings.filter((finding) => isValidNewFileLine(context.changedFiles, finding.file, finding.line));
  }
}
