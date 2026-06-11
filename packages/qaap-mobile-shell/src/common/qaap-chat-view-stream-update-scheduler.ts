// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Injectable clocks so unit tests can drive RAF / timer coalescing deterministically. */
export interface QaapChatViewStreamUpdateClocks {
    scheduleFrame(callback: () => void): number;
    cancelFrame(id: number): void;
    setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
    clearTimeout(id: ReturnType<typeof setTimeout>): void;
}

export const defaultQaapChatViewStreamUpdateClocks: QaapChatViewStreamUpdateClocks = {
    scheduleFrame: callback => {
        if (typeof requestAnimationFrame === 'function') {
            return requestAnimationFrame(callback);
        }
        return setTimeout(callback, 0) as unknown as number;
    },
    cancelFrame: id => {
        if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(id);
        } else {
            clearTimeout(id);
        }
    },
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: id => clearTimeout(id),
};

/**
 * Coalesces bursty {@link ChatViewTreeWidget} `update()` calls during token streaming.
 * Near-bottom updates flush on the next animation frame; off-bottom coarse-pointer
 * readers use a fixed delay (see {@link resolveTranscriptStreamingCoalesceDelayMs}).
 */
export class QaapChatViewStreamUpdateScheduler {

    protected pending = false;
    protected rafId = 0;
    protected timerId: ReturnType<typeof setTimeout> | undefined;
    protected flushCount = 0;

    constructor(
        protected readonly flush: () => void,
        protected readonly resolveDelayMs: () => number,
        protected readonly clocks: QaapChatViewStreamUpdateClocks = defaultQaapChatViewStreamUpdateClocks,
    ) { }

    schedule(): void {
        this.pending = true;
        const delayMs = this.resolveDelayMs();
        if (delayMs === 0) {
            if (this.timerId !== undefined) {
                this.clocks.clearTimeout(this.timerId);
                this.timerId = undefined;
            }
            if (!this.rafId) {
                this.rafId = this.clocks.scheduleFrame(() => this.runFlush());
            }
            return;
        }
        if (this.rafId) {
            this.clocks.cancelFrame(this.rafId);
            this.rafId = 0;
        }
        if (this.timerId === undefined) {
            this.timerId = this.clocks.setTimeout(() => {
                this.timerId = undefined;
                this.runFlush();
            }, delayMs);
        }
    }

    /** Flush any pending coalesced update immediately (turn complete, dispose). */
    flushNow(): void {
        this.cancelPendingTimers();
        if (!this.pending) {
            return;
        }
        this.pending = false;
        this.flushCount++;
        this.flush();
    }

    dispose(): void {
        this.cancelPendingTimers();
        this.pending = false;
    }

    getFlushCount(): number {
        return this.flushCount;
    }

    protected runFlush(): void {
        this.rafId = 0;
        if (this.timerId !== undefined) {
            this.clocks.clearTimeout(this.timerId);
            this.timerId = undefined;
        }
        if (!this.pending) {
            return;
        }
        this.pending = false;
        this.flushCount++;
        this.flush();
    }

    protected cancelPendingTimers(): void {
        if (this.rafId) {
            this.clocks.cancelFrame(this.rafId);
            this.rafId = 0;
        }
        if (this.timerId !== undefined) {
            this.clocks.clearTimeout(this.timerId);
            this.timerId = undefined;
        }
    }
}
