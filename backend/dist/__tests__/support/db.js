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
exports.disconnectTestDb = exports.clearTestDb = exports.connectTestDb = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
let mongod;
/**
 * Every integration test file follows the same lifecycle:
 *   beforeAll(connectTestDb)   — start an in-memory mongod and connect Mongoose once
 *   afterEach(clearTestDb)     — drop all collections so tests don't leak state into each other
 *   afterAll(disconnectTestDb) — disconnect and stop mongod
 */
const connectTestDb = () => __awaiter(void 0, void 0, void 0, function* () {
    mongod = yield mongodb_memory_server_1.MongoMemoryServer.create();
    yield mongoose_1.default.connect(mongod.getUri());
});
exports.connectTestDb = connectTestDb;
const clearTestDb = () => __awaiter(void 0, void 0, void 0, function* () {
    const { collections } = mongoose_1.default.connection;
    yield Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});
exports.clearTestDb = clearTestDb;
const disconnectTestDb = () => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose_1.default.disconnect();
    yield (mongod === null || mongod === void 0 ? void 0 : mongod.stop());
    mongod = undefined;
});
exports.disconnectTestDb = disconnectTestDb;
