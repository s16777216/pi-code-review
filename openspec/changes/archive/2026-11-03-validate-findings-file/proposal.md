# Proposal

## Why

`readFindingsFile` parses the JSON text and casts the result to `FindingsFile`. It does not check any field. A file with a missing `diffRefs`, a bad severity, or a string where a line number belongs passes the read. The error then happens later, in the middle of `publish`:

- A missing `diffRefs` sends each discussion without its three SHAs. GitLab rejects every discussion. `publish` logs each rejection and continues. The run posts nothing, and it still exits with code 0 when no finding meets the threshold.
- A bad line or path has the same result for that finding.
- An unknown severity makes `decidePassFail` compare against `undefined`. That finding then never fails the threshold.

The findings file is the contract between `review` and `publish`. People can also edit it by hand or produce it with another tool. `publish` must reject a bad file before it posts anything.

## What Changes

- `publish` validates the findings file after it parses the JSON and before it creates the GitLab client.
- A file that fails validation stops `publish` with a non-zero exit code and an error message. The message names the file and the first bad field, for example `findings[2].severity`.
- The finding check uses the same rules as the review engine. The two places cannot drift apart.
- Unknown extra fields are allowed and ignored.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `review-cli`: "Publish reads findings from a file" now requires `publish` to reject a findings file with an invalid structure before it calls the GitLab API.

## Impact

- Affected code: `src/findingsFile.ts` (the validation), `src/core/review/findings.ts` (export the single-finding check), `src/cli/index.ts` (read the file before the GitLab client is created).
- Affected tests: `src/findingsFile.test.ts`, `src/core/review/findings.test.ts`.
- No change to the file format that `review` writes. Every file that the current `review` writes passes the new check.
- No change to CLI flags.
