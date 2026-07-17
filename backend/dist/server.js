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
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("./app/config"));
const app_1 = __importDefault(require("./app"));
const logger_1 = require("./app/lib/logger");
const redis_1 = require("./app/lib/redis");
const verifyConnections_1 = require("./app/lib/verifyConnections");
const seedSuperAdmin_1 = require("./app/lib/seedSuperAdmin");
const scheduler_1 = require("./app/lib/scheduler");
// Node's default resolver can fail `mongodb+srv://` SRV/TXT lookups on networks where the
// router doesn't proxy those record types correctly, even though the OS resolver handles them
// fine. Forcing a public resolver avoids that failure mode.
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        timer.unref();
    }),
]);
// logger uses an async (worker-thread) pretty-print transport in development, so a
// bare process.exit() right after logger.fatal()/logger.info() can terminate the
// process before that last line is actually written — flush first so fatal errors
// and shutdown reasons are never silently lost from `docker logs`.
const exitAfterFlush = (code) => {
    logger_1.logger.flush(() => process.exit(code));
    setTimeout(() => process.exit(code), 2000).unref();
};
let server;
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield mongoose_1.default.connect(config_1.default.database_url);
            yield (0, seedSuperAdmin_1.seedSuperAdminIfMissing)();
            try {
                // Bounded independently of any per-call SDK timeout — verifyConnections is a
                // diagnostic check (failure here is already non-fatal), so it must never be able
                // to delay app.listen() below, no matter how long an external API call hangs.
                yield withTimeout((0, verifyConnections_1.verifyConnections)(), 25000, 'verifyConnections');
            }
            catch (verifyError) {
                logger_1.logger.warn({ err: verifyError }, 'Connection verification failed, but continuing startup');
            }
            (0, scheduler_1.startNewsIngestionScheduler)();
            (0, scheduler_1.startAnalyticsScheduler)();
            (0, scheduler_1.startAutoGenerationScheduler)();
            server = app_1.default.listen(config_1.default.port, () => {
                logger_1.logger.info(`Server is running on port ${config_1.default.port}`);
            });
        }
        catch (error) {
            logger_1.logger.fatal({ err: error }, 'Startup failed');
            exitAfterFlush(1);
        }
    });
}
main();
// Stop accepting new requests, then close DB/Redis handles so in-flight work can finish.
const gracefulShutdown = (signal) => {
    logger_1.logger.info(`${signal} received — shutting down gracefully...`);
    const closeConnections = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield mongoose_1.default.connection.close();
            redis_1.redis.disconnect();
        }
        finally {
            exitAfterFlush(0);
        }
    });
    if (server) {
        server.close(closeConnections);
        // Fallback if a stuck connection keeps the server from closing.
        setTimeout(() => exitAfterFlush(1), 10000).unref();
    }
    else {
        void closeConnections();
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    logger_1.logger.fatal({ err: reason }, 'unhandledRejection detected, shutting down...');
    exitAfterFlush(1);
});
process.on('uncaughtException', (err) => {
    logger_1.logger.fatal({ err }, 'uncaughtException detected, shutting down...');
    exitAfterFlush(1);
});
