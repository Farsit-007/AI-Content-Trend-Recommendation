// `jest.config.ts` maps the `ioredis` module to `ioredis-mock` for the whole suite, so
// `app/lib/redis.ts`'s `new Redis(...)` transparently gets an in-memory client — no test needs
// to mock this itself. This re-export just gives tests a typed handle on that same client
// if they ever need to assert against it directly (e.g. `redis.get(...)`).
export { redis } from '../../app/lib/redis';
