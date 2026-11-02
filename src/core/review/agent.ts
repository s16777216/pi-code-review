import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ReviewContext } from '../types.ts';

/** At most this many characters of one file go back to the agent, about
 * 25,000 tokens. A longer file is cut, and the result says so. */
export const MAX_FILE_CONTENT_CHARS = 100_000;
/** The agent loop has no turn limit of its own, so the tool sets one. */
export const MAX_FILE_CONTENT_CALLS = 30;

const GetFileContentParams = Type.Object({
  path: Type.String({ description: "Path of a file this change's diff touched." }),
});

/** The one tool the agent gets: read a changed file's full content beyond
 * what the diff hunks show. Restricted to `context.changedFiles` so the
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
      "Reads the full content of a file this change's diff touched. Use it when the diff hunks alone are not enough context.",
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

      const text =
        result.length > MAX_FILE_CONTENT_CHARS
          ? `${result.slice(0, MAX_FILE_CONTENT_CHARS)}\n[cut: showing ${MAX_FILE_CONTENT_CHARS} of ${result.length} characters]`
          : result;
      return {
        content: [{ type: 'text', text }],
        details: null,
      };
    },
  };
}
