import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FailureCategory } from '../types.ts';
import { UNREVIEWED_MARKER } from './marker.ts';
import { failureText, formatStatusBody, hasStatusToReport, warningTexts } from './status.ts';

// The texts of the review status comment are fixed (`harden-run-failures`).

const CATEGORIES: [FailureCategory, string][] = [
  ['model_failed', '**Review failed:** A model call failed after 3 tries. No finding was posted.'],
  [
    'output_cut',
    '**Review failed:** The model output was cut at the token limit, also after one retry with a larger limit. No finding was posted.',
  ],
  [
    'too_large',
    '**Review failed:** The change is too large for the context window of the model. No finding was posted.',
  ],
  ['other', '**Review failed:** The review stopped because of an error. See the job log. No finding was posted.'],
];

for (const [category, text] of CATEGORIES) {
  test(`the failure text for ${category} is the fixed text`, () => {
    assert.equal(failureText(category), text);
  });
}

test('the warning text for deduplication_failed is the fixed text', () => {
  assert.deepEqual(warningTexts([{ code: 'deduplication_failed' }]), [
    '**Warning:** The step that removes duplicate findings failed. Some comments may repeat.',
  ]);
});

test('the warning texts for the verification codes list the paths', () => {
  assert.deepEqual(
    warningTexts([
      { code: 'verification_failed', file: 'src/a.ts' },
      { code: 'verification_skipped', file: 'src/c.ts' },
      { code: 'verification_failed', file: 'src/b.ts' },
    ]),
    [
      '**Warning:** The check of the findings failed for these files. Their findings are not verified:\n\n- `src/a.ts`\n- `src/b.ts`',
      '**Warning:** These files are too large for the check of the findings. Their findings are not verified:\n\n- `src/c.ts`',
    ],
  );
});

test('there is one text for each warning code, in a fixed order', () => {
  const texts = warningTexts([
    { code: 'verification_skipped', file: 'z.ts' },
    { code: 'deduplication_failed' },
    { code: 'deduplication_failed' },
  ]);
  assert.equal(texts.length, 2);
  assert.match(texts[0]!, /removes duplicate findings/);
  assert.match(texts[1]!, /too large for the check/);
});

test('the body for a clean review equals the body of older versions', () => {
  assert.equal(
    formatStatusBody({ warnings: [] }, []),
    `${UNREVIEWED_MARKER}\nEvery changed file was reviewed in the latest review.`,
  );
});

test('the body for a file too large equals the body of older versions', () => {
  assert.equal(
    formatStatusBody({ warnings: [] }, [{ path: 'big.js', reason: 'too_large' }]),
    `${UNREVIEWED_MARKER}\n**Not reviewed:** GitLab did not return the diff of this file, because it is too large. Review the change by hand.\n\n- \`big.js\``,
  );
  assert.match(
    formatStatusBody({ warnings: [] }, [
      { path: 'a.js', reason: 'too_large' },
      { path: 'b.js', reason: 'too_large' },
    ]),
    /diff of these files, because/,
  );
});

test('the body of a failed review has the failure text and not the sentence that every file was reviewed', () => {
  const body = formatStatusBody({ failed: { category: 'output_cut' }, warnings: [] }, []);
  assert.equal(body, `${UNREVIEWED_MARKER}\n${failureText('output_cut')}`);
  assert.doesNotMatch(body, /Every changed file was reviewed/);
});

test('the body with a warning has the warning text and then the sentence that every file was reviewed', () => {
  const body = formatStatusBody({ warnings: [{ code: 'deduplication_failed' }] }, []);
  assert.equal(
    body,
    `${UNREVIEWED_MARKER}\n${warningTexts([{ code: 'deduplication_failed' }])[0]}\n\nEvery changed file was reviewed in the latest review.`,
  );
});

test('the body puts the failure, the warnings, and the files too large in this order', () => {
  const body = formatStatusBody(
    { failed: { category: 'model_failed' }, warnings: [{ code: 'deduplication_failed' }] },
    [{ path: 'big.js', reason: 'too_large' }],
  );
  const failure = body.indexOf('Review failed');
  const warning = body.indexOf('Warning');
  const notReviewed = body.indexOf('Not reviewed');
  assert.ok(failure > 0 && failure < warning && warning < notReviewed);
});

test('the body ignores a generated file', () => {
  assert.equal(
    formatStatusBody({ warnings: [] }, [{ path: 'yarn.lock', reason: 'generated' }]),
    formatStatusBody({ warnings: [] }, []),
  );
});

test('hasStatusToReport is true for a failure, a warning, or a file too large only', () => {
  assert.equal(hasStatusToReport({ warnings: [] }, []), false);
  assert.equal(hasStatusToReport({ warnings: [] }, [{ path: 'yarn.lock', reason: 'generated' }]), false);
  assert.equal(hasStatusToReport({ failed: { category: 'other' }, warnings: [] }, []), true);
  assert.equal(hasStatusToReport({ warnings: [{ code: 'deduplication_failed' }] }, []), true);
  assert.equal(hasStatusToReport({ warnings: [] }, [{ path: 'big.js', reason: 'too_large' }]), true);
});
