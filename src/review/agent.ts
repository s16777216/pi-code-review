import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ReviewContext } from '../types.ts';

const GetFileContentParams = Type.Object({
  path: Type.String({ description: "Path of a file this change's diff touched." }),
});

/** The one tool the agent gets: read a changed file's full content beyond
 * what the diff hunks show. Restricted to `context.changedFiles` so the
 * agent cannot read arbitrary repository paths. */
export function createGetFileContentTool(context: ReviewContext): AgentTool<typeof GetFileContentParams> {
  const changedPaths = new Set(
    context.changedFiles.map((file) => file.newPath).filter((path): path is string => path !== null),
  );

  return {
    name: 'get_file_content',
    label: 'Get file content',
    description:
      "Reads the full content of a file this change's diff touched. Use it when the diff hunks alone are not enough context.",
    parameters: GetFileContentParams,
    async execute(_toolCallId, params) {
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

      return {
        content: [{ type: 'text', text: result }],
        details: null,
      };
    },
  };
}
