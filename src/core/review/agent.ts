import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { silentLogger, type Logger } from '../../logger.ts';
import type { ReviewContext } from '../types.ts';
import { ReviewFailureError, validateFinding, type ParsedReviewOutput } from './findings.ts';

/** At most this many characters of one file go back to the agent, about
 * 25,000 tokens. A longer file is cut, and the result says so. */
export const MAX_FILE_CONTENT_CHARS = 100_000;
/** The agent loop has no turn limit of its own, so the tool sets one. */
export const MAX_FILE_CONTENT_CALLS = 30;
/** The narrowest gutter of a numbered file, the same as the numbered diff. */
const MIN_LINE_NUMBER_WIDTH = 4;

/** Puts the new-file line number and `|` in front of each line, in the form of
 * the numbered diff, so the agent can name lines outside the hunks
 * (`report-finding-line-ranges` design, Decision 4). A final line break does
 * not make an empty last line. */
export function numberFileContent(content: string): string {
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  const width = Math.max(MIN_LINE_NUMBER_WIDTH, String(lines.length).length);
  return lines.map((text, index) => `${String(index + 1).padStart(width)} | ${text.replace(/\r$/, '')}`).join('\n');
}

const GetFileContentParams = Type.Object({
  path: Type.String({ description: "Path of a file this change's diff touched." }),
});

/** The file-content tool: read a changed file's full content beyond
 * what the diff hunks show, with line numbers. Restricted to `context.changedFiles` so the
 * agent cannot read arbitrary repository paths. Each result is cut at
 * `MAX_FILE_CONTENT_CHARS`, and the tool answers at most
 * `MAX_FILE_CONTENT_CALLS` calls per review (a fresh tool per review). */
export function createGetFileContentTool(context: ReviewContext): AgentTool<typeof GetFileContentParams> {
  const changedPaths = new Set(
    context.changedFiles.map((file) => file.newPath).filter((path): path is string => path !== null),
  );

  let calls = 0;

  return {
    name: 'get_file_content',
    label: 'Get file content',
    description:
      "Reads the full content of a file this change's diff touched, with the new-file line number in front of each line. Use it when the diff hunks alone are not enough context.",
    parameters: GetFileContentParams,
    async execute(_toolCallId, params) {
      calls += 1;
      if (calls > MAX_FILE_CONTENT_CALLS) {
        return {
          content: [
            {
              type: 'text',
              text: `get_file_content can be called at most ${MAX_FILE_CONTENT_CALLS} times in one review. Finish the review with the information you already have.`,
            },
          ],
          details: null,
          isError: true,
        };
      }

      if (!changedPaths.has(params.path)) {
        return {
          content: [{ type: 'text', text: `"${params.path}" is not a file this change touched.` }],
          details: null,
          isError: true,
        };
      }

      const result = await context.getFileContent(params.path);
      if (typeof result !== 'string') {
        return {
          content: [{ type: 'text', text: result.error }],
          details: null,
          isError: true,
        };
      }

      const numbered = numberFileContent(result);
      const text =
        numbered.length > MAX_FILE_CONTENT_CHARS
          ? `${numbered.slice(0, MAX_FILE_CONTENT_CHARS)}\n[cut: showing ${MAX_FILE_CONTENT_CHARS} of ${numbered.length} characters]`
          : numbered;
      return {
        content: [{ type: 'text', text }],
        details: null,
      };
    },
  };
}

/** The agent loop has no turn limit of its own, so the tool caps how many
 * `submit_review` calls one run accepts. */
export const MAX_SUBMIT_ATTEMPTS = 5;

const SubmitReviewParams = Type.Object({
  findings: Type.Array(
    Type.Object({
      file: Type.String(),
      line: Type.Integer({ description: 'The first line of the problem.' }),
      endLine: Type.Optional(
        Type.Integer({ description: 'The last line of the problem. Leave it out when the problem is on one line.' }),
      ),
      severity: Type.Union([
        Type.Literal('critical'),
        Type.Literal('high'),
        Type.Literal('medium'),
        Type.Literal('low'),
        Type.Literal('pre_existing'),
      ]),
      summary: Type.String(),
    }),
  ),
});

/** The submit-review tool: the agent's only way to report its findings. Each call stands on its own and replaces any
 * earlier call in the same run. A call with one invalid item is rejected
 * whole; the agent may call the tool again, up to `MAX_SUBMIT_ATTEMPTS` times
 * per run (`submit-review-via-tool` design, Decisions 2 and 3). */
export function createSubmitReviewTool(
  onSubmit: (output: ParsedReviewOutput) => void,
  logger: Logger = silentLogger(),
): AgentTool<typeof SubmitReviewParams> {
  let calls = 0;

  return {
    name: 'submit_review',
    label: 'Submit review',
    description:
      "Submits the review's findings. Call this once, when you are done reviewing, with your complete set of findings.",
    parameters: SubmitReviewParams,
    async execute(_toolCallId, params) {
      calls += 1;
      const atLimit = calls >= MAX_SUBMIT_ATTEMPTS;

      const errors: string[] = [];
      const findings = params.findings.flatMap((item, index) => {
        try {
          // A review agent does not link a finding to a discussion. The verify agent does.
          // A `relatesTo` that a model still sends is ignored (`remove-discussions-from-review-agent` design, Decision 2).
          const { relatesTo: _ignored, ...withoutLink } = item as typeof item & { relatesTo?: unknown };
          return [validateFinding(withoutLink, index)];
        } catch (error) {
          if (!(error instanceof ReviewFailureError)) throw error;
          errors.push(error.message);
          return [];
        }
      });

      if (errors.length > 0) {
        logger.warn({ errors }, 'rejected a submit_review call with an invalid finding');
        const text = atLimit
          ? `submit_review can be called at most ${MAX_SUBMIT_ATTEMPTS} times in one review; this call is invalid and was the last one allowed:\n${errors.join('\n')}`
          : `This submit_review call is invalid and none of it was kept. Fix every issue below and call submit_review again with your complete, corrected findings:\n${errors.join('\n')}`;
        return { content: [{ type: 'text', text }], details: null, isError: true, terminate: atLimit };
      }

      onSubmit({ findings });
      return { content: [{ type: 'text', text: 'Review submitted.' }], details: null, terminate: true };
    },
  };
}
