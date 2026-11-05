import type { ChangedFileDiff, ReviewContext, ReviewDiscussion } from '../types.ts';

/** A change that exercises every case the prompts and checks handle: a
 * modified file with two hunks, a new file, a deleted file, a renamed file, a
 * generated file (omitted), and a file that is too large (omitted). */
export function fixtureFiles(): ChangedFileDiff[] {
  return [
    {
      oldPath: 'src/a.ts',
      newPath: 'src/a.ts',
      hunks: [
        '@@ -1,4 +1,5 @@',
        ' import { x } from "./x";',
        '-const n = 1;',
        '+const n = 2;',
        '+const m = 3;',
        ' ',
        ' export { n };',
        '@@ -20,3 +21,4 @@',
        ' function f() {',
        '-  return 1;',
        '+  return 2;',
        '+  // changed',
        ' }',
        '',
      ].join('\n'),
    },
    {
      oldPath: 'src/b.ts',
      newPath: 'src/b.ts',
      hunks: [bigHunk('b', 1, 14), bigHunk('c', 41, 14), bigHunk('d', 81, 14)].join(''),
    },
    { oldPath: 'src/gone.ts', newPath: null, hunks: '@@ -1,2 +0,0 @@\n-old line one\n-old line two\n', deleted: true },
    { oldPath: 'src/old-name.ts', newPath: 'src/new-name.ts', hunks: '@@ -3,1 +3,1 @@\n-before\n+after\n' },
    { oldPath: 'yarn.lock', newPath: 'yarn.lock', hunks: '@@ -1 +1 @@\n-a\n+b\n', omitted: 'generated' },
    { oldPath: 'data/huge.json', newPath: 'data/huge.json', hunks: '', omitted: 'too_large' },
  ];
}

/** One hunk of `lines` changed lines starting at new-file line `start`, long
 * enough that a small context window cannot hold several hunks together. */
function bigHunk(name: string, start: number, lines: number): string {
  const body = Array.from({ length: lines }, (_, i) => `+export const ${name}${i} = ${i}; // ${'x'.repeat(40)}`);
  return [`@@ -${start},0 +${start},${lines} @@`, ...body, ''].join('\n');
}

export function fixtureDiscussions(): ReviewDiscussion[] {
  return [
    {
      id: 'own-open',
      file: 'src/a.ts',
      line: 2,
      positionCommit: 'old',
      resolved: false,
      fromThisTool: true,
      anchor: '0123456789abcdef',
      notes: [{ author: 'bot', body: '**[important]** Earlier problem.' }],
    },
  ];
}

export function fixtureContext(): ReviewContext {
  return {
    title: 'Characterization change',
    description: 'Pins the prompts.',
    changedFiles: fixtureFiles(),
    listDiscussions: async () => fixtureDiscussions(),
    getFileContent: async (path) => `// content of ${path}\nconst n = 2;\n`,
  };
}
