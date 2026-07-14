import { RawNewsItem } from '../newsIngestion.interface';

interface DevToArticle {
  id: number;
  title: string;
  url: string;
  description?: string;
  published_at?: string;
  public_reactions_count?: number;
  comments_count?: number;
}

export const fetchDevTo = async (): Promise<RawNewsItem[]> => {
  const res = await fetch('https://dev.to/api/articles?top=7');
  if (!res.ok) throw new Error(`Dev.to request failed: ${res.status}`);
  const articles = (await res.json()) as DevToArticle[];

  return articles.map((article) => ({
    source: 'devto',
    source_id: String(article.id),
    title: article.title,
    url: article.url,
    snippet: article.description,
    published_at: article.published_at ? new Date(article.published_at) : undefined,
    raw_points: article.public_reactions_count ?? 0,
    raw_comments: article.comments_count ?? 0,
    raw_stars_delta: 0,
  }));
};
