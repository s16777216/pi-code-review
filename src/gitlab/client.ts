import { ConfigError } from "../config.ts";

export interface GitLabDiffRefs {
  baseSha: string;
  startSha: string;
  headSha: string;
}

export interface MergeRequestMetadata {
  title: string;
  description: string;
  diffRefs: GitLabDiffRefs;
}

export interface GitLabChangedFile {
  oldPath: string | null;
  newPath: string | null;
  diffHunks: string;
}

export type FileContentResult = { content: string } | { error: string };

export class GitLabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface GitLabClientOptions {
  apiUrl: string;
  projectId: string;
  /** A GitLab personal or project access token, sent under the `PRIVATE-TOKEN`
   * header. This tool never uses `CI_JOB_TOKEN`/`JOB-TOKEN` — see `design.md`'s
   * "Auth: always a personal/project access token" decision. */
  token: string;
}

/** The subset of the GitLab API this tool needs. Adapters depend on this
 * interface, not on `GitLabClient`, so a test can pass a fake instead of
 * mocking `fetch`. */
export interface MergeRequestProvider {
  getMergeRequest(mergeRequestIid: string): Promise<MergeRequestMetadata>;
  getMergeRequestDiff(mergeRequestIid: string): Promise<GitLabChangedFile[]>;
  getFileContent(path: string, ref: string): Promise<FileContentResult>;
}

export interface DiscussionPosition {
  baseSha: string;
  startSha: string;
  headSha: string;
  oldPath: string | null;
  newPath: string | null;
  /** Only new-file lines are supported (see the diff line-mapping design decision). */
  newLine: number;
}

/** The write side of the GitLab API, kept separate from `MergeRequestProvider`
 * (read-only) since only the sink adapter needs it. */
export interface MergeRequestWriter {
  createDiscussion(mergeRequestIid: string, body: string, position: DiscussionPosition): Promise<void>;
}

export class GitLabClient implements MergeRequestProvider, MergeRequestWriter {
  private readonly apiUrl: string;
  private readonly projectId: string;
  private readonly token: string;

  /** Private: construction goes through `GitLabClient.create()`, so the
   * returned instance is always fully set up, even once setup needs to
   * `await` something (for example, resolving a project path to its numeric
   * ID). Today's setup happens to be synchronous, but callers should not
   * depend on that. */
  private constructor(options: GitLabClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.projectId = options.projectId;
    this.token = options.token;
  }

  static async create(options: GitLabClientOptions): Promise<GitLabClient> {
    if (!options.token) {
      throw new ConfigError(
        "GitLabClient requires a non-empty token; refusing to call the GitLab API without one.",
      );
    }
    return new GitLabClient(options);
  }

  private async request(
    path: string,
    searchParams?: URLSearchParams,
    init?: { method?: string; body?: string },
  ): Promise<Response> {
    const url = new URL(`${this.apiUrl}/projects/${this.projectId}${path}`);
    if (searchParams) {
      for (const [key, value] of searchParams) url.searchParams.set(key, value);
    }
    return fetch(url, {
      method: init?.method,
      body: init?.body,
      headers: {
        "PRIVATE-TOKEN": this.token,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  }

  async getMergeRequest(
    mergeRequestIid: string,
  ): Promise<MergeRequestMetadata> {
    const response = await this.request(`/merge_requests/${mergeRequestIid}`);
    if (!response.ok) {
      throw new GitLabApiError(
        `Failed to fetch merge request ${mergeRequestIid}: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
    const body = (await response.json()) as {
      title: string;
      description: string | null;
      diff_refs: { base_sha: string; start_sha: string; head_sha: string };
    };
    return {
      title: body.title,
      description: body.description ?? "",
      diffRefs: {
        baseSha: body.diff_refs.base_sha,
        startSha: body.diff_refs.start_sha,
        headSha: body.diff_refs.head_sha,
      },
    };
  }

  async getMergeRequestDiff(
    mergeRequestIid: string,
  ): Promise<GitLabChangedFile[]> {
    const files: GitLabChangedFile[] = [];
    let page = 1;
    for (;;) {
      const response = await this.request(
        `/merge_requests/${mergeRequestIid}/diffs`,
        new URLSearchParams({ page: String(page), per_page: "100" }),
      );
      if (!response.ok) {
        throw new GitLabApiError(
          `Failed to fetch diff for merge request ${mergeRequestIid}: ${response.status} ${response.statusText}`,
          response.status,
        );
      }
      const batch = (await response.json()) as Array<{
        old_path: string | null;
        new_path: string | null;
        diff: string;
      }>;
      for (const entry of batch) {
        files.push({
          oldPath: entry.old_path,
          newPath: entry.new_path,
          diffHunks: entry.diff,
        });
      }
      const nextPage = response.headers.get("x-next-page");
      if (!nextPage) break;
      page = Number(nextPage);
    }
    return files;
  }

  async getFileContent(path: string, ref: string): Promise<FileContentResult> {
    const response = await this.request(
      `/repository/files/${encodeURIComponent(path)}/raw`,
      new URLSearchParams({ ref }),
    );
    if (!response.ok) {
      return {
        error: `Failed to fetch file "${path}" at ${ref}: ${response.status} ${response.statusText}`,
      };
    }
    return { content: await response.text() };
  }

  async createDiscussion(mergeRequestIid: string, body: string, position: DiscussionPosition): Promise<void> {
    const response = await this.request(`/merge_requests/${mergeRequestIid}/discussions`, undefined, {
      method: "POST",
      body: JSON.stringify({
        body,
        position: {
          position_type: "text",
          base_sha: position.baseSha,
          start_sha: position.startSha,
          head_sha: position.headSha,
          old_path: position.oldPath,
          new_path: position.newPath,
          new_line: position.newLine,
        },
      }),
    });
    if (!response.ok) {
      throw new GitLabApiError(
        `Failed to create discussion on merge request ${mergeRequestIid}: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
  }
}
