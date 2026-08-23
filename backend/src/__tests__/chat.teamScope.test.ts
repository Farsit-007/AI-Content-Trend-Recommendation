jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { buildTeamCorpus } from '../app/modules/Chat/chat.corpus';
import { buildNewsScopeTiers } from '../app/modules/Chat/chat.retrieval';
import { resolveTeamChatContext } from '../app/modules/Chat/chat.teamContext';
import { ChatMessage } from '../app/modules/Chat/chat.model';
import { GeneratedContent } from '../app/modules/GeneratedContent/generatedContent.model';
import { NewsCategoryTaxonomy } from '../app/modules/NewsCategoryTaxonomy/newsCategoryTaxonomy.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { Team } from '../app/modules/Team/team.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import {
  addTeamMember,
  createAuthToken,
  createTestTeam,
  createTestUser,
  testEmbedding,
} from './support/fixtures';
import {
  getLastChatCompletionRequest,
  mockChatCompletion,
  mockEmbedding,
} from './support/openrouterMock';

/**
 * The acceptance gate for team-scoped chat.
 *
 * Before this, `fetchNewsContext(embedding)` took no team at all and searched every team's items,
 * so two teams asking the same question received byte-identical context. Access control was
 * correct; the knowledge was global. These tests assert on the **retrieved context and the outgoing
 * prompt**, not on the model's reply text — a reply that happens not to mention another team's data
 * is not evidence that the data was never in the prompt.
 *
 * Distinctive `ALPHA-` / `BRAVO-` marker strings make a leak unmistakable in a failure diff.
 */

const QUESTION = 'what have we written about quantum?';

let seq = 0;
const seedNewsItem = async (title: string, category: string) => {
  seq += 1;
  return NewsItem.create({
    source: 'hackernews',
    source_id: `scope-${seq}`,
    content_hash: `scope-hash-${seq}`,
    title,
    url: `https://example.test/scope-${seq}`,
    embedding: testEmbedding(),
    trend_score: 5,
    lifecycle: 'active',
    category,
    category_group: category,
  });
};

const seedDraft = async (teamId: string, topic: string, body: string) =>
  GeneratedContent.create({
    team_id: teamId,
    topic,
    formats: { facebook_post: body },
    source: 'manual',
    status: 'draft',
  });

const seedBrandVoice = async (teamId: string, content: string) =>
  BrandVoiceExample.create({
    team_id: teamId,
    platform: 'facebook',
    content,
    embedding: testEmbedding(),
  });

/** Every string in the corpus, flattened — content plus labels, so a leak cannot hide in a label. */
const corpusText = (context: { content: string; label?: string }[]): string =>
  context.map((item) => `${item.label ?? ''}\n${item.content}`).join('\n');

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('chat team scoping — news isolation', () => {
  it("returns none of another team's news items, even when both teams ask the same question", async () => {
    const owner = await createTestUser({ email: 'scope-owner@example.test' });
    const teamA = await createTestTeam({
      name: 'Alpha',
      createdBy: owner._id.toString(),
    });
    const teamB = await createTestTeam({
      name: 'Bravo',
      createdBy: owner._id.toString(),
    });
    await Team.findByIdAndUpdate(teamA._id, { subscribed_categories: ['AI'] });
    await Team.findByIdAndUpdate(teamB._id, {
      subscribed_categories: ['Security'],
    });

    await seedNewsItem('ALPHA-ONLY-STORY about quantum', 'AI');
    await seedNewsItem('BRAVO-ONLY-STORY about quantum', 'Security');

    const contextA = await resolveTeamChatContext(teamA._id.toString());
    const corpusA = await buildTeamCorpus(QUESTION, testEmbedding(), contextA);

    expect(corpusText(corpusA.context)).toContain('ALPHA-ONLY-STORY');
    expect(corpusText(corpusA.context)).not.toContain('BRAVO-ONLY-STORY');

    const contextB = await resolveTeamChatContext(teamB._id.toString());
    const corpusB = await buildTeamCorpus(QUESTION, testEmbedding(), contextB);

    expect(corpusText(corpusB.context)).toContain('BRAVO-ONLY-STORY');
    expect(corpusText(corpusB.context)).not.toContain('ALPHA-ONLY-STORY');
  });

  it('never reaches the global pool when the team has no matching items', async () => {
    const owner = await createTestUser({ email: 'scope-empty@example.test' });
    const team = await createTestTeam({
      name: 'Careerists',
      createdBy: owner._id.toString(),
    });
    await Team.findByIdAndUpdate(team._id, {
      subscribed_categories: ['Career'],
    });

    // Plenty of items exist — none of them in this team's categories.
    await seedNewsItem('ALPHA-ONLY-STORY about quantum', 'AI');
    await seedNewsItem('BRAVO-ONLY-STORY about quantum', 'Security');

    const corpus = await buildTeamCorpus(
      QUESTION,
      testEmbedding(),
      await resolveTeamChatContext(team._id.toString()),
    );

    expect(corpus.tier).toBe('none');
    expect(corpus.context.some((item) => item.source === 'news_item')).toBe(
      false,
    );
    expect(corpusText(corpus.context)).not.toContain('ALPHA-ONLY-STORY');
    expect(corpusText(corpus.context)).not.toContain('BRAVO-ONLY-STORY');
  });

  it('widens to the broad group before giving up, and says that it did', async () => {
    await NewsCategoryTaxonomy.create({
      name: 'LLM Tooling',
      normalized_key: 'llm tooling',
      broad_group: 'AI',
      source: 'ingestion',
    });

    const owner = await createTestUser({ email: 'scope-widen@example.test' });
    const team = await createTestTeam({
      name: 'Tooling',
      createdBy: owner._id.toString(),
    });
    await Team.findByIdAndUpdate(team._id, {
      subscribed_categories: ['LLM Tooling'],
    });

    // Categorized "AI", not "LLM Tooling" — tier 1 cannot match it, tier 2 can.
    await seedNewsItem('ALPHA-ONLY-STORY about quantum', 'AI');
    await seedNewsItem('BRAVO-ONLY-STORY about quantum', 'Security');

    const corpus = await buildTeamCorpus(
      QUESTION,
      testEmbedding(),
      await resolveTeamChatContext(team._id.toString()),
    );

    expect(corpus.tier).toBe('broadened');
    expect(corpusText(corpus.context)).toContain('ALPHA-ONLY-STORY');
    // Widening goes to the team's own broad groups — never to every group.
    expect(corpusText(corpus.context)).not.toContain('BRAVO-ONLY-STORY');
  });

  it('builds no widening tier for a team subscribed only to fixed-six categories', () => {
    // broad_group === name for the fixed six, so a second rung would repeat the first.
    const tiers = buildNewsScopeTiers({
      teamId: 't',
      teamName: 'T',
      subscribedCategories: ['AI'],
      broadGroups: ['AI'],
      language: 'english',
    });

    expect(tiers.map((t) => t.tier)).toEqual(['subscribed']);
  });

  it('builds no tier at all for a team with no subscriptions', () => {
    const tiers = buildNewsScopeTiers({
      teamId: 't',
      teamName: 'T',
      subscribedCategories: [],
      broadGroups: [],
      language: 'english',
    });

    expect(tiers).toEqual([]);
  });
});

describe('chat team scoping — drafts and brand voice', () => {
  it("never surfaces another team's drafts, even on an exactly matching question", async () => {
    const owner = await createTestUser({ email: 'scope-drafts@example.test' });
    const teamA = await createTestTeam({
      name: 'Alpha',
      createdBy: owner._id.toString(),
    });
    const teamB = await createTestTeam({
      name: 'Bravo',
      createdBy: owner._id.toString(),
    });
    await Team.findByIdAndUpdate(teamA._id, { subscribed_categories: ['AI'] });
    await Team.findByIdAndUpdate(teamB._id, { subscribed_categories: ['AI'] });

    // Both drafts contain "quantum", so both are lexically relevant to the question. Only scoping
    // keeps B's out of A's context.
    await seedDraft(
      teamA._id.toString(),
      'quantum ALPHA-DRAFT',
      'ALPHA-DRAFT-BODY about quantum',
    );
    await seedDraft(
      teamB._id.toString(),
      'quantum BRAVO-DRAFT',
      'BRAVO-DRAFT-BODY about quantum',
    );

    const corpus = await buildTeamCorpus(
      QUESTION,
      testEmbedding(),
      await resolveTeamChatContext(teamA._id.toString()),
    );

    expect(corpusText(corpus.context)).toContain('ALPHA-DRAFT');
    expect(corpusText(corpus.context)).not.toContain('BRAVO-DRAFT');
  });

  it("never surfaces another team's brand-voice examples", async () => {
    const owner = await createTestUser({ email: 'scope-voice@example.test' });
    const teamA = await createTestTeam({
      name: 'Alpha',
      createdBy: owner._id.toString(),
    });
    const teamB = await createTestTeam({
      name: 'Bravo',
      createdBy: owner._id.toString(),
    });
    await Team.findByIdAndUpdate(teamA._id, { subscribed_categories: ['AI'] });

    await seedBrandVoice(teamA._id.toString(), 'ALPHA-VOICE-EXAMPLE');
    await seedBrandVoice(teamB._id.toString(), 'BRAVO-VOICE-EXAMPLE');

    const corpus = await buildTeamCorpus(
      QUESTION,
      testEmbedding(),
      await resolveTeamChatContext(teamA._id.toString()),
    );

    expect(corpusText(corpus.context)).toContain('ALPHA-VOICE-EXAMPLE');
    expect(corpusText(corpus.context)).not.toContain('BRAVO-VOICE-EXAMPLE');
  });

  it("reports the asking team's own profile, not another team's", async () => {
    const owner = await createTestUser({ email: 'scope-profile@example.test' });
    const teamA = await createTestTeam({
      name: 'Alpha Team',
      createdBy: owner._id.toString(),
    });
    const teamB = await createTestTeam({
      name: 'Bravo Team',
      createdBy: owner._id.toString(),
    });
    await Team.findByIdAndUpdate(teamA._id, { subscribed_categories: ['AI'] });
    await Team.findByIdAndUpdate(teamB._id, {
      subscribed_categories: ['Security'],
    });

    const corpus = await buildTeamCorpus(
      QUESTION,
      testEmbedding(),
      await resolveTeamChatContext(teamA._id.toString()),
    );
    const profile = corpus.context.find(
      (item) => item.source === 'team_profile',
    );

    expect(profile).toBeDefined();
    expect(profile?.content).toContain('Alpha Team');
    expect(profile?.content).toContain('AI');
    expect(profile?.content).not.toContain('Bravo Team');
    expect(profile?.content).not.toContain('Security');
  });
});

describe('chat team scoping — what actually reaches the model', () => {
  /** Readiness gate: a team needs a subscription and a brand-voice example before chat retrieves. */
  const makeReady = async (teamId: string, category: string, voice: string) => {
    await Team.findByIdAndUpdate(teamId, { subscribed_categories: [category] });
    await seedBrandVoice(teamId, voice);
  };

  it("a super_admin asking on a team's behalf gets that team's scope, not the global pool", async () => {
    // The requester is a platform super_admin and a member of no team — `assertTeamAccess` lets
    // them through. The scope must still come from `team_id`, never from "can see everything".
    const superAdmin = await createTestUser({
      role: 'super_admin',
      email: 'scope-super@example.test',
    });
    const owner = await createTestUser({
      email: 'scope-super-owner@example.test',
    });
    const teamA = await createTestTeam({
      name: 'Alpha',
      createdBy: owner._id.toString(),
    });
    const teamB = await createTestTeam({
      name: 'Bravo',
      createdBy: owner._id.toString(),
    });
    await makeReady(teamA._id.toString(), 'AI', 'ALPHA-VOICE-EXAMPLE');
    await makeReady(teamB._id.toString(), 'Security', 'BRAVO-VOICE-EXAMPLE');

    await seedNewsItem('ALPHA-ONLY-STORY about quantum', 'AI');
    await seedNewsItem('BRAVO-ONLY-STORY about quantum', 'Security');

    mockEmbedding();
    mockChatCompletion('Here is what your feed says. [1]');

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${createAuthToken(superAdmin)}`)
      .send({ team_id: teamA._id.toString(), message: QUESTION });

    expect(res.status).toBe(200);

    const prompt = getLastChatCompletionRequest()
      .messages.map((m) => m.content)
      .join('\n');
    expect(prompt).toContain('ALPHA-ONLY-STORY');
    expect(prompt).not.toContain('BRAVO-ONLY-STORY');
    expect(prompt).not.toContain('BRAVO-VOICE-EXAMPLE');
  });

  it('sends the scope tier and citation targets back to the client', async () => {
    const user = await createTestUser({ email: 'scope-sources@example.test' });
    const team = await createTestTeam({
      name: 'Alpha',
      createdBy: user._id.toString(),
    });
    await addTeamMember(team._id.toString(), user._id.toString());
    await makeReady(team._id.toString(), 'AI', 'ALPHA-VOICE-EXAMPLE');
    await seedNewsItem('ALPHA-ONLY-STORY about quantum', 'AI');

    mockEmbedding();
    mockChatCompletion('Grounded answer. [1]');

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${createAuthToken(user)}`)
      .send({ team_id: team._id.toString(), message: QUESTION });

    expect(res.status).toBe(200);
    expect(res.body.data.context_tier).toBe('subscribed');
    // Numbering starts at 1 and matches the order the prompt presented the blocks in.
    expect(res.body.data.sources[0]).toMatchObject({
      n: 1,
      source: 'team_profile',
    });
    expect(
      res.body.data.sources.map((s: { source: string }) => s.source),
    ).toContain('news_item');
  });

  it('instructs the model to refuse rather than answer from general knowledge when nothing matches', async () => {
    const user = await createTestUser({ email: 'scope-refuse@example.test' });
    const team = await createTestTeam({
      name: 'Careerists',
      createdBy: user._id.toString(),
    });
    await addTeamMember(team._id.toString(), user._id.toString());
    await makeReady(team._id.toString(), 'Career', 'ALPHA-VOICE-EXAMPLE');
    await seedNewsItem('BRAVO-ONLY-STORY about quantum', 'Security');

    mockEmbedding();
    mockChatCompletion("I don't have anything on that in your feed.");

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${createAuthToken(user)}`)
      .send({ team_id: team._id.toString(), message: QUESTION });

    expect(res.status).toBe(200);
    expect(res.body.data.context_tier).toBe('none');

    const prompt = getLastChatCompletionRequest()
      .messages.map((m) => m.content)
      .join('\n');
    expect(prompt).toContain('Do not answer from general knowledge');
    expect(prompt).not.toContain('BRAVO-ONLY-STORY');
  });

  it("does not leak another team's conversation history", async () => {
    const user = await createTestUser({ email: 'scope-history@example.test' });
    const teamA = await createTestTeam({
      name: 'Alpha',
      createdBy: user._id.toString(),
    });
    const teamB = await createTestTeam({
      name: 'Bravo',
      createdBy: user._id.toString(),
    });
    await addTeamMember(teamA._id.toString(), user._id.toString());
    await ChatMessage.create({
      team_id: teamB._id.toString(),
      conversation_id: 'shared-conversation-id',
      role: 'user',
      content: 'BRAVO-SECRET-QUESTION',
    });

    const res = await request(app)
      .get('/api/v1/chat/conversations/shared-conversation-id')
      .query({ team_id: teamA._id.toString() })
      .set('Authorization', `Bearer ${createAuthToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
