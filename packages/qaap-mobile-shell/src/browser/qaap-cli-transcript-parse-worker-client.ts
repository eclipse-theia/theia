// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageSegment } from '../common/qaap-qaiq-stream';
import { parseAgentLogForTranscript } from '../common/qaap-cli-transcript-stream';
import {
    shouldApplyCliTranscriptParseWorkerResult,
    type CliTranscriptParseWorkerRequest,
    type CliTranscriptParseWorkerResponse,
} from './qaap-cli-transcript-parse-worker-protocol';

export interface CliTranscriptParseCacheEntry {
    readonly content: string;
    readonly segments: readonly QaapAgentMessageSegment[];
}

/** Logs at or above this size are prefetched in the parse worker (main thread sync fallback remains). */
export const CLI_TRANSCRIPT_PARSE_WORKER_MIN_CHARS = 4_096;

export class QaapCliTranscriptParseWorkerClient {
    protected static instance: QaapCliTranscriptParseWorkerClient | undefined;

    protected worker: Worker | undefined;
    protected workerFailed = false;
    protected nextRequestId = 0;
    protected readonly cache = new Map<string, CliTranscriptParseCacheEntry>();
    protected readonly inflight = new Map<string, number>();
    protected readonly pendingByRequestId = new Map<number, string>();

    static get(): QaapCliTranscriptParseWorkerClient {
        if (!QaapCliTranscriptParseWorkerClient.instance) {
            QaapCliTranscriptParseWorkerClient.instance = new QaapCliTranscriptParseWorkerClient();
        }
        return QaapCliTranscriptParseWorkerClient.instance;
    }

    static resetForTests(): void {
        QaapCliTranscriptParseWorkerClient.instance?.dispose();
        QaapCliTranscriptParseWorkerClient.instance = undefined;
    }

    dispose(): void {
        this.worker?.terminate();
        this.worker = undefined;
        this.cache.clear();
        this.inflight.clear();
        this.pendingByRequestId.clear();
    }

    peekParsedSegments(cacheKey: string): readonly QaapAgentMessageSegment[] | undefined {
        return this.cache.get(cacheKey)?.segments;
    }

    /** Warm the cache for a large raw agent log (no-op when already cached or in flight). */
    prefetch(agentId: string | undefined, log: string, cacheKey: string): void {
        if (!log || log.length < CLI_TRANSCRIPT_PARSE_WORKER_MIN_CHARS || this.cache.has(cacheKey)) {
            return;
        }
        if (this.inflight.has(cacheKey)) {
            return;
        }
        const requestId = ++this.nextRequestId;
        this.inflight.set(cacheKey, requestId);
        this.pendingByRequestId.set(requestId, cacheKey);
        const request: CliTranscriptParseWorkerRequest = {
            type: 'parse',
            requestId,
            cacheKey,
            agentId,
            log,
        };
        const worker = this.ensureWorker();
        if (!worker) {
            this.storeSync(agentId, log, cacheKey, requestId);
            return;
        }
        worker.postMessage(request);
    }

    protected storeSync(
        agentId: string | undefined,
        log: string,
        cacheKey: string,
        requestId: number,
    ): void {
        const parsed = parseAgentLogForTranscript(agentId, log);
        this.cache.set(cacheKey, parsed);
        this.inflight.delete(cacheKey);
        this.pendingByRequestId.delete(requestId);
    }

    protected ensureWorker(): Worker | undefined {
        if (this.workerFailed) {
            return undefined;
        }
        if (!this.worker && typeof Worker !== 'undefined') {
            try {
                this.worker = new Worker(new URL('./qaap-cli-transcript-parse-worker.js', location.href));
                this.worker.onmessage = (event: MessageEvent<CliTranscriptParseWorkerResponse>) => {
                    this.handleWorkerMessage(event.data);
                };
                this.worker.onerror = () => {
                    this.workerFailed = true;
                    this.worker?.terminate();
                    this.worker = undefined;
                };
            } catch {
                this.workerFailed = true;
                return undefined;
            }
        }
        return this.worker;
    }

    protected handleWorkerMessage(message: CliTranscriptParseWorkerResponse | undefined): void {
        if (!message || message.type !== 'result') {
            return;
        }
        const inflightRequestId = this.inflight.get(message.cacheKey);
        if (!shouldApplyCliTranscriptParseWorkerResult(inflightRequestId, message.requestId)) {
            return;
        }
        this.cache.set(message.cacheKey, {
            content: message.content,
            segments: message.segments,
        });
        this.inflight.delete(message.cacheKey);
        this.pendingByRequestId.delete(message.requestId);
    }
}
