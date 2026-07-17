import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';
import { decodeEntities, stripHtml } from './htmlText';

const BASE_URL =
  'https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=25&filter=withbody';

interface StackExchangeQuestion {
  question_id: number;
  title: string;
  link: string;
  tags: string[];
  creation_date: number;
  score: number;
  answer_count: number;
  body?: string;
}

interface StackExchangeResponse {
  items?: StackExchangeQuestion[];
  backoff?: number;
  error_id?: number;
  error_message?: string;
}

export const fetchStackOverflow = async (): Promise<RawNewsItem[]> => {
  const { stackexchange_key } = config.news_ingestion;
  const url = stackexchange_key ? `${BASE_URL}&key=${stackexchange_key}` : BASE_URL;

  const res = await fetch(url);
  const body = (await res.json()) as StackExchangeResponse;

  if (!res.ok || !Array.isArray(body.items)) {
    throw new Error(`Stack Exchange request failed: ${body.error_message ?? res.status}`);
  }

  // At this pipeline's call volume (1 request/run) backoff should never fire; never sleep on it —
  // that would block this adapter's slot in the run's Promise.all for an unrelated reason.
  if (body.backoff) {
    logger.warn(`[NewsIngestion] Stack Exchange requested a backoff of ${body.backoff}s (not honored — call volume is far below quota)`);
  }

  return body.items.map((question) => ({
    source: 'stackoverflow',
    source_id: String(question.question_id),
    title: decodeEntities(question.title),
    url: question.link,
    snippet: question.tags.join(', '),
    content: question.body ? decodeEntities(stripHtml(question.body)) : undefined,
    published_at: new Date(question.creation_date * 1000),
    raw_points: question.score,
    raw_comments: question.answer_count,
    raw_stars_delta: 0,
  }));
};
