"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
// `jest.config.ts` maps the `ioredis` module to `ioredis-mock` for the whole suite, so
// `app/lib/redis.ts`'s `new Redis(...)` transparently gets an in-memory client — no test needs
// to mock this itself. This re-export just gives tests a typed handle on that same client
// if they ever need to assert against it directly (e.g. `redis.get(...)`).
var redis_1 = require("../../app/lib/redis");
Object.defineProperty(exports, "redis", { enumerable: true, get: function () { return redis_1.redis; } });
