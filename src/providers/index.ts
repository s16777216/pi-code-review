// Re-export the GitLab provider's public surface. Provider selection logic will be added with a second provider.
export { GitLabClient } from './gitlab/client.ts';
export type {
  DiscussionPosition,
  FileContentResult,
  GitLabChangedFile,
  GitLabDiscussion,
  GitLabDiscussionNote,
  GitLabDiffRefs,
  MergeRequestMetadata,
  MergeRequestProvider,
  MergeRequestWriter,
} from './gitlab/client.ts';
export { GitLabSourceProvider } from './gitlab/sourceProvider.ts';
export { GitLabSinkProvider } from './gitlab/sinkProvider.ts';
