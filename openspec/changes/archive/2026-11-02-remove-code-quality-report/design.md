## Context

See `proposal.md` - Why. `buildCodeQualityReport()` (`src/report/codeQuality.ts`) is called
from one place, `GitLabSinkProvider.publish()` (`src/gitlab/sinkProvider.ts`), which also
owns the `codeQualityReportPath` option and the `writeFile()` call that writes it.

## Goals / Non-Goals

**Goals:**
- Remove the Code Quality report output and every line of code that exists only to
  produce it, with no remaining dead code or unused option.

**Non-Goals:**
- Do not change how inline merge request comments are published. That requirement is
  unchanged (see the `review-output` spec delta - only the Code Quality requirement is
  removed).
- Do not change `findings.json`'s shape or `review`'s behavior at all. This change is
  `publish`-only.

## Decisions

**Delete `src/report/codeQuality.ts` and its test, rather than keeping the module and
just not calling it.**
Dead code with no caller is a worse state than no code; `buildCodeQualityReport()` has
exactly one caller, and removing both removes the GitLab-Code-Quality-severity-mapping
concept entirely rather than leaving it to confuse a future reader. Alternative
considered: keep the module in case Code Quality support returns later. Rejected - git
history already preserves it; keeping unused code "just in case" is the thing this
change exists to undo.

**Drop `codeQualityReportPath` from `GitLabSinkProvider`'s constructor options, rather
than keeping it as a no-op.**
An option that no longer does anything is worse than no option - it invites a caller to
wonder why passing it changes nothing. `src/index.ts`'s `CODE_QUALITY_REPORT_PATH`
constant and the option it passes go with it.

## Risks / Trade-offs

- [A later, real need for a Code Quality report would mean re-adding this code] →
  Mitigation: the removed code is a handful of small, self-contained files, in git
  history; re-adding it is cheap if a real need appears.
- [Removing a requirement after two published versions (`0.1.0`, `0.1.1`) is a breaking
  change] → Mitigation: per `proposal.md` - Why, there are no known users yet, so the
  practical blast radius is zero; this is still marked **BREAKING** in the proposal for
  the record.
