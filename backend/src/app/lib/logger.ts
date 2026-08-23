import pino from 'pino';
import { getRequestId } from './requestContext';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Single shared pino instance. Pretty-printed in development, raw JSON in
 * production (machine-parseable), silent in tests to keep jest output clean.
 */
export const logger = pino({
  level: isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
  /**
   * Stamps the current request's id onto every line, however deep in the call stack it was emitted.
   * A `mixin` rather than a child logger per request: nothing has to be threaded through service
   * signatures, so a log line five layers down is correlated without its author doing anything.
   * Outside a request (jobs, boot) there is no id and the field is simply absent.
   */
  mixin: () => {
    const requestId = getRequestId();
    return requestId ? { request_id: requestId } : {};
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
