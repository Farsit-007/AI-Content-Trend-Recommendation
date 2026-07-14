import { RawNewsItem } from '../newsIngestion.interface';

const HN_BASE = 'https://hacker-news.firebaseio.com/v0';
const TOP_STORY_COUNT = 30;

interface HNItem {
  id: number;
  type: string;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  time?: number;
}

export const fetchHackerNews = async (): Promise<RawNewsItem[]> => {
  const idsRes = await fetch(`${HN_BASE}/topstories.json`);
  if (!idsRes.ok) throw new Error(`HackerNews topstories request failed: ${idsRes.status}`);
  const ids = ((await idsRes.json()) as number[]).slice(0, TOP_STORY_COUNT);

  const items = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${HN_BASE}/item/${id}.json`);
      if (!res.ok) return null;
      return (await res.json()) as HNItem;
    }),
  );

  return items
    .filter((item): item is HNItem => item !== null && item.type === 'story' && !!item.title)
    .map((item) => ({
      source: 'hackernews',
      source_id: String(item.id),
      title: item.title as string,
      url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
      snippet: item.text,
      published_at: item.time ? new Date(item.time * 1000) : undefined,
      raw_points: item.score ?? 0,
      raw_comments: item.descendants ?? 0,
      raw_stars_delta: 0,
    }));
};
