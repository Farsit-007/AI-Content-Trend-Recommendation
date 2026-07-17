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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaintenanceRunService = void 0;
const maintenanceRun_model_1 = require("./maintenanceRun.model");
const MAX_LIMIT = 100;
const listRuns = (limit, job) => __awaiter(void 0, void 0, void 0, function* () {
    const bounded = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const filter = job ? { job } : {};
    return maintenanceRun_model_1.MaintenanceRun.find(filter).sort({ started_at: -1 }).limit(bounded);
});
exports.MaintenanceRunService = {
    listRuns,
};
