import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';
import { runWithRequestContext } from '../lib/requestContext';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * An inbound id is only honoured if it looks like an id.
 *
 * The value ends up in log lines and in response bodies, so an unvalidated one is a log-injection
 * vector: newlines would let a caller forge extra log entries, and unbounded length would let them
 * flood the log. Anything that fails this is replaced rather than rejected — a malformed trace
 * header is not worth failing a request over.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Assigns every request an id, echoes it back, and makes it implicitly available to all logging for
 * the duration of the request (see `lib/requestContext.ts`).
 *
 * Mounted before the logger so the id is present on the very first line, and before the router so an
 * error thrown anywhere downstream can still report it. Honouring an inbound `X-Request-Id` is what
 * lets a trace span the proxy and the API instead of restarting at our edge.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
  const id = candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, id);
  runWithRequestContext({ requestId: id }, () => next());
};
