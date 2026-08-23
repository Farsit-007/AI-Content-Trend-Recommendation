import { apiGet } from './client';

/** One grouped slice of the usage rollup — keyed by task name, or by UTC day. */
export interface UsageBucket {
  key: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_prompt_tokens: number;
  estimated_cost_usd: number;
}

export interface UsageSummary {
  totals: {
    calls: number;
    /**
     * Calls the provider reported no token counts for. Their tokens are unknown, not zero — when
     * this is non-zero the totals are a floor, and the UI says so rather than implying precision.
     */
    calls_without_usage: number;
    prompt_tokens: number;
    completion_tokens: number;
    /** Portion of `prompt_tokens` served from the provider's prompt cache, where reported. */
    cached_prompt_tokens: number;
    /**
     * Summed only over models that have pricing configured. An unpriced model contributes 0 — that
     * is "unpriced", not "free", which is why the page shows how many calls went unpriced.
     */
    estimated_cost_usd: number;
  };
  by_task: UsageBucket[];
  by_day: UsageBucket[];
}

export interface UsageQuery {
  /** Super admins only may name a team they are not a member of; omitted resolves to your own. */
  team_id?: string;
  /** Inclusive UTC `YYYY-MM-DD` bounds. Defaults to the last 30 days. */
  from?: string;
  to?: string;
}

/** GET /llm-usage — token and cost totals, read from the pre-aggregated daily rollup. */
export function getUsageSummary(params: UsageQuery = {}): Promise<UsageSummary> {
  return apiGet<UsageSummary>('/llm-usage', { params });
}
