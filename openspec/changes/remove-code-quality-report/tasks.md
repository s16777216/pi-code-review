## 1. Remove the Code Quality report module

- [x] 1.1 Delete `src/report/codeQuality.ts` and `src/report/codeQuality.test.ts`, and
      verify `src/report/` now contains only `exitCode.ts`/`exitCode.test.ts`.

## 2. Remove the write step from the GitLab sink

- [x] 2.1 In `src/gitlab/sinkProvider.ts`, remove the `buildCodeQualityReport` import,
      the `codeQualityReportPath` and `writeReport` options from
      `GitLabSinkProviderOptions`, the `writeCodeQualityReport` method, and its call in
      `publish()`. Verify `npm run build` reports no error.
- [x] 2.2 In `src/gitlab/sinkProvider.test.ts`, remove every test and option that exists
      only to exercise the Code Quality report write (the `writeReport` injection and any
      assertion on its output). Verify the remaining tests for inline-comment publishing
      are untouched and still pass.

## 3. Remove the CLI wiring

- [x] 3.1 In `src/index.ts`, remove the `CODE_QUALITY_REPORT_PATH` constant and the
      `codeQualityReportPath` field passed into `GitLabSinkProvider`. Verify
      `npm run build` reports no error.
- [x] 3.2 In `src/index.test.ts`, remove any option or assertion tied to the Code Quality
      report path. Verify the remaining `runPublish` tests still pass.

## 4. Update docs

- [x] 4.1 In `README.md`, remove the `artifacts: reports: codequality` block from the
      `publish` job in the `.gitlab-ci.yml` example, and remove the Code Quality report
      line from the "Output" section's list of what `publish` writes.

## 5. Final verification

- [x] 5.1 Run `npm run build` and verify zero TypeScript errors.
- [x] 5.2 Run `npm test` and verify every remaining test passes, with the Code
      Quality-specific tests gone (not skipped, not failing - removed).
- [x] 5.3 Search product source, tests, README, and `.gitignore` for `codeQuality`,
      `CODE_QUALITY_REPORT_PATH`, and `gl-code-quality-report.json`; confirm none remain.
      OpenSpec planning and archived records are excluded because they document the
      removal and its historical context.
