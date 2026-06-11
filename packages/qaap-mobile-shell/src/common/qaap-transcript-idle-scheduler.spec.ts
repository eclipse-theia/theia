// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { scheduleTranscriptIdleWork } from './qaap-transcript-idle-scheduler';

describe('qaap-transcript-idle-scheduler', () => {

    afterEach(() => {
        delete (globalThis as { scheduler?: unknown }).scheduler;
    });

    it('runs work via requestIdleCallback when scheduler.postTask is unavailable', async () => {
        let ran = false;
        const original = globalThis.requestIdleCallback;
        globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
            callback({ didTimeout: false, timeRemaining: () => 16 } as IdleDeadline);
            return 1;
        }) as typeof requestIdleCallback;
        globalThis.cancelIdleCallback = () => undefined;
        try {
            scheduleTranscriptIdleWork(() => { ran = true; });
            expect(ran).to.equal(true);
        } finally {
            globalThis.requestIdleCallback = original;
        }
    });

    it('honours when() and skips cancelled work', () => {
        let ran = false;
        const handle = scheduleTranscriptIdleWork(() => { ran = true; }, { when: () => false });
        handle.cancel();
        expect(ran).to.equal(false);
    });

    it('prefers scheduler.postTask with background priority when available', () => {
        let priority: string | undefined;
        (globalThis as { scheduler?: { postTask: (fn: () => void, opts?: { priority?: string }) => Promise<void> } }).scheduler = {
            postTask: (_fn, opts) => {
                priority = opts?.priority;
                return Promise.resolve();
            },
        };
        scheduleTranscriptIdleWork(() => undefined);
        expect(priority).to.equal('background');
    });
});
