import { RawNewsItem } from '../newsIngestion.interface';
import { decodeEntities, stripHtml } from './htmlText';

const HOTTEST_URL = 'https://lobste.rs/hottest.json';
const SNIPPET_MAX_LENGTH = 500;

interface LobstersStory {
  short_id: string;
  title: string;
  url: string;
  comments_url: string;
  created_at: string;
  score: number;
  comment_count: number;
  description?: string;
  tags?: string[];
}

/** Prefers the real description; falls back to the story's tags as cheap extra relevance-filter signal. */
const buildSnippet = (story: LobstersStory): string | undefined => {
  if (story.description) {
    const text = decodeEntities(stripHtml(story.description)).slice(0, SNIPPET_MAX_LENGTH);
    return text || undefined;
  }
  if (story.tags && story.tags.length > 0) {
    return story.tags.join(' ');
  }
  return undefined;
};

export const fetchLobsters = async (): Promise<RawNewsItem[]> => {
  const res = await fetch(HOTTEST_URL, {
    headers: { 'User-Agent': 'GrowthStudioBot/1.0' },
  });
  if (!res.ok) throw new Error(`Lobsters request failed: ${res.status}`);

  const stories = (await res.json()) as LobstersStory[];

  return stories.map((story) => ({
    source: 'lobsters',
    source_id: story.short_id,
    title: story.title,
    url: story.url || story.comments_url,
    // Unconditional, not just the url fallback above — see design.md decision 3 of
    // news-source-link-and-thumbnail-fields.
    discussion_url: story.comments_url,
    snippet: buildSnippet(story),
    content: story.description ? decodeEntities(stripHtml(story.description)) : undefined,
    published_at: new Date(story.created_at),
    raw_points: story.score,
    raw_comments: story.comment_count,
    raw_stars_delta: 0,
  }));
};
