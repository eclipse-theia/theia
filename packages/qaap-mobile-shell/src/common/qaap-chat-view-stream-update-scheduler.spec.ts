// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    QaapChatViewStreamUpdateScheduler,
    type QaapChatViewStreamUpdateClocks,
} from './qaap-chat-view-stream-update-scheduler';

describe('QaapChatViewStreamUpdateScheduler', () => {

    it('coalesces many near-bottom schedules into one flush per animation frame', () => {
        let flushCount = 0;
        let rafCallback: (() => void) | undefined;
        const clocks: QaapChatViewStreamUpdateClocks = {
            scheduleFrame: callback => {
                rafCallback = callback;
                return 1;
            },
            cancelFrame: () => {
                rafCallback = undefined;
            },
            setTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
            clearTimeout: () => undefined,
        };
        const scheduler = new QaapChatViewStreamUpdateScheduler(
            () => { flushCount++; },
            () => 0,
            clocks,
        );

        for (let i = 0; i < 80; i++) {
            scheduler.schedule();
        }
        expect(flushCount).to.equal(0);
        expect(scheduler.getFlushCount()).to.equal(0);

        rafCallback?.();
        expect(flushCount).to.equal(1);
        expect(scheduler.getFlushCount()).to.equal(1);
    });

    it('coalesces off-bottom schedules into one timer flush', () => {
        let flushCount = 0;
        let timerCallback: (() => void) | undefined;
        const clocks: QaapChatViewStreamUpdateClocks = {
            scheduleFrame: () => 0,
            cancelFrame: () => undefined,
            setTimeout: callback => {
                timerCallback = callback;
                return 99 as unknown as ReturnType<typeof setTimeout>;
            },
            clearTimeout: () => {
                timerCallback = undefined;
            },
        };
        const scheduler = new QaapChatViewStreamUpdateScheduler(
            () => { flushCount++; },
            () => 33,
            clocks,
        );

        for (let i = 0; i < 40; i++) {
            scheduler.schedule();
        }
        expect(flushCount).to.equal(0);

        timerCallback?.();
        expect(flushCount).to.equal(1);
    });

    it('flushNow applies a pending update immediately', () => {
        let flushCount = 0;
        const clocks: QaapChatViewStreamUpdateClocks = {
            scheduleFrame: () => 7,
            cancelFrame: () => undefined,
            setTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
            clearTimeout: () => undefined,
        };
        const scheduler = new QaapChatViewStreamUpdateScheduler(
            () => { flushCount++; },
            () => 0,
            clocks,
        );

        scheduler.schedule();
        scheduler.flushNow();
        expect(flushCount).to.equal(1);
    });
});
