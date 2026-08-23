import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context, carried implicitly through async code.
 *
 * The alternative was threading `req.log` (or a request id) through every service and helper
 * signature. That is a far larger and riskier diff for the same guarantee, and it decays: the first
 * function someone adds without the parameter silently loses correlation. `AsyncLocalStorage`
 * survives `await` boundaries, so a log line emitted five layers deep still knows which request it
 * belongs to without anyone having passed it anything.
 *
 * Reads outside a request — scheduled jobs, boot code — get `undefined`, which is correct: there is
 * no request to correlate to.
 */
export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

export const getRequestId = (): string | undefined => storage.getStore()?.requestId;
