import {
  buildMessages,
  buildSourceRefs,
} from '../app/modules/Chat/chat.prompt';
import { ChatContextItem } from '../app/modules/Chat/chat.interface';

/**
 * The prompt's *shape* is a cost contract, not just a formatting choice (Phase 2.2).
 *
 * A provider caches a prefix by hashing its exact bytes, so the saving survives only while the
 * stable blocks stay first, stay adjacent, and stay byte-identical across turns. None of that is
 * visible from reading a single request, which is why it is pinned here — a well-meaning edit that
 * folds the context back into the persona would look harmless and quietly restore full price on
 * every turn.
 */

const voice = { language: 'english' as const };

const contextItem = (
  overrides: Partial<ChatContextItem> = {},
): ChatContextItem => ({
  source: 'news_item',
  content: 'Title: Something happened',
  ...overrides,
});

describe('chat prompt — cacheable prefix', () => {
  it('puts the two stable blocks first, adjacent, and marks exactly those as cacheable', () => {
    const messages = buildMessages(
      'q',
      [contextItem()],
      [],
      voice,
      'subscribed',
    );

    expect(messages[0].role).toBe('system');
    expect(messages[0].cacheable).toBe(true);
    expect(messages[1].role).toBe('system');
    expect(messages[1].cacheable).toBe(true);
    // The final user turn carries this turn context and ends the prefix.
    const last = messages[messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.cacheable).toBeUndefined();
    expect(last.content).toContain('Title: Something happened');
    expect(last.content).toContain('Question: q');
  });

  it('keeps the cached prefix byte-identical as the conversation and its context change', () => {
    const first = buildMessages(
      'first question',
      [contextItem()],
      [],
      voice,
      'subscribed',
    );
    const second = buildMessages(
      'second question',
      [contextItem({ content: 'Title: Something else entirely' })],
      [
        {
          team_id: 't',
          conversation_id: 'c',
          role: 'user',
          content: 'first question',
          created_at: new Date(),
        },
        {
          team_id: 't',
          conversation_id: 'c',
          role: 'assistant',
          content: 'an answer',
          created_at: new Date(),
        },
      ],
      voice,
      'subscribed',
    );

    // This is the whole point: turn 2 re-reads blocks 0-1 from cache instead of paying for them.
    expect(second[0].content).toBe(first[0].content);
    expect(second[1].content).toBe(first[1].content);
    expect(second[second.length - 1].content).not.toBe(
      first[first.length - 1].content,
    );
  });

  it('grows the cacheable prefix with the conversation, which is what clears the 1024-token floor', () => {
    // The two static blocks are only ~250 tokens together — below every provider's minimum, so on
    // their own they cache nothing. Marking replayed history is what makes the prefix long enough
    // to qualify, and each turn extends the previous turn's entry rather than replacing it.
    const turn = (n: number) =>
      buildMessages(
        `question ${n}`,
        [contextItem()],
        Array.from({ length: n * 2 }, (_, i) => ({
          team_id: 't',
          conversation_id: 'c',
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `exchange ${i}`,
          created_at: new Date(),
        })),
        voice,
        'subscribed',
      );

    const second = turn(1);
    const third = turn(2);
    const prefixOf = (ms: ReturnType<typeof turn>) =>
      ms.filter((m) => m.cacheable).map((m) => m.content);

    expect(prefixOf(second).length).toBe(4);
    expect(prefixOf(third).length).toBe(6);
    // Turn 3's prefix starts with turn 2's verbatim — an extension, not an invalidation.
    expect(prefixOf(third).slice(0, 4)).toEqual(prefixOf(second));
  });

  it('does not let the retrieval tier leak into the cached prefix', () => {
    // The tier note lives in the context block. If it drifted into the persona, a team whose
    // answers alternate between tiers would never hit the cache.
    const subscribed = buildMessages(
      'q',
      [contextItem()],
      [],
      voice,
      'subscribed',
    );
    const none = buildMessages('q', [], [], voice, 'none');

    expect(none[0].content).toBe(subscribed[0].content);
    expect(none[1].content).toBe(subscribed[1].content);
    expect(none[none.length - 1].content).not.toBe(
      subscribed[subscribed.length - 1].content,
    );
  });

  it('keys the prefix on language, so a per-request override warms a second prefix rather than corrupting one', () => {
    const english = buildMessages(
      'q',
      [contextItem()],
      [],
      { language: 'english' },
      'subscribed',
    );
    const bangla = buildMessages(
      'q',
      [contextItem()],
      [],
      { language: 'bangla' },
      'subscribed',
    );

    expect(bangla[0].content).toBe(english[0].content);
    expect(bangla[1].content).not.toBe(english[1].content);
  });

  it("varies the team block with the team's custom instructions", () => {
    const plain = buildMessages('q', [], [], voice, 'none');
    const instructed = buildMessages(
      'q',
      [],
      [],
      { ...voice, custom_instructions: 'be terse' },
      'none',
    );

    expect(instructed[1].content).toContain('be terse');
    expect(instructed[0].content).toBe(plain[0].content);
  });
});

describe('chat prompt — grounding contract', () => {
  it('numbers context blocks from 1 and tags each with its source', () => {
    const messages = buildMessages(
      'q',
      [
        contextItem({ content: 'first' }),
        contextItem({ source: 'draft', content: 'second' }),
      ],
      [],
      voice,
      'subscribed',
    );

    expect(messages[messages.length - 1].content).toContain('[1] (news_item)');
    expect(messages[messages.length - 1].content).toContain('[2] (draft)');
  });

  it('refuses general knowledge when nothing was retrieved', () => {
    const messages = buildMessages('q', [], [], voice, 'none');
    expect(messages[messages.length - 1].content).toContain(
      'Do not answer from general knowledge',
    );
  });

  it('tells the model to disclose a widened search', () => {
    const messages = buildMessages(
      'q',
      [contextItem()],
      [],
      voice,
      'broadened',
    );
    expect(messages[messages.length - 1].content).toContain('widened');
  });

  it('emits citation targets numbered identically to the blocks the model sees', () => {
    const context = [
      contextItem({ ref_id: 'a', label: 'First' }),
      contextItem({ source: 'draft', ref_id: 'b', label: 'Second' }),
    ];

    expect(buildSourceRefs(context)).toEqual([
      { n: 1, source: 'news_item', ref_id: 'a', label: 'First' },
      { n: 2, source: 'draft', ref_id: 'b', label: 'Second' },
    ]);
  });
});
