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
exports.pingRedis = exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = __importDefault(require("../config"));
const logger_1 = require("./logger");
exports.redis = new ioredis_1.default(config_1.default.redis_url, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
});
exports.redis.on('error', (err) => {
    logger_1.logger.error({ err: err.message }, 'Redis client error');
});
const pingRedis = () => __awaiter(void 0, void 0, void 0, function* () {
    const reply = yield exports.redis.ping();
    if (reply !== 'PONG') {
        throw new Error(`Unexpected Redis PING reply: ${reply}`);
    }
});
exports.pingRedis = pingRedis;
