// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface TranscriptIdleWorkOptions {
    /** Max wait before {@link requestIdleCallback} runs the task anyway. */
    readonly timeoutMs?: number;
    /** Skip the task when this returns false (e.g. hidden document). */
    readonly when?: () => boolean;
}

export interface TranscriptIdleWorkHandle {
    cancel(): void;
}

interface SchedulerPostTask {
    postTask(
        callback: () => void,
        options?: { priority?: 'background' | 'user-visible' | 'user-blocking'; signal?: AbortSignal },
    ): Promise<void>;
}

const DEFAULT_IDLE_TIMEOUT_MS = 2_000;

/**
 * Runs low-priority transcript work off the hot SSE/scroll path.
 * Prefers `scheduler.postTask` (background), then `requestIdleCallback`, then `setTimeout(0)`.
 */
export function scheduleTranscriptIdleWork(
    work: () => void,
    options?: TranscriptIdleWorkOptions,
): TranscriptIdleWorkHandle {
    let cancelled = false;
    const run = (): void => {
        if (cancelled) {
            return;
        }
        if (options?.when && !options.when()) {
            return;
        }
        work();
    };

    const schedulerApi = (globalThis as { scheduler?: SchedulerPostTask }).scheduler;
    if (schedulerApi?.postTask) {
        const controller = new AbortController();
        void schedulerApi.postTask(run, { priority: 'background', signal: controller.signal }).catch(() => undefined);
        return {
            cancel: () => {
                cancelled = true;
                controller.abort();
            },
        };
    }

    if (typeof requestIdleCallback === 'function') {
        const handle = requestIdleCallback(run, { timeout: options?.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS });
        return {
            cancel: () => {
                cancelled = true;
                cancelIdleCallback(handle);
            },
        };
    }

    const timeoutId = setTimeout(run, 0);
    return {
        cancel: () => {
            cancelled = true;
            clearTimeout(timeoutId);
        },
    };
}
