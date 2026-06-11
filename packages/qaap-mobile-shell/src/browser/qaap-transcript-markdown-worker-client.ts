// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    shouldApplyTranscriptMarkdownWorkerResult,
    type TranscriptMarkdownWorkerRequest,
    type TranscriptMarkdownWorkerResponse,
} from './qaap-transcript-markdown-worker-protocol';

export type TranscriptMarkdownApplyFn = (host: HTMLElement, html: string, cleanLength: number) => void;
export type TranscriptMarkdownSyncParseFn = (host: HTMLElement, content: string) => void;

export class QaapTranscriptMarkdownWorkerClient {
    protected static instance: QaapTranscriptMarkdownWorkerClient | undefined;

    protected worker: Worker | undefined;
    protected workerFailed = false;
    protected nextRequestId = 0;
    protected readonly hostGenerations = new WeakMap<HTMLElement, number>();
    protected readonly pendingRequests = new Map<number, {
        readonly host: HTMLElement;
        readonly generation: number;
        readonly apply: TranscriptMarkdownApplyFn;
    }>();

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
        const generation = (this.hostGenerations.get(host) ?? 0) + 1;
        this.hostGenerations.set(host, generation);

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
        this.pendingRequests.set(requestId, { host, generation, apply });
        const request: TranscriptMarkdownWorkerRequest = {
            type: 'parse',
            requestId,
            generation,
            content,
        };
        worker.postMessage(request);
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
                this.workerFailed = true;
                this.disposeWorkerOnly();
            };
            return this.worker;
        } catch {
            this.workerFailed = true;
            return undefined;
        }
    }

    protected handleWorkerMessage(message: TranscriptMarkdownWorkerResponse | undefined): void {
        if (message?.type !== 'result') {
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
        pending.apply(pending.host, message.html, message.cleanLength);
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
