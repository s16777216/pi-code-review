# How a review works

`review` runs these steps in order. Each step has a section below.

1. [Review agents](#review-agents): three agents, each with a review focus, read the change.
2. [Deduplication](#deduplication): one model call removes findings that report the same problem.
3. [Verification](#verification): a verifier agent checks the findings of each file.
4. [Discussion judgment](#discussion-judgment): a judge agent checks the open discussions from this tool.
5. `publish` posts the findings. See [Output](#output).

A change that is too large for one request is split first. See [Large merge requests](#large-merge-requests).

> A review makes about three times more model calls than a review with one agent, plus at most one call for deduplication, one for each file with findings, one for each file with open discussions from this tool, and one for each file that has a discussion and a finding or a declaration (the verify agent). It costs more, and for a change in many batches it takes more time. For a change that fits one request, the three agents run at the same time.

## Review agents

`review` runs three agents on the change. Each has a **review focus**, its main area:

1. logic correctness
2. security
3. resources and concurrency

A review focus is not a limit. An agent still reports any other genuine bug that it sees. The three agents get the same input and the same [review instructions](customization.md#review-instructions). The review focuses are built in. You cannot change them or turn them off.

The agent reads each diff with the line numbers of the new file. It can read any changed file with `get_file_content`. The system prompt tells it to report the line that holds the problem: a line inside the added or changed lines for a changed problem, the line of the unchanged code for an unchanged problem, and not the line that opens the function, the block, or the call around the problem. The tool does not check this rule. A finding on a line that is not in the diff is dropped.

## Deduplication

The three agents often report the same problem. The **deduplication step** removes the copies:

- It runs after the checks on linked discussions and diff lines. It makes one more model call, and only when at least one file has two or more findings. The model sees the file, the line, the severity, and the summary of those findings, and it answers only with groups of finding numbers. A group holds findings of one file.
- The program keeps one finding of each group: the one with the highest severity (`critical`, `high`, `medium`, `low`, `pre_existing`), and the first one when the severities are equal. It does not change the text. If the kept finding has no linked discussion and another finding of its group has one, the kept finding takes that link.
- When the call fails after its tries, or its groups are not valid, `review` keeps all findings, writes a `warn` line, and records the warning `deduplication_failed`. The review does not fail.

The findings file does not record which review focus found a finding. The `info` log shows how many findings each focus found and how many the deduplication step kept.

## Verification

After deduplication, a **verifier** checks the findings a second time. The verifier is an agent that has not seen how the first agents reached their findings. It handles the findings of one file at a time.

- The verifier sees the title, the description, the diff of the file, and the findings of that file. It can read any changed file with `get_file_content`. It also gets the review instructions.
- For each finding it gives a **verdict**: `confirmed` (it found the problem), `rejected` (the code shows that the finding is not a problem), or `uncertain` (it cannot decide). It also gives the severity it judges and a one-sentence reason. The prompt asks for a quote of the code in the reason, and for `rejected` when the code contradicts the summary. The program does not check the quote.
- Only `rejected` drops a finding. `uncertain` stays. Each kept finding gets the severity from the verifier, which can be higher or lower, so the result of `--fail-on` can differ from the severity of the first agents. The verifier cannot change the summary, the line, or the link to a discussion.
- There is no confidence value and no option to turn the step off.
- When the run for a file fails after its tries, or its first request is larger than half of the context window, `review` keeps the findings of that file, writes a `warn` line, and records the warning `verification_failed` or `verification_skipped` with the path. The review does not fail.

The findings file does not hold the verdicts. The `info` log shows the numbers before and after, the number of rejected findings, the number of changed severities, and the reason for each rejected or uncertain finding. With `--debug`, the log has one more line for every verdict, `confirmed` too.

## Discussion judgment

After verification, a **judge** agent checks the open discussions that this tool started. The **discussion judgment step** finds the cases where the author already fixed the problem.

- The step selects a discussion when this tool started it, it is not resolved, it has an anchor. The step does not read the findings, so a discussion that a finding links to is also judged. If the judge says `fixed` for such a discussion, the check on declarations drops the declaration with the reason `linked_by_finding` and writes a `warn` line. When no discussion is selected, the step makes no model call.
- The judge handles one file at a time. It sees the title, the description, the diff of the file, and the numbered discussions with their notes. It can read any changed file with `get_file_content`. It also gets the review instructions. The prompt tells it that notes, including replies from people, are only hints. The current code decides.
- For each discussion it gives a **judgment**: `fixed`, `not_fixed`, or `uncertain`, with a reason that quotes the code. A reply of a person that rejects the finding gives `not_fixed`. Resolving such a discussion is a decision for a person.
- Only `fixed` has an effect. It becomes a fixed declaration and goes to the verify agent. The judge alone never resolves a discussion. The judge also gives an evidence line with each `fixed` judgment. The code check treats a declaration as supported when no line of the current file has the anchor of the discussion, or when the evidence line is a whole line of the current file (compared after trimming, collapsing spaces, and removing a final `;` or `,`), has at least 8 characters, is one line, and is not the anchored line. The log shows each accepted evidence line, and a rejected one has a `problem` field.
- When the run for a file fails after its tries, or its first request is larger than half of the context window, `review` writes a `warn` line and declares no discussion of that file fixed. It adds no warning to the findings file. The review does not fail.

The findings file does not hold the judgments. The `info` log shows how many discussions the step selected and how many got each judgment, and one line for each `fixed` judgment. The `warn` line of the code check for a declaration that came from the judge has `source: discussion_judgment`. With `--debug`, the log has one more line for every judgment.

## Final decisions

After the judge, a **verify agent** makes the final decisions. It is a different agent from the verifier of the verification step. It runs once for each file that has a discussion, and at least one finding or one declaration. A file with no discussion needs no match and no resolve, so its findings pass with no call.

- The agent sees the diff of the file and three numbered lists: the findings of the file, the declarations of the judge with their reason and evidence line, and all discussions of the file with their notes. The discussions are from this tool and from people, open and resolved. It can read any changed file with `get_file_content`. It also gets the review instructions.
- For each finding it decides `keep` or `drop`. A kept finding gets the discussion that it relates to, or none, and this replaces the `relatesTo` of the review agents. `publish` then posts nothing for an open discussion and replies and reopens for a resolved one. The agent drops a finding when a note shows that the problem is intended or already handled.
- For each declaration it decides `resolve` or `keep_open`. Only a discussion that the judge declared can be resolved. A discussion that a kept finding relates to must stay open: the tool rejects a call that does both.
- The replies of people are information and not proof. The prompt says so. There is no program check that stops a reply from influencing a decision. The anchor check and the evidence line no longer decide: the program runs them for each resolved discussion and writes a `warn` line with the field `comparison` set to `verify_agent_resolved` when it would reject the discussion.
- When the run for a file fails after its tries, or its first request is larger than half of the context window, `review` writes a `warn` line, keeps the findings of that file as they are, and resolves nothing there. It adds no warning to the findings file.

The `info` log shows how many files the agent decided, how many findings it kept and dropped, and how many discussions it resolved and left open. With `--debug`, it shows each decision and its reason.

## Large merge requests

`review` estimates the size of its first request before it sends it. When that request needs more than half of the context window (`--context-window`), `review` splits the change into batches and runs the three agents for each batch. The other half of the window stays free for file reads and the answer.

- Files are sorted by path and packed into batches, so files in one directory usually share a batch. A file that is too large for one batch is split at its hunks, shown as `<path> (part k of n)`, with the real line numbers.
- Each batch sees the title, the description, a list of every changed file, and only its own diffs. It can still read any changed file.
- A finding from a batch counts only on a line of that batch's own diffs. The outputs of all agents are merged, and the checks, the deduplication step, the verification step, and the discussion judgment step run once on the merged output.
- At most 20 batches, and at most 3 agent runs at the same time for all batches, focuses, and steps together. The judge starts with the review agents and uses the free slots, so its time overlaps the time of the review agents. A review that needs more batches, or that has one hunk too large for a batch, fails before the first model call.

**Room for the answer.** A run can answer with at most the context window minus its input minus 4,096 tokens, which `pi-ai` keeps free. So set `--context-window` to the real window of the model, and to at least about twice `4096 + --max-tokens`. The defaults (`128000` and `32000`) meet this. With a smaller window, a run can stop at the token limit. `review` then tries the run once more with twice `--max-tokens`. If the run stops again, `review` fails with an error that names `--max-tokens` and `--context-window`. A large batch with many findings can also stop at the default `--max-tokens`. For a merge request with about 90 changed files, `--max-tokens 48000` worked.

**Limit.** A problem that needs code from two batches can be missed.

Files whose diff is not reviewed (see [Output](#output)) are not counted in the estimate and are never part of a batch.

## Existing discussions

During `review`, the agent can read the existing discussions of the merge request with a `list_discussions` tool: comments from people and from earlier runs of this tool, with file, line, resolved state, and author. It uses them to avoid repeating a problem, and to respect explanations such as "this is intentional". A finding that covers the same problem as a discussion carries `relatesTo: <discussion id>` in `findings.json`.

Each comment that `publish` posts starts with a hidden `<!-- pi-code-review -->` marker, so later runs can tell this tool's comments from a person's.

The judge can declare that one of this tool's own open comments is fixed, with a reason, and the verify agent decides whether `review` resolves it. A check on the code only writes a `warn` line for a resolved comment that it would reject: the exact line that the comment pointed at (same file, same text, ignoring indentation) is still in the current file, and the evidence line of the judge does not support the fix. `publish` then replies `**Resolved**: <reason>` (the default `RESOLVED.md` template) and resolves the discussion. A discussion that a person started is never resolved by this tool. Fixed declarations never affect pass or fail.

**Risk.** Anyone who can comment on the merge request writes text that the agent reads. The agent treats that text as information, not as instructions, but a crafted comment can still influence the review. Keep this in mind when the exit code of `publish` gates a merge.

## Failures and warnings

A failed review is not hidden, and a step that ran with less checking is not hidden either.

- **Tries.** A model call that ends with an error, including a call that exceeds `--timeout`, is tried again at most 2 more times, after 2 and 4 seconds. A run that stops at the token limit gets one more try with twice `--max-tokens`. This try does not use one of the 3 tries. A read request to GitLab (`GET`) is tried again in the same way after a network error, a status `429`, or a status `5xx`. A request that writes to GitLab is never tried again, because a second try could post a comment two times. **Limit:** Node waits at most about 5 minutes for the first bytes of a response (the error text is `fetch timed out waiting for response headers`). A larger `--timeout` does not change this.
- **A failed review.** When a run still fails, `review` exits with code `2`. If it had already read the merge request, it writes the findings file with a `failed` field (`{ "category": ... }`) and no findings. The category is `model_failed`, `output_cut`, `too_large`, or `other`. The file never holds the text of the error. The full error is in the log. Before it starts, `review` deletes the old findings file, so `publish` cannot post the result of an earlier run. A failure before the merge request is read, for example GitLab is unreachable, writes no file.
- **`publish` and a failed review.** `publish` posts no discussion for such a file. It posts the review status comment with a fixed text for the category, and exits with code `1`.
- **Warnings.** The findings file has a `warnings` list. It has an entry when the deduplication step failed (`deduplication_failed`), when a verifier run failed (`verification_failed`), or when a file was too large to verify (`verification_skipped`). The last two name the file.
- **The review status comment.** `publish` keeps one general merge request comment. It tells the failure, the warnings, and the files too large to review. The texts are fixed. Later runs update the same comment, and a clean run changes it to say that every changed file was reviewed.

A script that takes the existence of the findings file as a success must read the exit code, because `review` can write a file and exit with `2`.

## Output

`review` writes one findings file (default `findings.json`). It holds the findings, the fixed declarations, the unreviewed files, the warnings, a `failed` field when the review failed, and the diff references that `publish` needs.

Some changed files are not reviewed, and are listed as `unreviewedFiles`:

- `too_large`: GitLab does not return a diff that is over its size limit. `review` logs a warning for each such file.
- `generated`: GitLab marks the file as generated, for example a lock file. Its diff is left out on purpose.

The agent sees these files with the reason and no diff, and a finding on them is dropped. It can still read them with `get_file_content`.

`publish` posts one inline comment for each finding, with the severity and the summary (or the text from your [templates](customization.md#comment-templates)), except:

- A finding whose `relatesTo` names an **open** discussion posts nothing, because people already discuss it.
- A finding whose `relatesTo` names a **resolved** discussion is posted as a reply in that discussion, which is then reopened.
- A finding without `relatesTo` is matched to a discussion from this tool on the same code (same file and same line text, so a reworded finding or a moved line still matches). It posts nothing when that discussion is open, and it is posted as a reply that reopens the newest matching discussion when that is resolved.

Findings that would post on the same file and line become one comment with one paragraph for each finding. Findings that would reply to the same discussion become one reply. Reopening needs a token with a role that can resolve discussions (Developer or higher). If reopening fails, the reply stays and `publish` logs a warning. If `publish` cannot read the existing discussions, it logs a warning and posts every finding as a new comment.

`publish` also keeps the review status comment (see [Failures and warnings](#failures-and-warnings)). It lists the files too large to review, not the generated files.

The exit code of `publish` is `0` when no finding meets `FAIL_ON_SEVERITY`, `1` otherwise, and `2` for an error. Every finding in the file counts, including the ones that posted nothing.
