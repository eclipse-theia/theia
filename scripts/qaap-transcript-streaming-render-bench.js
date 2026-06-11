#!/usr/bin/env node
// *****************************************************************************
// Compare transcript streaming render strategies (run after compile):
//   node scripts/qaap-transcript-streaming-render-bench.js
// *****************************************************************************

const markdownit = require('../packages/core/shared/markdown-it');
const { parseHTML } = require('linkedom');
const { computeTranscriptStreamingMarkdownPatch } = require('../packages/qaap-mobile-shell/lib/browser/qaap-transcript-markdown-worker-stream');
const {
    patchStreamingMarkdownContent,
    applyStreamingMarkdownHtmlPatch,
    updateStreamingPlainPreview,
    TRANSCRIPT_STREAM_FROZEN_CLASS,
    TRANSCRIPT_STREAM_TAIL_CLASS,
} = require('../packages/qaap-transcript-overlay/lib/browser/qaap-transcript-streaming-markdown-view');

const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
const { document } = window;
globalThis.window = window;
globalThis.document = document;
const createDOMPurify = require('dompurify');
const DOMPurify = createDOMPurify(window);
const md = markdownit({ linkify: false });

function renderSanitized(markdown) {
    return DOMPurify.sanitize(md.render(markdown), { ALLOW_UNKNOWN_PROTOCOLS: true });
}

function buildStream(iteration) {
    const prefix = '## Streaming response\n\n' + 'Line with **bold** and `code`. '.repeat(400);
    return prefix + ` token-${iteration}`;
}

function bench(name, iterations, fn) {
    // Warmup
    fn(0, document.createElement('div'));
    const start = performance.now();
    const host = document.createElement('div');
    for (let i = 0; i < iterations; i++) {
        fn(i, host);
    }
    const totalMs = performance.now() - start;
    return {
        name,
        iterations,
        totalMs: round(totalMs),
        perTickMs: round(totalMs / iterations),
        ticksPerSecond: round(iterations / (totalMs / 1000)),
    };
}

function round(n) {
    return Math.round(n * 100) / 100;
}

function runPlainText(iteration, host) {
    const content = buildStream(iteration);
    host.textContent = content;
}

function runFullMarkdownMain(iteration, host) {
    const content = buildStream(iteration);
    host.innerHTML = renderSanitized(content);
}

function runFrozenTailMain(iteration, host) {
    const content = buildStream(iteration);
    patchStreamingMarkdownContent(host, content, {
        renderHtml: renderSanitized,
    });
}

function runHybridMainHotPath(iteration, host) {
    const content = buildStream(iteration);
    // Worker ~2 frames behind: formatted length from 2 ticks ago
    const formattedTotal = iteration >= 2
        ? buildStream(iteration - 2).length
        : 0;
    updateStreamingPlainPreview(host, content, formattedTotal);
}

function runHybridMainWithWorkerApply(iteration, host) {
    const content = buildStream(iteration);
    updateStreamingPlainPreview(host, content, Number(host.dataset.qaapStreamTotalLength ?? '0'));
    const patch = computeTranscriptStreamingMarkdownPatch(
        content,
        Number(host.dataset.qaapStreamStableLength ?? '-1'),
        Number(host.dataset.qaapStreamTotalLength ?? '-1'),
        renderSanitized,
    );
    if (patch) {
        applyStreamingMarkdownHtmlPatch(host, {
            stableLength: patch.stableLength,
            totalLength: patch.totalLength,
            ...(patch.frozenHtml !== undefined ? { frozenHtml: patch.frozenHtml } : {}),
            tailHtml: patch.tailHtml,
        });
        updateStreamingPlainPreview(host, content, patch.totalLength);
    }
}

function runWorkerFrozenTailParseOnly(iteration) {
    const content = buildStream(iteration);
    let stable = -1;
    let total = -1;
    for (let i = 0; i <= iteration; i++) {
        const c = buildStream(i);
        const patch = computeTranscriptStreamingMarkdownPatch(c, stable, total, renderSanitized);
        if (patch) {
            stable = patch.stableLength;
            total = patch.totalLength;
        }
    }
}

function runWorkerParsePerTick(iteration) {
    const content = buildStream(iteration);
    const prev = iteration > 0 ? buildStream(iteration - 1) : '';
    const stable = Number(
        iteration > 0
            ? (computeTranscriptStreamingMarkdownPatch(prev, -1, -1, renderSanitized)?.stableLength ?? -1)
            : -1,
    );
    computeTranscriptStreamingMarkdownPatch(content, stable, prev.length, renderSanitized);
}

const ITERATIONS = 600;
const contentSample = buildStream(ITERATIONS - 1);

console.log('Qaap transcript streaming render benchmark');
console.log('─'.repeat(56));
console.log(`Iterations: ${ITERATIONS} (~10s @ 60fps)`);
console.log(`Final payload: ${contentSample.length.toLocaleString()} chars`);
console.log('');

const results = [
    bench('1. Plain text (textContent)', ITERATIONS, runPlainText),
    bench('2. Full markdown main thread', ITERATIONS, runFullMarkdownMain),
    bench('3. Frozen/tail markdown main thread', ITERATIONS, runFrozenTailMain),
    bench('4. Hybrid hot path (plain suffix only)', ITERATIONS, runHybridMainHotPath),
    bench('5. Hybrid main (suffix + DOM apply)*', ITERATIONS, runHybridMainWithWorkerApply),
];

const workerBenchStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    runWorkerParsePerTick(i);
}
const workerParseMs = performance.now() - workerBenchStart;
results.push({
    name: '6. Worker frozen/tail parse (off-thread)',
    iterations: ITERATIONS,
    totalMs: round(workerParseMs),
    perTickMs: round(workerParseMs / ITERATIONS),
    ticksPerSecond: round(ITERATIONS / (workerParseMs / 1000)),
});

const baseline = results[0].totalMs;
console.log('Strategy                                      Total ms   ms/tick   t/s    vs plain');
console.log('─'.repeat(86));
for (const row of results) {
    const vs = row.name.startsWith('6.')
        ? '(off main thread)'
        : `${round(row.totalMs / baseline)}×`;
    console.log(
        `${row.name.padEnd(45)} ${String(row.totalMs).padStart(8)} ${String(row.perTickMs).padStart(9)} ${String(row.ticksPerSecond).padStart(6)} ${vs.padStart(10)}`,
    );
}
console.log('');
console.log('* #5 simulates worker result arriving same tick (worst-case main thread);');
console.log('  production defers markdown-it to worker (#6) and only runs #4 per SSE frame.');
console.log('');
console.log('Production hybrid per frame: #4 on main thread + #6 async in worker.');
