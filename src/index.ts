import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { Api, Model, Provider } from '@earendil-works/pi-ai';
import {
  type PublishConfig,
  type PublishConfigOverrides,
  type ReviewConfig,
  type ReviewConfigOverrides,
  isMergeRequestPipeline,
  loadPublishConfig,
  loadReviewConfig,
} from './config.ts';
import { type FindingsFile, readFindingsFile, writeFindingsFile } from './findingsFile.ts';
import { GitLabClient, type MergeRequestProvider, type MergeRequestWriter } from './gitlab/client.ts';
import { GitLabSinkProvider } from './gitlab/sinkProvider.ts';
import { GitLabSourceProvider } from './gitlab/sourceProvider.ts';
import { buildLogger, type Logger } from './logger.ts';
import { decidePassFail } from './report/exitCode.ts';
import { AgentReviewEngine } from './review/engine.ts';

const LOG_PREFIX = '[pi-code-review]';
const DEFAULT_FINDINGS_PATH = 'findings.json';
const CODE_QUALITY_REPORT_PATH = 'gl-code-quality-report.json';

function buildModel(config: ReviewConfig): Model<Api> {
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

export interface ReviewOptions {
  config: ReviewConfig;
  /** GitLab read access. Production passes a real `GitLabClient`; tests pass a fake. */
  client: MergeRequestProvider;
  /** The model provider to stream from. Production passes `openaiProvider()`;
   * tests pass `fauxProvider().provider` so no network call happens. */
  provider: Provider;
  /** Logs the review prompt/response under `--debug`. Defaults to a silent logger. */
  logger?: Logger;
}

/** Fetches the merge request, runs the `ReviewEngine`, and returns the
 * findings plus the diff refs `publish` will need. Never contacts GitLab to
 * publish anything, and never decides pass/fail — see `design.md`'s
 * "Severity-threshold decision moves to publish, not review" decision. */
export async function runReview(options: ReviewOptions): Promise<FindingsFile> {
  const { config, client, provider } = options;

  console.log(`${LOG_PREFIX} Fetching merge request context from GitLab...`);
  const sourceProvider = new GitLabSourceProvider(client, config.gitlab.mergeRequestIid);
  const context = await sourceProvider.buildReviewContext();
  console.log(`${LOG_PREFIX} Reviewing "${context.title}" (${context.changedFiles.length} changed file(s)).`);

  console.log(`${LOG_PREFIX} Running review with model "${config.openai.model}"...`);
  const engine = new AgentReviewEngine({
    provider,
    model: buildModel(config),
    apiKey: config.openai.apiKey,
    logger: options.logger,
  });
  const findings = await engine.review(context);
  console.log(`${LOG_PREFIX} Review produced ${findings.length} finding(s).`);

  return { diffRefs: sourceProvider.getDiffRefs(), findings };
}

export interface PublishOptions {
  config: PublishConfig;
  /** GitLab write access. Production passes a real `GitLabClient`; tests pass a fake. */
  client: MergeRequestWriter;
  findingsFile: FindingsFile;
  /** Where to write the Code Quality report. Defaults to `gl-code-quality-report.json`
   * in the working directory; tests override it to avoid writing a real file. */
  codeQualityReportPath?: string;
}

/** Publishes findings to GitLab, then decides pass/fail from the severity
 * threshold — always after publishing completes, so a severity gate can
 * never prevent a finding from being published. */
export async function runPublish(options: PublishOptions): Promise<boolean> {
  const { config, client, findingsFile } = options;

  console.log(`${LOG_PREFIX} Publishing ${findingsFile.findings.length} finding(s) to GitLab...`);
  const sinkProvider = new GitLabSinkProvider({
    client,
    mergeRequestIid: config.gitlab.mergeRequestIid,
    diffRefs: findingsFile.diffRefs,
    codeQualityReportPath: options.codeQualityReportPath ?? CODE_QUALITY_REPORT_PATH,
  });
  await sinkProvider.publish(findingsFile.findings);

  const passed = decidePassFail(findingsFile.findings, config.failOnSeverity);
  console.log(`${LOG_PREFIX} Result: ${passed ? 'pass' : 'fail'} (threshold: ${config.failOnSeverity}).`);
  return passed;
}

/** `review`'s own CLI flags. No `--fail-on` — `review` has no pass/fail
 * concept (see the `review-cli` spec's "Each command accepts only the
 * configuration it needs" requirement). */
export function parseReviewCliOptions(argv: string[]): ReviewConfigOverrides & { out?: string; debug?: boolean } {
  const { values } = parseArgs({
    args: argv,
    options: {
      'gitlab-url': { type: 'string' },
      'project-id': { type: 'string' },
      mr: { type: 'string' },
      token: { type: 'string' },
      model: { type: 'string' },
      'openai-base-url': { type: 'string' },
      'openai-api-key': { type: 'string' },
      out: { type: 'string' },
      debug: { type: 'boolean' },
    },
    strict: true,
  });
  return {
    apiUrl: values['gitlab-url'],
    projectId: values['project-id'],
    mergeRequestIid: values.mr,
    token: values.token,
    model: values.model,
    openaiBaseUrl: values['openai-base-url'],
    apiKey: values['openai-api-key'],
    out: values.out,
    debug: values.debug,
  };
}

/** `publish`'s own CLI flags. No `--model`/`--openai-base-url`/`--openai-api-key`
 * — `publish` never contacts OpenAI. */
export function parsePublishCliOptions(argv: string[]): PublishConfigOverrides & { from?: string; debug?: boolean } {
  const { values } = parseArgs({
    args: argv,
    options: {
      'gitlab-url': { type: 'string' },
      'project-id': { type: 'string' },
      mr: { type: 'string' },
      token: { type: 'string' },
      'fail-on': { type: 'string' },
      from: { type: 'string' },
      debug: { type: 'boolean' },
    },
    strict: true,
  });
  return {
    apiUrl: values['gitlab-url'],
    projectId: values['project-id'],
    mergeRequestIid: values.mr,
    token: values.token,
    failOnSeverity: values['fail-on'],
    from: values.from,
    debug: values.debug,
  };
}

/** `--debug` wins over `DEBUG` when both are given, consistent with every
 * other setting (see `config.ts`'s `resolve()`). Unlike every other setting,
 * this one is optional with a default (`false`), so it does not go through
 * `resolve()`'s "throw if missing" path. */
function resolveDebug(flag: boolean | undefined): boolean {
  return flag ?? (process.env.DEBUG === 'true' || process.env.DEBUG === '1');
}

/** Real wiring for `review`: builds the real GitLab client and the real
 * OpenAI provider, then delegates to `runReview()`. Exits 0 whenever the
 * review process itself completes, regardless of what it found — see the
 * `review-cli` spec's "Review's exit code reflects only process success"
 * requirement. Exits 0 without writing a findings file when the pipeline is
 * not a merge request pipeline. */
export async function runReviewCommand(argv: string[]): Promise<number> {
  const cliOptions = parseReviewCliOptions(argv);
  const outPath = cliOptions.out ?? DEFAULT_FINDINGS_PATH;

  if (!isMergeRequestPipeline(cliOptions)) {
    console.log(`${LOG_PREFIX} Not a merge request pipeline; skipping review.`);
    return 0;
  }

  const config = loadReviewConfig(cliOptions);
  const logger = buildLogger(resolveDebug(cliOptions.debug));
  const client = await GitLabClient.create({
    apiUrl: config.gitlab.apiUrl,
    projectId: config.gitlab.projectId,
    token: config.gitlab.token,
    logger,
  });

  const findingsFile = await runReview({ config, client, provider: openaiProvider(), logger });
  await writeFindingsFile(outPath, findingsFile);
  console.log(`${LOG_PREFIX} Wrote findings to "${outPath}".`);
  return 0;
}

/** Real wiring for `publish`: reads the findings file, builds the real
 * GitLab client, and delegates to `runPublish()`. Its exit code is the
 * severity-threshold decision — see the `review-cli` spec's "Publish's exit
 * code reflects the severity-threshold decision" requirement. */
export async function runPublishCommand(argv: string[]): Promise<number> {
  const cliOptions = parsePublishCliOptions(argv);
  const fromPath = cliOptions.from ?? DEFAULT_FINDINGS_PATH;

  const config = loadPublishConfig(cliOptions);
  const client = await GitLabClient.create({
    apiUrl: config.gitlab.apiUrl,
    projectId: config.gitlab.projectId,
    token: config.gitlab.token,
    logger: buildLogger(resolveDebug(cliOptions.debug)),
  });

  const findingsFile = await readFindingsFile(fromPath);
  const passed = await runPublish({ config, client, findingsFile });
  return passed ? 0 : 1;
}

/** Dispatches to `review` or `publish` by the first positional argument.
 * See the `review-cli` spec's "Provide separate review and publish commands"
 * requirement — the system MUST NOT run both in a single invocation.
 *
 * Takes the subcommand as `argv[0]` directly rather than through `parseArgs`'s
 * `allowPositionals`: with no `options` defined up front (the two subcommands
 * have different, mutually exclusive flag sets), `parseArgs` cannot tell a
 * value-taking flag like `--from x.json` from a boolean flag followed by a
 * positional, and misparses it — confirmed by hand before writing this. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;

  if (command === 'review') return runReviewCommand(rest);
  if (command === 'publish') return runPublishCommand(rest);

  throw new Error(`Unknown command "${command ?? ''}". Expected "review" or "publish".`);
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
