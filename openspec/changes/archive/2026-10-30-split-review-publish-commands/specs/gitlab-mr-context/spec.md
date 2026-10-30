## REMOVED Requirements

### Requirement: Authenticate with the CI job token
**Reason**: This tool no longer uses GitLab CI's `CI_JOB_TOKEN`/`JOB-TOKEN` mechanism at all, in CI or locally. A `CI_JOB_TOKEN` value is only valid under the `JOB-TOKEN` header, during a real CI job; it does not work for a local manual run, which is the normal way to use the `review` command (see the `review-cli` capability). Supporting two token types and two headers was accepted complexity when a single-command flow needed to "just work" in CI with zero configuration; splitting into `review`/`publish` already requires a `GITLAB_TOKEN` CI/CD variable for other reasons (there is no separate zero-config story left to preserve), so the simpler, single auth path was chosen instead.

**Migration**: See this capability's "Authenticate with a GitLab access token" requirement. A pipeline that runs this tool must set `GITLAB_TOKEN` as a CI/CD variable holding a personal or project access token — it can no longer rely on GitLab CI's automatically-injected job token.

## ADDED Requirements

### Requirement: Authenticate with a GitLab access token
The system SHALL authenticate every GitLab API call with the `GITLAB_TOKEN` environment variable (or the `--token` CLI flag), sent in the `PRIVATE-TOKEN` request header. The system MUST NOT use GitLab CI's `CI_JOB_TOKEN`/`JOB-TOKEN` mechanism.

#### Scenario: Token is present
- **WHEN** the system calls the GitLab API
- **THEN** the system sends the `GITLAB_TOKEN` value in the `PRIVATE-TOKEN` request header

#### Scenario: Token is missing
- **WHEN** neither `GITLAB_TOKEN` nor `--token` is set
- **THEN** the system stops before it calls the GitLab API, and reports a clear configuration error
