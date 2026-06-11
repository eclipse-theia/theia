// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    shouldApplyTranscriptMarkdownWorkerResult,
    type TranscriptMarkdownWorkerRequest,
    type TranscriptMarkdownWorkerResponse,
    type TranscriptMarkdownWorkerStreamResponse,
} from './qaap-transcript-markdown-worker-protocol';
import type { StreamingMarkdownHtmlPatch } from '@theia/qaap-transcript-overlay/lib/browser/qaap-transcript-streaming-markdown-view';

export type TranscriptMarkdownApplyFn = (host: HTMLElement, html: string, cleanLength: number) => void;
export type TranscriptMarkdownSyncParseFn = (host: HTMLElement, content: string) => void;
export type TranscriptStreamingMarkdownApplyFn = (
    host: HTMLElement,
    patch: StreamingMarkdownHtmlPatch,
    cleanLength: number,
) => void;
export type TranscriptStreamingPlainTextFallbackFn = (host: HTMLElement, content: string) => void;

interface PendingParseRequest {
    readonly kind: 'parse';
    readonly host: HTMLElement;
    readonly generation: number;
    readonly content: string;
    readonly apply: TranscriptMarkdownApplyFn;
    readonly fallbackSync: TranscriptMarkdownSyncParseFn;
}

interface PendingStreamRequest {
    readonly kind: 'stream';
    readonly host: HTMLElement;
    readonly generation: number;
    readonly content: string;
    readonly apply: TranscriptStreamingMarkdownApplyFn;
    readonly fallbackPlainText: TranscriptStreamingPlainTextFallbackFn;
}

type PendingRequest = PendingParseRequest | PendingStreamRequest;

export class QaapTranscriptMarkdownWorkerClient {
    protected static instance: QaapTranscriptMarkdownWorkerClient | undefined;

    protected worker: Worker | undefined;
    protected workerFailed = false;
    protected nextRequestId = 0;
    protected readonly hostGenerations = new WeakMap<HTMLElement, number>();
    protected readonly pendingRequests = new Map<number, PendingRequest>();

    static get(): QaapTranscriptMarkdownWorkerClient {
        if (!QaapTranscriptMarkdownWorkerClient.instance) {
            QaapTranscriptMarkdownWorkerClient.instance = new QaapTranscriptMarkdownWorkerClient();
        }
        return QaapTranscriptMarkdownWorkerClient.instance;
    }

    /** Visible for unit tests. */
    static resetForTests(): void {
        QaapTranscriptMarkdownWorkerClient.instance?.dispose();
        QaapTranscriptMarkdownWorkerClient.instance = undefined;
    }

    requestParse(
        host: HTMLElement,
        content: string,
        apply: TranscriptMarkdownApplyFn,
        fallbackSync: TranscriptMarkdownSyncParseFn,
    ): void {
        const generation = this.bumpHostGeneration(host);

        if (this.workerFailed || typeof Worker === 'undefined') {
            fallbackSync(host, content);
            return;
        }

        const worker = this.ensureWorker();
        if (!worker) {
            fallbackSync(host, content);
            return;
        }

        const requestId = ++this.nextRequestId;
        this.pendingRequests.set(requestId, { kind: 'parse', host, generation, content, apply, fallbackSync });
        const request: TranscriptMarkdownWorkerRequest = {
            type: 'parse',
            requestId,
            generation,
            content,
        };
        worker.postMessage(request);
    }

    requestStreamingPatch(
        host: HTMLElement,
        content: string,
        previousStableLength: number,
        previousTotalLength: number,
        apply: TranscriptStreamingMarkdownApplyFn,
        fallbackPlainText: TranscriptStreamingPlainTextFallbackFn,
    ): void {
        const generation = this.bumpHostGeneration(host);

        if (this.workerFailed || typeof Worker === 'undefined') {
            fallbackPlainText(host, content);
            return;
        }

        const worker = this.ensureWorker();
        if (!worker) {
            fallbackPlainText(host, content);
            return;
        }

        const requestId = ++this.nextRequestId;
        this.pendingRequests.set(requestId, {
            kind: 'stream',
            host,
            generation,
            content,
            apply,
            fallbackPlainText,
        });
        const request: TranscriptMarkdownWorkerRequest = {
            type: 'parse_stream',
            requestId,
            generation,
            content,
            previousStableLength,
            previousTotalLength,
        };
        worker.postMessage(request);
    }

    protected bumpHostGeneration(host: HTMLElement): number {
        const generation = (this.hostGenerations.get(host) ?? 0) + 1;
        this.hostGenerations.set(host, generation);
        return generation;
    }

    protected ensureWorker(): Worker | undefined {
        if (this.worker) {
            return this.worker;
        }
        try {
            this.worker = new Worker(new URL('./qaap-transcript-markdown-worker.js', location.href));
            this.worker.onmessage = (event: MessageEvent<TranscriptMarkdownWorkerResponse>) => {
                this.handleWorkerMessage(event.data);
            };
            this.worker.onerror = () => {
                this.failWorkerAndFallbackPending();
            };
            return this.worker;
        } catch {
            this.workerFailed = true;
            return undefined;
        }
    }

    protected handleWorkerMessage(message: TranscriptMarkdownWorkerResponse | undefined): void {
        if (!message) {
            return;
        }
        const pending = this.pendingRequests.get(message.requestId);
        if (!pending) {
            return;
        }
        this.pendingRequests.delete(message.requestId);
        if (!shouldApplyTranscriptMarkdownWorkerResult(this.hostGenerations.get(pending.host), message.generation)) {
            return;
        }
        if (message.type === 'result' && pending.kind === 'parse') {
            pending.apply(pending.host, message.html, message.cleanLength);
            return;
        }
        if (message.type === 'stream_result' && pending.kind === 'stream') {
            this.applyStreamResult(pending, message);
        }
    }

    protected applyStreamResult(
        pending: PendingStreamRequest,
        message: TranscriptMarkdownWorkerStreamResponse,
    ): void {
        if (message.noop || message.tailHtml === undefined) {
            return;
        }
        pending.apply(pending.host, {
            stableLength: message.stableLength,
            totalLength: message.totalLength,
            ...(message.frozenHtml !== undefined ? { frozenHtml: message.frozenHtml } : {}),
            tailHtml: message.tailHtml,
        }, message.cleanLength);
    }

    protected failWorkerAndFallbackPending(): void {
        this.workerFailed = true;
        const pending = [...this.pendingRequests.values()];
        this.disposeWorkerOnly();
        for (const request of pending) {
            if (!shouldApplyTranscriptMarkdownWorkerResult(this.hostGenerations.get(request.host), request.generation)) {
                continue;
            }
            if (request.kind === 'parse') {
                request.fallbackSync(request.host, request.content);
            } else {
                request.fallbackPlainText(request.host, request.content);
            }
        }
    }

    protected disposeWorkerOnly(): void {
        this.worker?.terminate();
        this.worker = undefined;
        this.pendingRequests.clear();
    }

    dispose(): void {
        this.disposeWorkerOnly();
        this.workerFailed = false;
        this.nextRequestId = 0;
    }
}
