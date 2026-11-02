import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);

// Poll silently; an idle session is ready for inspection, not proof of success.
export async function waitForReview({
  sessionId,
  project,
  call,
  intervalMs = 15_000,
  timeoutMs = 600_000,
  sleep = delay,
  now = Date.now,
}) {
  const deadline = now() + timeoutMs;
  const scope = project ? { project } : {};
  while (now() < deadline) {
    const result = await call("sessions.list", scope, deadline - now());
    const sessions = Array.isArray(result) ? result : result?.sessions;
    if (!Array.isArray(sessions))
      throw new Error("Unexpected sessions.list schema");
    const session = sessions.find(
      (item) => (item.sessionId ?? item.id) === sessionId,
    );
    if (!session) throw new Error("Reviewer session not found");
    if (typeof session.busy !== "boolean")
      throw new Error("Missing reviewer busy status");
    if (session.archived) throw new Error("Reviewer session is archived");
    if (!session.busy) {
      if (now() >= deadline) break;
      const review = await call(
        "sessions.read",
        { ...scope, sessionId, limit: 1, maxChars: 6000 },
        deadline - now(),
      );
      return { status: "idle", sessionId, review };
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
  return { status: "timeout", sessionId };
}

async function main() {
  const [sessionId, project] = process.argv.slice(2);
  if (!sessionId)
    throw new Error("Usage: node wait-review.mjs <sessionId> [project]");
  const cli =
    process.env.MONOCODE_CLI ||
    path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      "AppData/Local/MonoCode/monocode.exe",
    );
  const call = async (action, args, remainingMs) => {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(
        cli,
        ["app", action, "--json", JSON.stringify(args)],
        {
          windowsHide: true,
          timeout: Math.max(1, Math.min(30_000, remainingMs)),
          maxBuffer: 4 * 1024 * 1024,
        },
      ));
    } catch {
      // Do not echo command output or inherited credentials on transport failure.
      throw new Error(
        `${action} CLI failed or timed out; check CLI path and Operator access`,
      );
    }
    let envelope;
    try {
      envelope = JSON.parse(stdout);
    } catch {
      throw new Error(`${action} returned invalid JSON`);
    }
    if (envelope.ok !== true)
      throw new Error(
        `${action} rejected; check Operator access and session state`,
      );
    return envelope.result;
  };
  const result = await waitForReview({ sessionId, project, call });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === "timeout") process.exitCode = 2;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stdout.write(
      `${JSON.stringify({ status: "error", message: error.message })}\n`,
    );
    process.exitCode = 1;
  });
}
