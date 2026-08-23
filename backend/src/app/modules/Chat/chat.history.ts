import config from '../../config';
import { IChatMessage } from './chat.interface';

/**
 * History compaction (Phase 2.4).
 *
 * The old rule was a flat "last 10 messages". That has two failure modes, and compaction fixes the
 * second without reintroducing the first:
 *
 *  - **Cost.** Every turn resends the whole window, so a long conversation pays for the same ten
 *    messages again and again.
 *  - **Amnesia.** At message eleven the oldest exchange silently disappears. Nothing tells the user,
 *    and the model starts contradicting things it agreed to four turns ago.
 *
 * Keeping the recent turns verbatim and folding everything older into one summary line bounds the
 * cost while leaving a trace of the earlier conversation, instead of dropping it on the floor.
 */

export interface CompactedHistory {
  /** Messages to replay, oldest first. A summary, when present, is the first entry. */
  messages: IChatMessage[];
  /** How many original messages the summary stands in for. 0 when nothing was folded. */
  summarizedCount: number;
}

/**
 * One line per folded exchange, truncated. Deliberately extractive rather than LLM-generated: an
 * abstractive summary would need its own provider call on every turn past the window, which trades
 * away the cost this is meant to save. The prompt is told plainly that it is reading a condensed
 * transcript so it does not quote these as verbatim.
 */
const SUMMARY_PREFIX =
  'Earlier in this conversation (condensed, do not quote as verbatim):';
const SUMMARY_LINE_CHARS = 140;

const summarize = (older: IChatMessage[]): string =>
  [
    SUMMARY_PREFIX,
    ...older.map((m) => {
      const oneLine = m.content.replace(/\s+/g, ' ').trim();
      const clipped =
        oneLine.length > SUMMARY_LINE_CHARS
          ? `${oneLine.slice(0, SUMMARY_LINE_CHARS)}…`
          : oneLine;
      return `- ${m.role}: ${clipped}`;
    }),
  ].join('\n');

/**
 * Splits history into a summary of the old part plus the recent part verbatim.
 *
 * The boundary is counted in *messages* (two per turn) so a user turn is never separated from the
 * answer it received — replaying half an exchange reads as the assistant talking to itself.
 */
export const compactHistory = (
  history: IChatMessage[],
  verbatimTurns: number = config.chat.history_verbatim_turns,
): CompactedHistory => {
  const verbatimCount = Math.max(2, verbatimTurns * 2);
  if (history.length <= verbatimCount) {
    return { messages: history, summarizedCount: 0 };
  }

  // Snap the boundary forward until the verbatim part opens on a user message. Counting back a
  // fixed number of messages is not enough: an odd-length history (a turn still awaiting its
  // answer, or a stored partial reply) puts an assistant message first, so the replay would open
  // mid-exchange and read as the assistant answering nothing.
  let splitAt = history.length - verbatimCount;
  if (history[splitAt].role !== 'user' && splitAt + 1 < history.length) {
    splitAt += 1;
  }

  const older = history.slice(0, splitAt);
  const recent = history.slice(splitAt);

  // Carries the team/conversation identity of the messages it replaces, so anything that later
  // inspects these (logging, a future persistence step) sees a coherent record rather than a stub.
  const summaryMessage: IChatMessage = {
    team_id: older[0].team_id,
    conversation_id: older[0].conversation_id,
    role: 'user',
    content: summarize(older),
    created_at: older[0].created_at,
  };

  return {
    messages: [summaryMessage, ...recent],
    summarizedCount: older.length,
  };
};
