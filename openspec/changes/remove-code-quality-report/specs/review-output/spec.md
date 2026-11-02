## REMOVED Requirements

### Requirement: Write a Code Quality report
**Reason**: Out of scope. The Code Quality report is a GitLab-CI-specific artifact with
no equivalent on other hosts, and was never backed by a real need. No published version
of this tool has real users, so removing it has no migration cost.
**Migration**: None. `review` and `publish` still exchange `findings.json`; no other part
of the system reads the Code Quality report.
