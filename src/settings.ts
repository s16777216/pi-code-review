/** A missing or invalid setting. The CLI reports it before it calls any API. */
export class ConfigError extends Error {}

/** Reads `override` if given, falling back to `envName`'s environment
 * variable only when `override` is not set. A CLI flag always wins over
 * its matching environment variable when both are present. Throws
 * `ConfigError` when neither is set. */
export function requireSetting(envName: string, override: string | undefined): string {
  const value = override ?? process.env[envName];
  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${envName}`);
  }
  return value;
}
