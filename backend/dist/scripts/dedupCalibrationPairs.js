"use strict";
/**
 * Hand-labeled dedup calibration pairs + the final-form adjudication prompt.
 *
 * These fixtures are the single source of truth for the two-band dedup work:
 *  - `verifySemanticDedupLive.ts --calibrate` embeds every pair with the real embedding model
 *    to measure per-class cosine distributions and propose the hard-duplicate ceiling.
 *  - `verifySemanticDedupLive.ts --judge` runs `ADJUDICATION_SYSTEM_PROMPT` over the gray-band
 *    pairs to measure per-class verdict accuracy.
 *  - Change D2's adjudicator imports `ADJUDICATION_SYSTEM_PROMPT` verbatim, and its unit tests
 *    import `CALIBRATION_PAIRS`, so the prompt is measured before it ships and regression-tested
 *    after.
 *
 * Pairs are checked in, not generated: LLM-generated pairs would test the judge against its own
 * output distribution. Each pair is written A = OLDER, B = NEWER so the update semantics
 * (B carries the material development) line up with the prompt's ordering.
 *
 * Re-run `--calibrate` whenever EMBEDDING_MODEL changes — the ceiling is derived from these pairs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADJUDICATION_SYSTEM_PROMPT = exports.CALIBRATION_PAIRS = void 0;
exports.CALIBRATION_PAIRS = [
    // ── True duplicates (~10): paraphrase / cross-post / syndication ──────────────────────────
    {
        a: {
            title: 'OpenAI releases GPT-5.5 with major reasoning improvements',
            snippet: 'The new model shows significant gains on math and coding benchmarks compared to its predecessor.',
        },
        b: {
            title: 'GPT-5.5 launches from OpenAI, bringing big reasoning upgrades',
            snippet: 'OpenAI just shipped an updated model with large improvements to math and coding benchmark performance.',
        },
        label: 'duplicate',
        klass: 'paraphrase',
    },
    {
        a: {
            title: 'Fable AI writing assistant launches to the public',
            snippet: 'The startup opened general access to Fable today after a limited beta, letting anyone draft long-form fiction with the model.',
        },
        b: {
            title: 'Fable opens up: AI fiction assistant now available to everyone',
            snippet: 'After months in closed beta, Fable is now generally available and anyone can use it to write long-form stories.',
        },
        label: 'duplicate',
        klass: 'paraphrase',
    },
    {
        a: {
            title: 'Rust 1.84 stabilizes async closures',
            snippet: 'The latest Rust release finally lets you write async closures without workarounds.',
        },
        b: {
            title: 'Async closures land in stable Rust with the 1.84 release',
            snippet: 'Rust 1.84 is out and its headline feature is stable support for async closures.',
        },
        label: 'duplicate',
        klass: 'cross-post',
    },
    {
        a: {
            title: 'GitHub Copilot now free for all students',
            snippet: 'GitHub announced that verified students get Copilot at no cost starting today.',
        },
        b: {
            title: 'Students can now use GitHub Copilot for free',
            snippet: 'Verified student accounts get free access to GitHub Copilot as of today.',
        },
        label: 'duplicate',
        klass: 'paraphrase',
    },
    {
        a: {
            title: 'Cloudflare launches a new AI inference product at the edge',
            snippet: 'Cloudflare Workers AI lets developers run model inference close to users across its global network.',
        },
        b: {
            title: 'Cloudflare unveils edge AI inference for Workers',
            snippet: 'A new Cloudflare offering runs AI model inference at the edge inside its Workers platform, close to end users.',
        },
        label: 'duplicate',
        klass: 'syndication',
    },
    {
        a: {
            title: 'Postgres 17 released with faster vacuum and better JSON',
            snippet: 'PostgreSQL 17 is out, featuring big vacuum performance work and improved JSON handling.',
        },
        b: {
            title: 'PostgreSQL 17 ships: vacuum speedups and JSON improvements',
            snippet: 'The Postgres team released version 17, headlined by vacuum performance gains and better JSON support.',
        },
        label: 'duplicate',
        klass: 'cross-post',
    },
    {
        a: {
            title: 'Apple announces M5 chip for the new MacBook Pro',
            snippet: 'The M5 delivers double-digit CPU and GPU gains over the M4, Apple says.',
        },
        b: {
            title: 'Apple debuts M5 silicon in refreshed MacBook Pro line',
            snippet: 'Apple introduced the M5, claiming meaningful CPU and GPU improvements over last year\'s M4.',
        },
        label: 'duplicate',
        klass: 'paraphrase',
    },
    {
        a: {
            title: 'Vercel raises $250M Series F',
            snippet: 'The frontend cloud company closed a $250 million round to expand its AI tooling.',
        },
        b: {
            title: 'Vercel closes $250 million Series F funding',
            snippet: 'Vercel announced a $250M Series F it will use to build out AI developer tools.',
        },
        label: 'duplicate',
        klass: 'syndication',
    },
    {
        a: {
            title: 'Deno 2.0 is here with full npm compatibility',
            snippet: 'The Deno runtime hit 2.0, adding complete npm package compatibility and a stabilized API.',
        },
        b: {
            title: 'Deno 2.0 released: npm compatibility and stable APIs',
            snippet: 'Deno 2.0 shipped today with full npm interop and a stabilized standard library.',
        },
        label: 'duplicate',
        klass: 'cross-post',
    },
    {
        a: {
            title: 'Anthropic launches Claude for the enterprise',
            snippet: 'Anthropic introduced an enterprise tier of Claude with expanded context and admin controls.',
        },
        b: {
            title: 'Claude Enterprise announced by Anthropic',
            snippet: 'Anthropic unveiled Claude Enterprise, adding a larger context window and organization admin tooling.',
        },
        label: 'duplicate',
        klass: 'paraphrase',
    },
    // ── Progressive updates (~15): status reversal, version release, metric update, follow-up ──
    //
    // The reported failure mode is a NEAR-IDENTICAL-SURFACE update: B keeps A's headline scaffold
    // and snippet almost verbatim, changing only the material development. These are the pairs that
    // clear the 0.88 floor and are wrongly dropped today — so they must land in the gray band and
    // exercise the judge. Written as minimal edits of their predecessor on purpose.
    {
        a: {
            title: 'Fable AI writing assistant is now available to the public',
            snippet: 'The startup opened general access to Fable today, letting anyone use the model to draft long-form fiction.',
        },
        b: {
            title: 'Fable AI writing assistant has been banned from public access',
            snippet: 'Regulators pulled general access to Fable today, blocking anyone from using the model to draft long-form fiction.',
        },
        label: 'update',
        klass: 'status-reversal',
    },
    {
        a: {
            title: 'Fable AI writing assistant has been banned from public access',
            snippet: 'Regulators pulled general access to Fable today, blocking anyone from using the model to draft long-form fiction.',
        },
        b: {
            title: 'Fable AI writing assistant is available to the public again',
            snippet: 'Regulators restored general access to Fable today, letting anyone once more use the model to draft long-form fiction.',
        },
        label: 'update',
        klass: 'status-reversal',
    },
    {
        a: {
            title: 'The npm package left-pad-2 is trending for string padding',
            snippet: 'The left-pad-2 utility package is climbing the npm charts today as thousands of projects adopt it for simple string padding.',
        },
        b: {
            title: 'The npm package left-pad-2 was pulled after a maintainer dispute',
            snippet: 'The left-pad-2 utility package was unpublished from npm today amid a maintainer dispute, breaking the thousands of projects that adopted it for string padding.',
        },
        label: 'update',
        klass: 'status-reversal',
    },
    {
        a: {
            title: 'Node.js 22 enters the current release line',
            snippet: 'Node.js 22 became the current release today, shipping a stable watch mode and an updated V8 engine.',
        },
        b: {
            title: 'Node.js 22 enters the Active LTS release line',
            snippet: 'Node.js 22 moved to Active LTS today, becoming the recommended production version with its stable watch mode and updated V8 engine.',
        },
        label: 'update',
        klass: 'version-release',
    },
    {
        a: {
            title: 'React 19 is available as a release candidate with the new compiler',
            snippet: 'The React team published React 19 as a release candidate today, featuring the new compiler and Actions.',
        },
        b: {
            title: 'React 19 is available as a stable release with the new compiler',
            snippet: 'The React team published React 19 as a stable release today, graduating the new compiler and Actions out of RC.',
        },
        label: 'update',
        klass: 'version-release',
    },
    {
        a: {
            title: 'Bun 1.1 beta adds experimental Windows support',
            snippet: 'The Bun 1.1 beta shipped today with experimental Windows builds of the runtime.',
        },
        b: {
            title: 'Bun 1.1 release adds stable Windows support',
            snippet: 'The Bun 1.1 release shipped today with stable, production-ready Windows builds of the runtime.',
        },
        label: 'update',
        klass: 'version-release',
    },
    {
        a: {
            title: 'Startup Acme raises $10M seed round',
            snippet: 'Acme closed a $10 million seed to build its developer analytics platform.',
        },
        b: {
            title: 'Acme raises $60M Series B six months after seed',
            snippet: 'Acme announced a $60 million Series B today, a rapid follow-on to its seed round, as its analytics product hits 5,000 teams.',
        },
        label: 'update',
        klass: 'metric-update',
    },
    {
        a: {
            title: 'New open-source model TinyLlama-3 hits 100k downloads',
            snippet: 'The compact TinyLlama-3 model crossed 100,000 downloads on Hugging Face in its first week.',
        },
        b: {
            title: 'TinyLlama-3 passes 1 million downloads and adds quantized builds',
            snippet: 'TinyLlama-3 has now surpassed one million downloads and shipped 4-bit quantized builds for edge devices.',
        },
        label: 'update',
        klass: 'metric-update',
    },
    {
        a: {
            title: 'Datacenter outage takes down major cloud region',
            snippet: 'A large cloud provider is investigating an outage affecting its primary US-East region.',
        },
        b: {
            title: 'Cloud region outage resolved after four hours; root cause was a config push',
            snippet: 'The provider restored its US-East region after four hours and attributed the outage to a bad network configuration change.',
        },
        label: 'update',
        klass: 'follow-up',
    },
    {
        a: {
            title: 'Security researchers disclose critical OpenSSL vulnerability',
            snippet: 'A high-severity flaw in OpenSSL was disclosed today, with a patch expected shortly.',
        },
        b: {
            title: 'OpenSSL ships patch for critical vulnerability; exploitation seen in the wild',
            snippet: 'OpenSSL released a fix for the critical flaw disclosed earlier this week, and researchers now report active exploitation.',
        },
        label: 'update',
        klass: 'follow-up',
    },
    {
        a: {
            title: 'Framework X will drop CommonJS support in its next major version',
            snippet: 'The maintainers of Framework X said today they intend to go ESM-only in the next major version, dropping CommonJS builds.',
        },
        b: {
            title: 'Framework X will keep CommonJS support in its next major version',
            snippet: 'The maintainers of Framework X said today they will keep shipping CommonJS builds in the next major version, reversing the earlier ESM-only plan.',
        },
        label: 'update',
        klass: 'status-reversal',
    },
    {
        a: {
            title: 'Tech giant announces 5% workforce reduction',
            snippet: 'The company said it would cut about 5% of staff to refocus on AI.',
        },
        b: {
            title: 'Tech giant expands layoffs to 12% of workforce',
            snippet: 'The company deepened its earlier cuts today, now reducing headcount by 12% as it doubles down on AI investment.',
        },
        label: 'update',
        klass: 'metric-update',
    },
    {
        a: {
            title: 'EU proposes new AI transparency rules',
            snippet: 'European lawmakers introduced a draft requiring disclosure of AI-generated content.',
        },
        b: {
            title: 'EU AI transparency rules pass into law',
            snippet: 'The European parliament voted the AI transparency proposal into law today, with enforcement beginning next year.',
        },
        label: 'update',
        klass: 'follow-up',
    },
    {
        a: {
            title: 'Kubernetes 1.31 alpha adds in-place pod resizing',
            snippet: 'An alpha feature in Kubernetes 1.31 lets you resize pod resources without a restart.',
        },
        b: {
            title: 'Kubernetes 1.31 released; in-place pod resizing reaches beta',
            snippet: 'Kubernetes 1.31 is generally available, promoting in-place pod resource resizing to beta and enabling it by default.',
        },
        label: 'update',
        klass: 'version-release',
    },
    {
        a: {
            title: 'Popular database project considers relicensing to source-available',
            snippet: 'The project\'s maintainers floated moving off the open-source license to a source-available one.',
        },
        b: {
            title: 'Database project completes relicense; community forks it',
            snippet: 'The project finalized its move to a source-available license, and the community launched an open-source fork the same day.',
        },
        label: 'update',
        klass: 'follow-up',
    },
    // ── Same-topic distinct (~10): related topic, genuinely different stories ───────────────────
    {
        a: {
            title: 'OpenAI releases GPT-5.5 with major reasoning improvements',
            snippet: 'The new model shows significant gains on math and coding benchmarks.',
        },
        b: {
            title: 'Google announces Gemini 3 with a 2M-token context window',
            snippet: 'Google\'s new Gemini 3 model brings a two-million-token context window and stronger multimodal reasoning.',
        },
        label: 'distinct',
        klass: 'competing-product',
    },
    {
        a: {
            title: 'Fable AI writing assistant launches to the public',
            snippet: 'Anyone can now use Fable to draft long-form fiction.',
        },
        b: {
            title: 'Rival AI writing tool Quill adds a screenplay mode',
            snippet: 'Quill, a competing AI writing assistant, launched a dedicated screenplay-formatting mode today.',
        },
        label: 'distinct',
        klass: 'competing-product',
    },
    {
        a: {
            title: 'React 19 is now stable',
            snippet: 'React 19 shipped as a stable release with the new compiler.',
        },
        b: {
            title: 'Vue 3.5 released with reactive props destructure',
            snippet: 'Vue 3.5 is out, adding reactive props destructuring and memory optimizations.',
        },
        label: 'distinct',
        klass: 'competing-product',
    },
    {
        a: {
            title: 'Rust 1.84 stabilizes async closures',
            snippet: 'The latest Rust release adds stable async closures.',
        },
        b: {
            title: 'Go 1.24 adds generic type aliases',
            snippet: 'The Go 1.24 release introduces generic type aliases and runtime improvements.',
        },
        label: 'distinct',
        klass: 'same-domain',
    },
    {
        a: {
            title: 'Security researchers disclose critical OpenSSL vulnerability',
            snippet: 'A high-severity OpenSSL flaw was disclosed today.',
        },
        b: {
            title: 'Critical vulnerability found in curl affecting HTTP/3',
            snippet: 'A separate high-severity flaw was disclosed in curl\'s HTTP/3 handling, unrelated to the OpenSSL issue.',
        },
        label: 'distinct',
        klass: 'same-domain',
    },
    {
        a: {
            title: 'Vercel raises $250M Series F',
            snippet: 'The frontend cloud company closed a $250 million round.',
        },
        b: {
            title: 'Netlify raises $105M to expand its platform',
            snippet: 'Netlify, a Vercel competitor, announced a $105 million round to grow its web platform.',
        },
        label: 'distinct',
        klass: 'competing-product',
    },
    {
        a: {
            title: 'Apple announces M5 chip for the new MacBook Pro',
            snippet: 'The M5 delivers double-digit gains over the M4.',
        },
        b: {
            title: 'Qualcomm unveils Snapdragon X2 for Windows laptops',
            snippet: 'Qualcomm introduced its Snapdragon X2 chip targeting thin-and-light Windows laptops.',
        },
        label: 'distinct',
        klass: 'competing-product',
    },
    {
        a: {
            title: 'Postgres 17 released with faster vacuum',
            snippet: 'PostgreSQL 17 features vacuum performance work.',
        },
        b: {
            title: 'MySQL 9.0 adds vector search support',
            snippet: 'MySQL 9.0 shipped native vector search, targeting AI workloads.',
        },
        label: 'distinct',
        klass: 'same-domain',
    },
    {
        a: {
            title: 'GitHub Copilot now free for all students',
            snippet: 'Verified students get Copilot at no cost.',
        },
        b: {
            title: 'GitHub launches Copilot Workspace for issue-to-PR flows',
            snippet: 'GitHub introduced Copilot Workspace, a separate product that turns issues into pull requests, at its developer event.',
        },
        label: 'distinct',
        klass: 'same-company',
    },
    {
        a: {
            title: 'EU proposes new AI transparency rules',
            snippet: 'European lawmakers introduced a draft AI disclosure requirement.',
        },
        b: {
            title: 'US state introduces its own AI deepfake labeling bill',
            snippet: 'A US state legislature proposed a separate bill requiring labels on AI-generated deepfakes.',
        },
        label: 'distinct',
        klass: 'same-domain',
    },
];
/**
 * Final-form adjudication system prompt (design decision 2). Imported verbatim by change D2's
 * adjudicator — do not edit here without re-running `--judge` and updating the D2 proposal.
 */
exports.ADJUDICATION_SYSTEM_PROMPT = 'You judge pairs of tech news items. Item A is OLDER, item B is NEWER (by published date).\n' +
    'For each pair decide:\n' +
    '- "duplicate": both describe the SAME event/announcement with no new information (paraphrase, cross-post, syndication).\n' +
    '- "update": the same ongoing story, but B contains a MATERIAL development A does not (status change, reversal, new release, ban/unban, new numbers).\n' +
    '- "distinct": different stories that merely share a topic.\n' +
    'Respond with ONLY a strict JSON array, no markdown fences:\n' +
    '[{ "id": <n>, "verdict": "duplicate"|"update"|"distinct", "note": "<one short sentence: what changed, or why duplicate/distinct>", "confidence": <0-1> }]';
