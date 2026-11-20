## ADDED Requirements

### Requirement: Run the steps on the merged output
The system SHALL merge the outputs of all agents before it runs the checks on `relatesTo`, the diff line check, the anchor, the deduplication step, the verification step, the verify agent step, and the code check of the resolved discussions, in this order. The discussion judgment step does not wait for this order. The requirement "Judge each open discussion of this tool" says when it starts, and the verify agent step MUST wait for its result. The merge SHALL keep the findings in the order of the run scopes, and in each run scope in the order of the review focuses. In the code check, "the same output" MUST mean the merged output of the review.

#### Scenario: Order of the merged findings
- **WHEN** a run scope has findings from the agent for security and from the agent for logic correctness
- **THEN** the merged findings list the findings of the agent for logic correctness first

#### Scenario: The verify agent step waits for the judgment step
- **WHEN** the verification step ends before the discussion judgment step
- **THEN** the verify agent step starts after the discussion judgment step ends

#### Scenario: The verification step does not change the selection
- **WHEN** the verification step drops the only finding that has `relatesTo` equal to `d1`
- **THEN** the discussion judgment step has selected `d1` in the same way as without that finding

#### Scenario: A finding in another batch links to the discussion
- **WHEN** batch 2 has a finding with `relatesTo` equal to `d1`, and the judge gave `fixed` for `d1`
- **THEN** the verify agent gets the finding and the declaration of `d1` in one run and decides both

### Requirement: Stop the judge when the review fails
The system SHALL start no new judge run after the review fails. A judge run that already started MAY end by itself. The failure of the review MUST NOT leave an unhandled error from a judge run.

#### Scenario: A review agent run fails for good
- **WHEN** a review agent run fails on its last try while the judgment step has 3 files that wait for a slot
- **THEN** the system starts no judge run for those files, and the review reports the failure of the review agent run

#### Scenario: A judge run ends after the review failed
- **WHEN** a judge run is active when the review fails, and the judge run then ends with an error
- **THEN** the system reports only the failure of the review, and no unhandled error is left

## MODIFIED Requirements

### Requirement: Judge each open discussion of this tool
The system SHALL start the discussion judgment step when the review starts, at the same time as the agents for the review focuses, and the verify agent step MUST wait for the result of the step. The step MUST select a discussion only when all of these are true. This tool started the discussion. It is not resolved. It has an anchor and a file. The selection MUST NOT read the findings. The system SHALL start one judge run for each file that has at least one selected discussion. The judge SHALL give each selected discussion of that file one judgment: `fixed`, `not_fixed`, or `uncertain`. The system MUST NOT call the model for this step when no discussion is selected.

#### Scenario: The step starts with the review agents
- **WHEN** a review starts with one open discussion from this tool
- **THEN** the system starts the judge run for that file before the review agents end

#### Scenario: Selected discussions are judged by file
- **WHEN** two open discussions from this tool are on `src/a.ts` and one is on `src/b.ts`
- **THEN** the system starts two judge runs, one for `src/a.ts` with two discussions and one for `src/b.ts` with one discussion

#### Scenario: A discussion from a person is not selected
- **WHEN** the only open discussion on a file was started by a person
- **THEN** the system does not select it and does not start a judge run for that file

#### Scenario: A resolved discussion is not selected
- **WHEN** a discussion from this tool is resolved
- **THEN** the system does not select it

#### Scenario: A discussion without a file is not selected
- **WHEN** a discussion from this tool is a general comment with no file
- **THEN** the system does not select it

#### Scenario: A discussion without an anchor is not selected
- **WHEN** a discussion from this tool has no anchor
- **THEN** the system does not select it

#### Scenario: A finding links to the discussion
- **WHEN** a finding that remains after the verification step has `relatesTo` equal to `d1`, and `d1` is an open discussion from this tool with a file and an anchor
- **THEN** the system selects `d1` and gives it to the judge

#### Scenario: No discussion is selected
- **WHEN** no discussion meets the selection rules
- **THEN** the system does not call the model for the discussion judgment step

#### Scenario: The discussions cannot be listed
- **WHEN** the list of discussions is not available
- **THEN** the system does not call the model for the discussion judgment step

### Requirement: Limit parallel runs
The system SHALL run at most 3 agent runs at the same time. All agents of all run scopes use this one limit, and the limit covers runs of different steps that are active at the same time. The other runs SHALL wait in this order: by run scope, and then by review focus. The verifier runs of the verification step use the same limit of 3 runs, and they wait in the order of their files. The judge runs of the discussion judgment step use the same limit of 3 runs, and they wait in the order of their files. They wait behind the runs of the agents for the review focuses. The verify agent runs of the verify agent step use the same limit of 3 runs, and they wait in the order of their files.

#### Scenario: Parallel runs are limited
- **WHEN** a review has 5 batches, and so 15 agent runs
- **THEN** at most 3 of their runs are active at the same time

#### Scenario: One run scope
- **WHEN** a review has one run scope, and so 3 agent runs
- **THEN** the 3 runs can be active at the same time

#### Scenario: Verifier runs are limited
- **WHEN** the verification step has 5 files with findings
- **THEN** at most 3 verifier runs are active at the same time

#### Scenario: Judge runs are limited
- **WHEN** the discussion judgment step has 5 files with selected discussions
- **THEN** at most 3 judge runs are active at the same time

#### Scenario: Judge runs and review runs share the limit
- **WHEN** a review has 6 agent runs and the discussion judgment step has 2 judge runs
- **THEN** at most 3 of the 8 runs are active at the same time

#### Scenario: Verify agent runs are limited
- **WHEN** the verify agent step has 5 files with a discussion and a finding
- **THEN** at most 3 verify agent runs are active at the same time

## REMOVED Requirements

### Requirement: Run the checks in order on the merged output
**Reason**: The requirement puts the discussion judgment step in one order with the other steps. The judge starts with the review agents now.
**Migration**: Use "Run the steps on the merged output". The scenario "The discussion judgment step runs after the verification step" is replaced by "The verify agent step waits for the judgment step" and "The verification step does not change the selection".
