import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewContext } from '../types.ts';
import { buildReviewPrompt } from './prompt.ts';

function fixture(): ReviewContext {
  return {
    title: 'Fix off-by-one bug',
    description: 'Fixes a loop bound.',
    changedFiles: [
      { oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-for (i=0;i<=n;i++)\n+for (i=0;i<n;i++)' },
      { oldPath: null, newPath: 'b.ts', hunks: '@@ -0,0 +1,1 @@\n+export const b = 1;' },
    ],
    async getFileContent() {
      return { error: 'not used in this test' };
    },
  };
}

test('buildReviewPrompt includes the title, description, and every changed file path', () => {
  const prompt = buildReviewPrompt(fixture());

  assert.match(prompt, /Fix off-by-one bug/);
  assert.match(prompt, /Fixes a loop bound\./);
  assert.match(prompt, /a\.ts/);
  assert.match(prompt, /b\.ts/);
  assert.match(prompt, /for \(i=0;i<n;i\+\+\)/);
});

test('buildReviewPrompt falls back to a placeholder for an empty description', () => {
  const context = fixture();
  context.description = '';

  const prompt = buildReviewPrompt(context);

  assert.match(prompt, /no description provided/);
});
