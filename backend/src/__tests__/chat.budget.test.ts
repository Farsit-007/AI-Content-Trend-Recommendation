import {
  approxTokens,
  budgetContext,
  dedupeAgainstHistory,
} from '../app/modules/Chat/chat.budget';
import { compactHistory } from '../app/modules/Chat/chat.history';
import {
  ChatContextItem,
  IChatMessage,
} from '../app/modules/Chat/chat.interface';

const item = (
  content: string,
  overrides: Partial<ChatContextItem> = {},
): ChatContextItem => ({
  source: 'news_item',
  content,
  ...overrides,
});

const msg = (role: 'user' | 'assistant', content: string): IChatMessage => ({
  team_id: 't',
  conversation_id: 'c',
  role,
  content,
  created_at: new Date('2026-08-23T00:00:00Z'),
});

describe('context token budget', () => {
  it('keeps items in rank order until the budget is spent, and reports what it dropped', () => {
    const budget = approxTokens('x'.repeat(300)) * 2;
    const result = budgetContext(
      [item('x'.repeat(300)), item('y'.repeat(300)), item('z'.repeat(300))],
      budget,
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0].content.startsWith('x')).toBe(true);
    expect(result.items[1].content.startsWith('y')).toBe(true);
    expect(result.dropped).toBe(1);
    expect(result.approxTokens).toBeLessThanOrEqual(budget);
  });

  it('truncates a single oversized item rather than returning nothing', () => {
    // Returning an empty context makes the model answer "I have nothing on that" — a worse outcome
    // than a slightly clipped passage, because the data was in fact there.
    const result = budgetContext([item('x'.repeat(9000))], 100);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].content.endsWith('…')).toBe(true);
    expect(result.dropped).toBe(0);
  });

  it('skips rather than truncates an oversized item once something is already kept', () => {
    // A mid-sentence fragment invites the model to quote it as if complete.
    const small = item('short');
    const result = budgetContext(
      [small, item('x'.repeat(9000))],
      approxTokens('short') + 5,
    );

    expect(result.items).toEqual([small]);
    expect(result.dropped).toBe(1);
  });

  it('admits everything when the budget is ample', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(budgetContext(items, 10_000).items).toEqual(items);
  });

  it('counts Bangla conservatively, so a dense script cannot silently overrun the budget', () => {
    // The divisor deliberately under-counts characters-per-token for Bengali; erring the other way
    // is what would let a Bangla context exceed the budget and cost real money.
    expect(approxTokens('বাংলা')).toBeGreaterThanOrEqual(1);
    expect(approxTokens('x'.repeat(30))).toBe(10);
  });
});

describe('history deduplication', () => {
  it('drops context the conversation has already carried', () => {
    const repeated = item('Title: Anthropic ships prompt caching');
    const fresh = item('Title: Something nobody mentioned');

    const result = dedupeAgainstHistory([repeated, fresh], [repeated.content]);

    expect(result).toEqual([fresh]);
  });

  it('matches despite whitespace and case drift between turns', () => {
    const result = dedupeAgainstHistory(
      [item('Title:   Anthropic Ships  Prompt Caching')],
      ['title: anthropic ships prompt caching'],
    );

    expect(result).toEqual([]);
  });

  it('keeps everything when there is no history', () => {
    const items = [item('a'), item('b')];
    expect(dedupeAgainstHistory(items, [])).toEqual(items);
  });
});

describe('history compaction', () => {
  it('replays a short conversation verbatim', () => {
    const history = [msg('user', 'one'), msg('assistant', 'two')];
    const result = compactHistory(history, 6);

    expect(result.messages).toEqual(history);
    expect(result.summarizedCount).toBe(0);
  });

  it('folds older exchanges into one summary and keeps the recent ones verbatim', () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `message ${i}`),
    );

    const result = compactHistory(history, 2);

    // 2 turns verbatim = 4 messages, plus one summary standing in for the other 6.
    expect(result.messages).toHaveLength(5);
    expect(result.summarizedCount).toBe(6);
    expect(result.messages[0].content).toContain('condensed');
    expect(result.messages[0].content).toContain('message 0');
    expect(result.messages.slice(1).map((m) => m.content)).toEqual([
      'message 6',
      'message 7',
      'message 8',
      'message 9',
    ]);
  });

  it('never splits an exchange, so the assistant is not left talking to itself', () => {
    const history = Array.from({ length: 9 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`),
    );

    const result = compactHistory(history, 3);
    const verbatim = result.messages.slice(1);

    // Snapped forward by one, so the replay opens on a user turn rather than mid-exchange.
    expect(verbatim).toHaveLength(5);
    expect(verbatim[0].role).toBe('user');
  });

  it('keeps at least one exchange verbatim even if asked for zero turns', () => {
    const history = Array.from({ length: 6 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`),
    );

    const result = compactHistory(history, 0);

    expect(result.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('carries the team and conversation identity onto the summary message', () => {
    const history = Array.from({ length: 8 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`),
    );

    const [summary] = compactHistory(history, 1).messages;

    expect(summary.team_id).toBe('t');
    expect(summary.conversation_id).toBe('c');
  });
});
