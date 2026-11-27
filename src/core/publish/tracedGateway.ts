import type { TelemetrySpan } from '@earendil-works/pi-telemetry';
import type { DiscussionGateway } from '../ports.ts';

/** The counts of what a `publish` run wrote, for its root span. */
export interface PublishCounts {
  created: number;
  replied: number;
  resolved: number;
  reopened: number;
}

/** The same gateway, with one span for each discussion that the run creates,
 * replies to, resolves, or reopens, and for the status comment
 * (`export-review-traces`, "Trace a publish run"). Reading the discussions
 * gets no span of its own: its host request has one. */
export function traceGateway(
  gateway: DiscussionGateway,
  parent: TelemetrySpan,
): { gateway: DiscussionGateway; counts: PublishCounts } {
  const counts: PublishCounts = { created: 0, replied: 0, resolved: 0, reopened: 0 };
  const traced: DiscussionGateway = {
    list: () => gateway.list(),
    createDiscussion: (position, body) =>
      parent.startSpan(
        {
          name: 'picr.publish.create_discussion',
          attributes: { 'picr.file': position.file, 'picr.line': position.line, 'picr.end_line': position.endLine },
        },
        async () => {
          await gateway.createDiscussion(position, body);
          counts.created += 1;
        },
      ),
    reply: (discussionId, body) =>
      parent.startSpan({ name: 'picr.publish.reply', attributes: { 'picr.discussion_id': discussionId } }, async () => {
        await gateway.reply(discussionId, body);
        counts.replied += 1;
      }),
    setResolved: (discussionId, resolved) =>
      parent.startSpan(
        {
          name: resolved ? 'picr.publish.resolve' : 'picr.publish.reopen',
          attributes: { 'picr.discussion_id': discussionId },
        },
        async () => {
          await gateway.setResolved(discussionId, resolved);
          if (resolved) counts.resolved += 1;
          else counts.reopened += 1;
        },
      ),
    createNote: (body) =>
      parent.startSpan({ name: 'picr.publish.status_comment', attributes: { 'picr.action': 'create' } }, () =>
        gateway.createNote(body),
      ),
    updateNote: (noteId, body) =>
      parent.startSpan({ name: 'picr.publish.status_comment', attributes: { 'picr.action': 'update' } }, () =>
        gateway.updateNote(noteId, body),
      ),
  };
  return { gateway: traced, counts };
}
