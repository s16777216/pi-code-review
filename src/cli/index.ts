#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { Api, Model, Provider } from '@earendil-works/pi-ai';
import {
  type PublishConfig,
  type PublishConfigOverrides,
  type ReviewConfig,
  type ReviewConfigOverrides,
  loadPublishConfig,
  loadReviewConfig,
} from '../config.ts';
import { type FindingsFile, readFindingsFile, writeFindingsFile } from '../findingsFile.ts';
import { gitlabHost } from '../providers/index.ts';
import type { ChangeRequest, CodeHost, DiscussionGateway, HostFlags } from '../core/ports.ts';
import { Publisher } from '../core/publish/publisher.ts';
import { loadTemplates, type CommentTemplates } from '../core/publish/template.ts';
import { buildLogger, silentLogger, type Logger } from '../logger.ts';
import {
  changesInstructionsFile,
  relativeToCwd,
  resolveInstructions,
  type ResolvedInstructions,
} from '../reviewInstructions.ts';
import { decidePassFail } from '../core/passFail.ts';
import { AgentReviewEngine } from '../core/review/engine.ts';
import { errorMessage } from '../core/errorMessage.ts';

const DEFAULT_FINDINGS_PATH = 'findings.json';

function buildModel(config: ReviewConfig): Model<Api> {
  return {
    id: config.openai.model,
    name: config.openai.model,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: config.openai.baseUrl,
    input: ['text'],
    reasoning: false,
    contextWindow: config.openai.contextWindow,
    maxTokens: config.openai.maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

export interface ReviewOptions {
  config: ReviewConfig;
  /** The change request to review. Production passes the host's; tests pass a fake. */
  changeRequest: ChangeRequest<unknown>;
  /** What names the change request in the findings file, for `publish`. */
  source: unknown;
  /** The model provider to stream from. Production passes `openaiProvider()`;
   * tests pass `fauxProvider().provider` so no network call happens. */
  provider: Provider;
  /** The review instructions, already picked by `resolveInstructions`. When
   * there are none, the review runs as before this option. */
  instructions?: ResolvedInstructions;
  /** Logs progress at `info` level and (under `--debug`) request/response
   * detail at `debug` level. Defaults to a silent logger. */
  logger?: Logger;
}

/** Loads the change request, runs the `ReviewEngine`, and returns the
 * findings plus the snapshot `publish` will need. Never publishes anything
 * (a `ChangeRequest` cannot), and never decides pass/fail — see `design.md`'s
 * "Severity-threshold decision moves to publish, not review" decision. */
export async function runReview(options: ReviewOptions): Promise<FindingsFile<unknown, unknown>> {
  const { config, changeRequest, source, provider, instructions } = options;
  const logger = options.logger ?? silentLogger();

  logger.info('Fetching merge request context from GitLab...');
  const { context, snapshot } = await changeRequest.load();
  logger.info(`Reviewing "${context.title}" (${context.changedFiles.length} changed file(s)).`);

  // Warn when the merge request changes the file that holds the review
  // instructions. The merge request author can then change the rules of their
  // own review (`add-review-instructions` design, Decision 5). Only a log line:
  // the review and its result do not change.
  if (instructions?.filePath !== undefined) {
    const changedPaths = context.changedFiles.flatMap((file) => [file.newPath, file.oldPath]);
    if (changesInstructionsFile(instructions.filePath, changedPaths)) {
      // A match means the file is inside the working directory.
      const file = relativeToCwd(instructions.filePath) ?? instructions.filePath;
      logger.warn(
        { source: instructions.source, file },
        `the merge request changes the file of the review instructions (${instructions.source}: ${file})`,
      );
    }
  }

  logger.info(`Running review with model "${config.openai.model}"...`);
  const engine = new AgentReviewEngine({
    provider,
    model: buildModel(config),
    apiKey: config.openai.apiKey,
    language: config.language,
    instructions: instructions?.text,
    logger,
  });
  const { findings, resolved, unreviewedFiles } = await engine.review(context);
  logger.info(`Review produced ${findings.length} finding(s) and ${resolved.length} fixed discussion(s).`);

  return { diffRefs: snapshot, source, findings, resolved, unreviewedFiles };
}

export interface PublishOptions {
  config: PublishConfig;
  /** The discussions of the change request. Production passes the host's; tests pass a fake. */
  gateway: DiscussionGateway;
  findingsFile: FindingsFile<unknown, unknown>;
  /** The text of a finding and of a resolved reply. Defaults to the built-in templates. */
  templates?: CommentTemplates;
  /** Logs progress at `info` level. Defaults to a silent logger. */
  logger?: Logger;
}

/** Publishes findings to the host, then decides pass/fail from the severity
 * threshold — always after publishing completes, so a severity gate can
 * never prevent a finding from being published. */
export async function runPublish(options: PublishOptions): Promise<boolean> {
  const { config, gateway, findingsFile } = options;
  const logger = options.logger ?? silentLogger();

  logger.info(`Publishing ${findingsFile.findings.length} finding(s) to GitLab...`);
  await new Publisher(gateway, { logger, ...(options.templates ? { templates: options.templates } : {}) }).publish(
    findingsFile.findings,
    findingsFile.resolved,
    findingsFile.unreviewedFiles,
  );

  const passed = decidePassFail(findingsFile.findings, config.failOnSeverity);
  logger.info(`Result: ${passed ? 'pass' : 'fail'} (threshold: ${config.failOnSeverity}).`);
  return passed;
}

/** `review`'s own CLI flags. No `--fail-on` — `review` has no pass/fail
 * concept (see the `review-cli` spec's "Each command accepts only the
 * configuration it needs" requirement). */
export function parseReviewCliOptions(
  argv: string[],
  hostFlags: CodeHost<unknown, unknown>['reviewFlags'],
): ReviewConfigOverrides & {
  out?: string;
  debug?: boolean;
  host: HostFlags;
  /** `--instructions`: the path of a file with review instructions. */
  instructions?: string;
  /** `--instructions-text`: the review instructions themselves. */
  instructionsText?: string;
} {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...hostFlags,
      model: { type: 'string' },
      'openai-base-url': { type: 'string' },
      'openai-api-key': { type: 'string' },
      'max-tokens': { type: 'string' },
      'context-window': { type: 'string' },
      language: { type: 'string' },
      instructions: { type: 'string' },
      'instructions-text': { type: 'string' },
      out: { type: 'string' },
      debug: { type: 'boolean' },
    },
    strict: true,
  });
  return {
    host: pickHostFlags(values, hostFlags),
    model: asString(values.model),
    openaiBaseUrl: asString(values['openai-base-url']),
    apiKey: asString(values['openai-api-key']),
    maxTokens: asString(values['max-tokens']),
    contextWindow: asString(values['context-window']),
    language: asString(values.language),
    instructions: asString(values.instructions),
    instructionsText: asString(values['instructions-text']),
    out: asString(values.out),
    debug: values.debug === true ? true : undefined,
  };
}

/** `publish`'s own CLI flags, plus the host's. No `--model`/`--openai-base-url`/
 * `--openai-api-key` — `publish` never contacts OpenAI. */
export function parsePublishCliOptions(
  argv: string[],
  hostFlags: CodeHost<unknown, unknown>['publishFlags'],
): PublishConfigOverrides & { from?: string; debug?: boolean; host: HostFlags } {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...hostFlags,
      'fail-on': { type: 'string' },
      'template-dir': { type: 'string' },
      from: { type: 'string' },
      debug: { type: 'boolean' },
    },
    strict: true,
  });
  return {
    host: pickHostFlags(values, hostFlags),
    failOnSeverity: asString(values['fail-on']),
    templateDir: asString(values['template-dir']),
    from: asString(values.from),
    debug: values.debug === true ? true : undefined,
  };
}

/** The values of the host's own flags, by flag name. */
function pickHostFlags(values: Record<string, unknown>, hostFlags: Record<string, { type: 'string' }>): HostFlags {
  return Object.fromEntries(Object.keys(hostFlags).map((flag) => [flag, asString(values[flag])]));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** `--debug` wins over `DEBUG` when both are given, consistent with every
 * other setting (see `config.ts`'s `resolve()`). Unlike every other setting,
 * this one is optional with a default (`false`), so it does not go through
 * `resolve()`'s "throw if missing" path. */
function resolveDebug(flag: boolean | undefined): boolean {
  return flag ?? (process.env.DEBUG === 'true' || process.env.DEBUG === '1');
}

/** Exit codes (`distinguish-exit-codes` design, Decision 1): `publish` uses
 * `EXIT_PASS` and `EXIT_FAIL` for the severity-threshold decision, and every
 * error that stops either command exits with `EXIT_ERROR`, so a CI job can
 * tell a failed review gate from a failed tool. */
export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_ERROR = 2;

/** Real wiring for `review`: connects to the host and builds the real OpenAI
 * provider, then delegates to `runReview()`. Exits 0 whenever the
 * review process itself completes, regardless of what it found, and never
 * exits 1; an error exits 2 at the entrypoint — see the
 * `review-cli` spec's "Review's exit code reflects only process success"
 * requirement. Exits 0 without writing a findings file when the pipeline is
 * not a merge request pipeline. */
export async function runReviewCommand<Snapshot, Source, ReviewSettings, PublishSettings>(
  argv: string[],
  host: CodeHost<Snapshot, Source, ReviewSettings, PublishSettings>,
): Promise<number> {
  const cliOptions = parseReviewCliOptions(argv, host.reviewFlags);
  const outPath = cliOptions.out ?? DEFAULT_FINDINGS_PATH;
  const logger = buildLogger(resolveDebug(cliOptions.debug));

  if (!host.isChangeRequest(cliOptions.host)) {
    logger.info('Not a merge request pipeline; skipping review.');
    return EXIT_PASS;
  }

  let settings: ReviewSettings | undefined;
  const config = loadReviewConfig(cliOptions, () => {
    settings = host.readReviewSettings(cliOptions.host);
  });
  // Pick the review instructions before the first host call. A source that is
  // not usable only writes a warning here; the review runs without it.
  const instructions = resolveInstructions(
    { instructions: cliOptions.instructions, instructionsText: cliOptions.instructionsText },
    logger,
  );
  const { changeRequest, source } = await host.openChangeRequest(settings as ReviewSettings, logger);

  const findingsFile = await runReview({
    config,
    changeRequest,
    source,
    provider: openaiProvider(),
    instructions,
    logger,
  });
  await writeFindingsFile(outPath, findingsFile);
  logger.info(`Wrote findings to "${outPath}".`);
  return EXIT_PASS;
}

/** Real wiring for `publish`: reads the findings file, connects to the host,
 * and delegates to `runPublish()`. Its exit code is the
 * severity-threshold decision — see the `review-cli` spec's "Publish's exit
 * code reflects the severity-threshold decision" requirement. */
export async function runPublishCommand<Snapshot, Source, ReviewSettings, PublishSettings>(
  argv: string[],
  host: CodeHost<Snapshot, Source, ReviewSettings, PublishSettings>,
): Promise<number> {
  const cliOptions = parsePublishCliOptions(argv, host.publishFlags);
  const fromPath = cliOptions.from ?? DEFAULT_FINDINGS_PATH;
  const logger = buildLogger(resolveDebug(cliOptions.debug));

  let settings: PublishSettings | undefined;
  const config = loadPublishConfig(cliOptions, () => {
    settings = host.readPublishSettings(cliOptions.host);
  });
  // Read and validate the findings file before connecting to the host, so a
  // bad file can never reach the host's API (see the `review-cli` spec's
  // "Publish reads findings from a file" requirement).
  const findingsFile = await readFindingsFile(
    fromPath,
    (value) => host.parseSnapshot(value),
    (value) => host.parseSource(value),
  );
  // Check the templates before the first host call, so a template that is not
  // valid can never reach the host (see the `review-output` spec's "Check
  // templates before publishing" requirement).
  const templates = await loadTemplates(config.templateDir, logger);
  const gateway = await host.restore(settings as PublishSettings, findingsFile.source, findingsFile.diffRefs, logger);

  const passed = await runPublish({
    config,
    gateway,
    findingsFile,
    templates,
    logger,
  });
  return passed ? EXIT_PASS : EXIT_FAIL;
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

  // The composition root: the only place that names a host.
  if (command === 'review') return runReviewCommand(rest, gitlabHost);
  if (command === 'publish') return runPublishCommand(rest, gitlabHost);

  throw new Error(`Unknown command "${command ?? ''}". Expected "review" or "publish".`);
}

/** Only run `main()` when this module is the process entrypoint (`node dist/cli/index.js`),
 * not when a test imports `runReview`/`main` from it. Compares resolved file URLs
 * (not raw path strings) so this works correctly on Windows too. `realpathSync` on
 * `argv[1]` matters: `import.meta.url` is already symlink-resolved by the ESM loader,
 * so a global install reached through a symlink/junction (e.g. nvm-windows' "C:\Program
 * Files\nodejs" link) would otherwise never compare equal, and `main()` would silently
 * never run. */
const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      // Not yet known whether `--debug` was requested (parsing may be what
      // failed) — `error`-level output is shown at either log level, so a
      // plain `info`-level logger is enough here.
      buildLogger(false).error(errorMessage(error));
      process.exitCode = EXIT_ERROR;
    });
}
