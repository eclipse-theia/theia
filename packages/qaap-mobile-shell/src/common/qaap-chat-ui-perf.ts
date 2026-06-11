// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { isQaapStreamMetricsEnabled } from './qaap-agent-stream-metrics';

export type QaapChatUiPerfSurface = 'chat-view' | 'transcript';

export interface QaapChatUiPerfTurnSnapshot {
    readonly turnId: string;
    readonly sessionId: string;
    readonly surface: QaapChatUiPerfSurface;
    readonly ttftMs: number;
    readonly durationMs: number;
    readonly contentChangeEvents: number;
    readonly paintEvents: number;
    readonly coalesceRatio: number;
    readonly longTaskCount: number;
    readonly maxLongTaskMs: number;
}

interface ActiveChatUiTurn {
    readonly turnId: string;
    readonly sessionId: string;
    readonly surface: QaapChatUiPerfSurface;
    readonly startedAt: number;
    contentChangeEvents: number;
    paintEvents: number;
    firstContentAt?: number;
    longTaskCountAtStart: number;
    maxLongTaskMsAtStart: number;
}

/** Opt-in UI perf for chat streaming — same flag as wire metrics (`qaap.streamMetrics`). */
export class QaapChatUiPerfCollector {

    protected static instance: QaapChatUiPerfCollector | undefined;

    protected readonly active = new Map<string, ActiveChatUiTurn>();
    protected now: () => number = () => Date.now();
    protected longTaskCount = 0;
    protected maxLongTaskMs = 0;
    protected longTaskObserver: PerformanceObserver | undefined;

    static get(): QaapChatUiPerfCollector {
        if (!QaapChatUiPerfCollector.instance) {
            QaapChatUiPerfCollector.instance = new QaapChatUiPerfCollector();
        }
        return QaapChatUiPerfCollector.instance;
    }

    /** Visible for unit tests. */
    static resetForTests(): void {
        QaapChatUiPerfCollector.instance?.disposeObserver();
        QaapChatUiPerfCollector.instance = undefined;
    }

    setNowProvider(now: () => number): void {
        this.now = now;
    }

    ensureLongTaskObserver(): void {
        if (!isQaapStreamMetricsEnabled() || this.longTaskObserver !== undefined) {
            return;
        }
        if (typeof PerformanceObserver === 'undefined') {
            return;
        }
        try {
            this.longTaskObserver = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    this.longTaskCount++;
                    this.maxLongTaskMs = Math.max(this.maxLongTaskMs, entry.duration);
                }
            });
            this.longTaskObserver.observe({ entryTypes: ['longtask'] });
        } catch {
            /* longtask unsupported in this browser */
        }
    }

    beginTurn(turnId: string, sessionId: string, surface: QaapChatUiPerfSurface): void {
        if (!isQaapStreamMetricsEnabled() || !turnId) {
            return;
        }
        this.ensureLongTaskObserver();
        this.active.set(turnId, {
            turnId,
            sessionId,
            surface,
            startedAt: this.now(),
            contentChangeEvents: 0,
            paintEvents: 0,
            longTaskCountAtStart: this.longTaskCount,
            maxLongTaskMsAtStart: this.maxLongTaskMs,
        });
    }

    recordContentChange(turnId: string): void {
        if (!isQaapStreamMetricsEnabled() || !turnId) {
            return;
        }
        const turn = this.active.get(turnId);
        if (!turn) {
            return;
        }
        turn.contentChangeEvents++;
        if (turn.firstContentAt === undefined) {
            turn.firstContentAt = this.now();
        }
    }

    recordPaint(turnId: string): void {
        if (!isQaapStreamMetricsEnabled() || !turnId) {
            return;
        }
        const turn = this.active.get(turnId);
        if (!turn) {
            return;
        }
        turn.paintEvents++;
    }

    finishTurn(turnId: string): QaapChatUiPerfTurnSnapshot | undefined {
        if (!isQaapStreamMetricsEnabled() || !turnId) {
            return undefined;
        }
        const turn = this.active.get(turnId);
        if (!turn) {
            return undefined;
        }
        this.active.delete(turnId);
        const endedAt = this.now();
        const durationMs = Math.max(1, endedAt - turn.startedAt);
        const ttftMs = turn.firstContentAt !== undefined
            ? Math.max(0, turn.firstContentAt - turn.startedAt)
            : durationMs;
        const paintEvents = turn.paintEvents;
        const coalesceRatio = paintEvents > 0
            ? round2(turn.contentChangeEvents / paintEvents)
            : turn.contentChangeEvents;
        const snapshot: QaapChatUiPerfTurnSnapshot = {
            turnId: turn.turnId,
            sessionId: turn.sessionId,
            surface: turn.surface,
            ttftMs,
            durationMs,
            contentChangeEvents: turn.contentChangeEvents,
            paintEvents,
            coalesceRatio,
            longTaskCount: this.longTaskCount - turn.longTaskCountAtStart,
            maxLongTaskMs: Math.max(0, this.maxLongTaskMs - turn.maxLongTaskMsAtStart),
        };
        logQaapChatUiPerf(snapshot);
        return snapshot;
    }

    protected disposeObserver(): void {
        this.longTaskObserver?.disconnect();
        this.longTaskObserver = undefined;
    }
}

export function formatQaapChatUiPerfLog(snapshot: QaapChatUiPerfTurnSnapshot): string {
    return [
        `[Qaap chat UI perf/${snapshot.surface}]`,
        `turn=${snapshot.turnId}`,
        `session=${snapshot.sessionId}`,
        `ttft=${round2(snapshot.ttftMs)}ms`,
        `duration=${round2(snapshot.durationMs)}ms`,
        `contentChanges=${snapshot.contentChangeEvents}`,
        `paints=${snapshot.paintEvents}`,
        `coalesce=${snapshot.coalesceRatio}x`,
        `longTasks=${snapshot.longTaskCount}`,
        `maxLongTask=${round2(snapshot.maxLongTaskMs)}ms`,
    ].join(' ');
}

export function logQaapChatUiPerf(snapshot: QaapChatUiPerfTurnSnapshot | undefined): void {
    if (!snapshot) {
        return;
    }
    const line = formatQaapChatUiPerfLog(snapshot);
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info(line);
    }
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}
