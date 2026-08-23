import { LlmProviderType, LlmTask } from '../LlmProvider/llmProvider.interface';

/** Which provider call shape produced this row — the same task can be served by more than one. */
export type LlmUsageOperation = 'chat' | 'stream' | 'embed' | 'embed_batch';

/** Which resolution tier served the call, mirroring `ResolvedModel.source`. */
export type LlmUsageTier = 'request' | 'team' | 'global' | 'bootstrap';

/**
 * One provider call.
 *
 * Rows are written after the call completes and never on its critical path — a metering failure
 * must not fail a user's request. Kept as raw events *and* rolled up daily
 * (`ILlmUsageDaily`) because the two answer different questions: an event row explains one slow or
 * expensive request, the rollup answers "what did this team spend this month" without scanning.
 */
export interface ILlmUsageEvent {
  /** Null for calls with no team behind them — ingestion, categorization, scheduled jobs. */
  team_id: string | null;
  task: LlmTask;
  operation: LlmUsageOperation;
  tier: LlmUsageTier;
  provider_type: LlmProviderType;
  /** The literal model string sent to the provider, e.g. `openai/gpt-4o-mini`. */
  model: string;
  /** `LlmProviderKey._id`, absent at the bootstrap tier. Lets spend be attributed to one credential. */
  key_id?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_prompt_tokens?: number;
  /**
   * Only present when the resolved `LlmModel` carries pricing *and* the provider reported usage.
   * Absent means "not priced", never "free" — see `usage_reported`.
   */
  estimated_cost_usd?: number;
  duration_ms: number;
  /**
   * False when the provider returned no usage payload. The call still happened and was still
   * billed; we just do not know how large it was. Recording this explicitly is what keeps a
   * rollup's zeros honest — otherwise unreported calls are indistinguishable from free ones.
   */
  usage_reported: boolean;
  created_at: Date;
}

/** Pre-aggregated per team, per UTC day, per task, per model. */
export interface ILlmUsageDaily {
  team_id: string | null;
  /** UTC `YYYY-MM-DD`. A string, not a Date, so the bucket key cannot drift with server timezone. */
  date: string;
  task: LlmTask;
  model: string;
  calls: number;
  /** Subset of `calls` where the provider reported no usage — the rollup's confidence marker. */
  calls_without_usage: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_prompt_tokens: number;
  estimated_cost_usd: number;
  updated_at: Date;
}
