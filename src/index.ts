import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { Api, Model, Provider } from '@earendil-works/pi-ai';
import { type Config, type ConfigOverrides, isMergeRequestPipeline, loadConfig } from './config.ts';
import { GitLabClient, type MergeRequestProvider, type MergeRequestWriter } from './gitlab/client.ts';
import { GitLabSinkProvider } from './gitlab/sinkProvider.ts';
import { GitLabSourceProvider } from './gitlab/sourceProvider.ts';
import { decidePassFail } from './report/exitCode.ts';
import { AgentReviewEngine } from './review/engine.ts';

const LOG_PREFIX = '[pi-code-review]';
const CODE_QUALITY_REPORT_PATH = 'gl-code-quality-report.json';

function buildModel(config: Config): Model<Api> {
  return {
    id: config.openai.model,
    name: config.openai.model,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: config.openai.baseUrl,
    input: ['text'],
    reasoning: false,
    contextWindow: 128_000,
    maxTokens: 16_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

/** Parses CLI flags for every config value, for a local manual run. Each
 * flag wins over its matching environment variable: `loadConfig()`/
 * `isMergeRequestPipeline()` use it whenever it is given, and fall back to
 * the environment variable only when the flag is absent.
 *
 * `--openai-api-key` and `--job-token` carry secrets. Prefer the
 * environment variable (`OPENAI_API_KEY`, `CI_JOB_TOKEN`) whenever
 * practical — these flags exist for pulling a secret from a local secret
 * manager into a one-off command, and passing a secret this way puts it in
 * shell history and in `ps`/`/proc/<pid>/cmdline` output for the lifetime
 * of the process. */
export function parseCliOverrides(argv: string[]): ConfigOverrides {
  const { values } = parseArgs({
    args: argv,
    options: {
      'gitlab-url': { type: 'string' },
      'project-id': { type: 'string' },
      mr: { type: 'string' },
      model: { type: 'string' },
      'openai-base-url': { type: 'string' },
      'fail-on': { type: 'string' },
      'auth-header': { type: 'string' },
      'openai-api-key': { type: 'string' },
      'job-token': { type: 'string' },
    },
    strict: true,
  });
  return {
    apiUrl: values['gitlab-url'],
    projectId: values['project-id'],
    mergeRequestIid: values.mr,
    model: values.model,
    openaiBaseUrl: values['openai-base-url'],
    apiKey: values['openai-api-key'],
    jobToken: values['job-token'],
    failOnSeverity: values['fail-on'],
    authHeader: values['auth-header'],
  };
}

export interface RunReviewOptions {
  config: Config;
  /** GitLab API access. Production passes a real `GitLabClient`; tests pass a fake. */
  client: MergeRequestProvider & MergeRequestWriter;
  /** The model provider to stream from. Production passes `openaiProvider()`;
   * tests pass `fauxProvider().provider` so no network call happens. */
  provider: Provider;
  /** Where to write the Code Quality report. Defaults to `gl-code-quality-report.json`
   * in the working directory; tests override it to avoid writing a real file. */
  codeQualityReportPath?: string;
}

/** Runs one full review: GitLab source adapter -> `ReviewEngine` -> GitLab
 * sink adapter -> pass/fail. Takes its GitLab and model-provider
 * dependencies as parameters so it can be tested without a real GitLab API
 * or a real OpenAI account. */
export async function runReview(options: RunReviewOptions): Promise<boolean> {
  const { config, client, provider } = options;

  console.log(`${LOG_PREFIX} Fetching merge request context from GitLab...`);
  const sourceProvider = new GitLabSourceProvider(client, config.gitlab.mergeRequestIid);
  const context = await sourceProvider.buildReviewContext();
  console.log(`${LOG_PREFIX} Reviewing "${context.title}" (${context.changedFiles.length} changed file(s)).`);

  console.log(`${LOG_PREFIX} Running review with model "${config.openai.model}"...`);
  const engine = new AgentReviewEngine({ provider, model: buildModel(config), apiKey: config.openai.apiKey });
  const findings = await engine.review(context);
  console.log(`${LOG_PREFIX} Review produced ${findings.length} finding(s).`);

  console.log(`${LOG_PREFIX} Publishing findings to GitLab...`);
  const sinkProvider = new GitLabSinkProvider({
    client,
    mergeRequestIid: config.gitlab.mergeRequestIid,
    diffRefs: sourceProvider.getDiffRefs(),
    codeQualityReportPath: options.codeQualityReportPath ?? CODE_QUALITY_REPORT_PATH,
  });
  await sinkProvider.publish(findings);

  const passed = decidePassFail(findings, config.failOnSeverity);
  console.log(`${LOG_PREFIX} Result: ${passed ? 'pass' : 'fail'} (threshold: ${config.failOnSeverity}).`);
  return passed;
}

/** Real wiring: builds the real GitLab client and the real OpenAI provider,
 * then delegates to `runReview()`. Not unit-tested directly — `runReview()`
 * is where the orchestration logic is tested. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const overrides = parseCliOverrides(argv);

  if (!isMergeRequestPipeline(overrides)) {
    console.log(`${LOG_PREFIX} Not a merge request pipeline; skipping review.`);
    return 0;
  }

  const config = loadConfig(overrides);
  const client = await GitLabClient.create({
    apiUrl: config.gitlab.apiUrl,
    projectId: config.gitlab.projectId,
    jobToken: config.gitlab.jobToken,
    authHeader: config.gitlab.authHeader,
  });

  const passed = await runReview({ config, client, provider: openaiProvider() });
  return passed ? 0 : 1;
}

/** Only run `main()` when this module is the process entrypoint (`node dist/index.js`),
 * not when a test imports `runReview`/`main` from it. Compares resolved file URLs
 * (not raw path strings) so this works correctly on Windows too. */
const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(`${LOG_PREFIX} ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
