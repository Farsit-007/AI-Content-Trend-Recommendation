import { ChatContextItem } from './chat.interface';

/**
 * Context budgeting (Phase 2.3).
 *
 * Replaces a fixed item count. A count is only a proxy for size, and it drifts: the same "5 items"
 * costs 400 tokens when the corpus holds headlines and 4000 once ingestion starts storing full
 * article text, with nothing in the code changing to say so. A token budget is the thing actually
 * being spent, so it stays honest as the data grows.
 */

/**
 * Characters per token, used to size context without pulling in a tokenizer.
 *
 * 4 is the usual English figure; Bengali is far denser per character, so this **under**-counts
 * tokens for Bangla text. That direction is deliberate — a generous divisor would let a Bangla
 * context quietly exceed the budget, which is the failure that costs money. Being slightly stingy
 * with Bangla costs a little recall instead.
 */
const CHARS_PER_TOKEN = 3;

export const approxTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

export interface BudgetedContext {
  items: ChatContextItem[];
  approxTokens: number;
  /** Items dropped for want of budget. Logged, so a chronically truncated context is visible. */
  dropped: number;
}

/**
 * Fills the context in the order given — highest fused rank first — until the budget runs out.
 *
 * Two properties worth naming:
 *
 *  - **The first item always survives.** A single oversized item would otherwise produce an empty
 *    context and an answer of "I have nothing on that", which is a worse failure than being
 *    slightly over budget. It is truncated instead.
 *  - **A too-large item is skipped, not truncated, once something is already in.** Cutting an item
 *    mid-sentence hands the model a fragment it may quote as if it were complete.
 */
export const budgetContext = (items: ChatContextItem[], tokenBudget: number): BudgetedContext => {
  const kept: ChatContextItem[] = [];
  let used = 0;
  let dropped = 0;

  for (const item of items) {
    const cost = approxTokens(item.content);

    if (kept.length === 0 && cost > tokenBudget) {
      const maxChars = tokenBudget * CHARS_PER_TOKEN;
      kept.push({ ...item, content: `${item.content.slice(0, maxChars)}…` });
      used = tokenBudget;
      continue;
    }

    if (used + cost > tokenBudget) {
      dropped += 1;
      continue;
    }

    kept.push(item);
    used += cost;
  }

  return { items: kept, approxTokens: used, dropped };
};

/**
 * Drops context whose text the conversation has already carried.
 *
 * Retrieval is stateless, so a follow-up on the same topic re-retrieves the same items and pays for
 * them again — and re-sending a passage the model already has in history is pure duplication. The
 * check is on a normalized prefix rather than the whole string because the same news item can be
 * rendered with a slightly different score line between turns.
 */
export const dedupeAgainstHistory = (
  items: ChatContextItem[],
  historyContents: string[],
  prefixChars = 120,
): ChatContextItem[] => {
  const normalize = (text: string) =>
    text.replace(/\s+/g, ' ').trim().slice(0, prefixChars).toLowerCase();
  const seen = new Set(historyContents.map(normalize));
  return items.filter((item) => !seen.has(normalize(item.content)));
};
