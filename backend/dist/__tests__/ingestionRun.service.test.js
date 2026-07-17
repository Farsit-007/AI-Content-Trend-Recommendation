"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ingestionRun_service_1 = require("../app/modules/IngestionRun/ingestionRun.service");
const run = (overrides) => (Object.assign({ started_at: new Date(), finished_at: new Date(), duration_ms: 1000, trigger: 'cron', total_stored: 0 }, overrides));
const sourceCount = (source, fetched) => ({
    source,
    fetched,
    fresh_dropped: 0,
    hash_deduped: 0,
    semantic_deduped: 0,
    relevance_dropped: 0,
    stored: 0,
});
describe('computeZeroStreaks', () => {
    it('flags a source with 3 consecutive zero-fetch runs as alert: true', () => {
        // Newest-first, as listRuns returns them.
        const runs = [
            run({ sources: [sourceCount('reddit', 0)] }),
            run({ sources: [sourceCount('reddit', 0)] }),
            run({ sources: [sourceCount('reddit', 0)] }),
        ];
        const health = (0, ingestionRun_service_1.computeZeroStreaks)(runs);
        expect(health).toEqual([{ source: 'reddit', zero_streak: 3, alert: true }]);
    });
    it('breaks the streak at the first non-zero run walking backward from newest', () => {
        const runs = [
            run({ sources: [sourceCount('reddit', 0)] }),
            run({ sources: [sourceCount('reddit', 0)] }),
            run({ sources: [sourceCount('reddit', 5)] }), // older, non-zero — streak stops here
            run({ sources: [sourceCount('reddit', 0)] }),
        ];
        const health = (0, ingestionRun_service_1.computeZeroStreaks)(runs);
        expect(health).toEqual([{ source: 'reddit', zero_streak: 2, alert: false }]);
    });
    it('does not alert below the threshold of 3', () => {
        const runs = [run({ sources: [sourceCount('reddit', 0)] }), run({ sources: [sourceCount('reddit', 0)] })];
        const health = (0, ingestionRun_service_1.computeZeroStreaks)(runs);
        expect(health).toEqual([{ source: 'reddit', zero_streak: 2, alert: false }]);
    });
    it('treats a source missing from a run as fetched: 0 for that run', () => {
        const runs = [
            run({ sources: [] }), // reddit wasn't even attempted this run
            run({ sources: [sourceCount('reddit', 0)] }),
            run({ sources: [sourceCount('reddit', 0)] }),
        ];
        const health = (0, ingestionRun_service_1.computeZeroStreaks)(runs);
        expect(health).toEqual([{ source: 'reddit', zero_streak: 3, alert: true }]);
    });
    it('resets to zero_streak: 0 immediately after recovery', () => {
        const runs = [
            run({ sources: [sourceCount('reddit', 12)] }),
            run({ sources: [sourceCount('reddit', 0)] }),
            run({ sources: [sourceCount('reddit', 0)] }),
        ];
        const health = (0, ingestionRun_service_1.computeZeroStreaks)(runs);
        expect(health).toEqual([{ source: 'reddit', zero_streak: 0, alert: false }]);
    });
});
