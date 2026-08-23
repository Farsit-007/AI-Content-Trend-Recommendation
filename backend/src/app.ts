import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import config from './app/config';
import { logger } from './app/lib/logger';
import { pingRedis } from './app/lib/redis';
import { cacheStats } from './app/lib/cache';
import { globalRateLimiter } from './app/middleware/rateLimit';
import { notFound } from './app/middleware/notFound';
import { globalErrorHandler } from './app/middleware/globalErrorHandler';
import router from './app/routes';

const app: Application = express();

// Express 5 defaults to the `simple` query parser, which does NOT expand `?field[$op]=x` into a
// nested object. Pinned explicitly because QueryBuilder's safety depends on it: switching to
// `extended` would let bracket notation reach Mongo as query operators. QueryBuilder allowlists
// fields and accepts string values only, so it holds either way — but do not change this without
// reading builder/QueryBuilder.ts first.
app.set('query parser', 'simple');

// How many reverse proxies sit in front of us. Rate limiting is IP-keyed, so getting this wrong in
// either direction breaks it: too low and every user shares the proxy's bucket, too high and a
// client can spoof X-Forwarded-For for a fresh bucket per request. See config.trust_proxy_hops.
if (config.trust_proxy_hops > 0) {
  app.set('trust proxy', config.trust_proxy_hops);
}

// Trailing slashes in WEB_URL would silently break the CORS origin match — the
// browser's Origin header never has one — so normalize before comparing.
const normalizeOrigin = (url: string) => url.replace(/\/+$/, '');
const allowedOrigins = [
  ...new Set(
    [config.web_url, 'http://localhost:5173', 'http://localhost:3000']
      .filter((o): o is string => Boolean(o))
      .map(normalizeOrigin),
  ),
];

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/health' },
  }),
);

// Broad per-IP ceiling. Mounted on the API router only, so `/health` stays unlimited for uptime
// probes and the root liveness string keeps answering.
app.use('/api/v1', globalRateLimiter, router);

app.get('/', (_req: Request, res: Response) => {
  res.send(`Server is running.`);
});

// Liveness/readiness probe: reports Mongo + Redis status so uptime checks and the
// frontend can distinguish "API down" from "API up but a dependency is degraded".
app.get('/health', async (_req: Request, res: Response) => {
  const mongoUp = mongoose.connection.readyState === 1;
  let redisUp = false;
  try {
    await pingRedis();
    redisUp = true;
  } catch {
    redisUp = false;
  }

  const healthy = mongoUp && redisUp;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    mongo: mongoUp ? 'up' : 'down',
    redis: redisUp ? 'up' : 'down',
    uptime_seconds: Math.round(process.uptime()),
    // Per-domain cache hit rates. Reported here because a cache that never hits is invisible
    // otherwise — it looks exactly like a working one, just slower. Process-local, so these reset
    // on deploy and read low right after one.
    cache: cacheStats(),
  });
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
