import assert from 'node:assert/strict';
import { test } from 'node:test';
import pino from 'pino';

function captureLogger() {
  const lines: string[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(chunk);
      return true;
    },
  };
  const logger = pino(
    {
      level: 'debug',
      redact: {
        paths: ['headers["PRIVATE-TOKEN"]', '*.headers["PRIVATE-TOKEN"]', 'apiKey', '*.apiKey'],
        censor: '[REDACTED]',
      },
    },
    stream as unknown as NodeJS.WritableStream,
  );
  return { logger, lines };
}

test('redact masks the PRIVATE-TOKEN header regardless of which object logs it', () => {
  const { logger, lines } = captureLogger();
  logger.debug({ headers: { 'PRIVATE-TOKEN': 'super-secret-token' } }, 'gitlab request');
  const output = lines.join('');
  assert.doesNotMatch(output, /super-secret-token/);
  assert.match(output, /\[REDACTED\]/);
});

test('redact masks apiKey regardless of which object logs it', () => {
  const { logger, lines } = captureLogger();
  logger.debug({ apiKey: 'sk-super-secret' }, 'review engine options');
  const output = lines.join('');
  assert.doesNotMatch(output, /sk-super-secret/);
  assert.match(output, /\[REDACTED\]/);
});

test('a silent-level logger produces no output', () => {
  const { logger, lines } = captureLogger();
  logger.level = 'silent';
  logger.debug({ anything: 'here' }, 'should not appear');
  assert.equal(lines.length, 0);
});
