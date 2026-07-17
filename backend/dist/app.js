"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const mongoose_1 = __importDefault(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const pino_http_1 = require("pino-http");
const config_1 = __importDefault(require("./app/config"));
const logger_1 = require("./app/lib/logger");
const redis_1 = require("./app/lib/redis");
const notFound_1 = require("./app/middleware/notFound");
const globalErrorHandler_1 = require("./app/middleware/globalErrorHandler");
const routes_1 = __importDefault(require("./app/routes"));
const app = (0, express_1.default)();
// Trailing slashes in WEB_URL would silently break the CORS origin match — the
// browser's Origin header never has one — so normalize before comparing.
const normalizeOrigin = (url) => url.replace(/\/+$/, '');
const allowedOrigins = [
    ...new Set([config_1.default.web_url, 'http://localhost:5173', 'http://localhost:3000']
        .filter((o) => Boolean(o))
        .map(normalizeOrigin)),
];
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, cookie_parser_1.default)());
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true,
}));
app.use((0, pino_http_1.pinoHttp)({
    logger: logger_1.logger,
    autoLogging: { ignore: (req) => req.url === '/health' },
}));
app.use('/api/v1', routes_1.default);
app.get('/', (_req, res) => {
    res.send(`Server is running.`);
});
// Liveness/readiness probe: reports Mongo + Redis status so uptime checks and the
// frontend can distinguish "API down" from "API up but a dependency is degraded".
app.get('/health', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const mongoUp = mongoose_1.default.connection.readyState === 1;
    let redisUp = false;
    try {
        yield (0, redis_1.pingRedis)();
        redisUp = true;
    }
    catch (_a) {
        redisUp = false;
    }
    const healthy = mongoUp && redisUp;
    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        mongo: mongoUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
        uptime_seconds: Math.round(process.uptime()),
    });
}));
app.use(globalErrorHandler_1.globalErrorHandler);
app.use(notFound_1.notFound);
exports.default = app;
