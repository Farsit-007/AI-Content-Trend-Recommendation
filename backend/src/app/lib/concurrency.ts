/**
 * Runs `fn` over `items` with at most `limit` in flight at once, preserving input order in the
 * result array. A small local queue rather than a dependency.
 *
 * Lives in `lib/` rather than beside either of its callers on purpose. It used to be exported from
 * `newsIngestion.contentFetch.ts` and imported by `newsIngestion.metaEnrichment.ts`, which meant any
 * test doing `jest.mock('.../newsIngestion.contentFetch')` silently replaced this helper with a
 * stub returning `undefined` — so `enrichMetadata` returned `undefined` and the pipeline handed
 * `undefined` to Layer 4, several steps away from the mock that caused it. Shared helpers with more
 * than one consumer don't belong in a module anyone mocks wholesale.
 */
export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  };

  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
};
