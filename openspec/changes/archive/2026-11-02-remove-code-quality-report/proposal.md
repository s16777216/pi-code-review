## Why

The Code Quality report (`gl-code-quality-report.json`) was never part of the intended
scope; it was carried forward from the original design without a real need behind it. It
is also a GitLab-CI-specific artifact with no equivalent on other hosts, which would force
every future provider (see the `reorganize-src-layout` change) to either fake an unneeded
output or carry a provider-specific exception in the `SinkProvider` contract. The package
has no real users yet (`@s16777216/pi-code-review` has published versions `0.1.0` and
`0.1.1`, with no evidence of use), so removing it now carries no migration cost.

## What Changes

- **BREAKING**: `publish` no longer writes a Code Quality report file. The
  `--codeQualityReportPath` internal default (`gl-code-quality-report.json`) and its
  wiring are removed.
- Inline merge request comments (the other half of `review-output`) are unchanged.
- The `.gitlab-ci.yml` example in `README.md` drops its `artifacts: reports: codequality`
  block for the `publish` job.
- `findings.json` remains the only output `review` and `publish` exchange; the Code
  Quality report was always a side artifact derived from the same findings, never
  something downstream of this tool depended on.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `review-output`: removes the "Write a Code Quality report" requirement and its two
  scenarios. The "Publish findings as inline merge request comments" requirement is
  unchanged.

## Impact

- Affected code: `src/report/codeQuality.ts` and `src/report/codeQuality.test.ts`
  (deleted), `src/gitlab/sinkProvider.ts` (drops the Code Quality write step and the
  `codeQualityReportPath` option), `src/index.ts` (drops `CODE_QUALITY_REPORT_PATH` and
  the option passed into `GitLabSinkProvider`).
- Affected tests: `src/gitlab/sinkProvider.test.ts` and `src/index.test.ts` lose any
  assertion that a Code Quality report file was written.
- Affected docs: `README.md`'s `.gitlab-ci.yml` example and its "Output" section's
  description of what `publish` writes.
- No change to `review`'s output (`findings.json`) or to any CLI flag's name or default.
- No change to the `gitlab-mr-context` or `ai-diff-review` capabilities.
