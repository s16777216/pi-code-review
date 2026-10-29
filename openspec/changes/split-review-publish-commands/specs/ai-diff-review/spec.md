## REMOVED Requirements

### Requirement: Decide the pass/fail outcome from a severity threshold
**Reason**: The `ReviewEngine`'s own interface (`review(context): Promise<Finding[]>`) never returned a pass/fail outcome; this requirement described when the decision happened, not something the engine itself computed through its interface. The CLI now has a `review` command with no concept of failing, and a separate `publish` command — the decision moves to `publish`, so a severity threshold can never prevent a finding from being published.

**Migration**: See the `review-cli` capability's "Publish's exit code reflects the severity-threshold decision" requirement. The decision itself (findings plus a threshold, with the same `important`/`nit`/`none` semantics) is unchanged; only which command makes it, and when, has moved.
