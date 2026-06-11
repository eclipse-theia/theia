// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    formatQaapChatUiPerfLog,
    QaapChatUiPerfCollector,
} from './qaap-chat-ui-perf';

describe('QaapChatUiPerfCollector', () => {
    const previous = process.env.QAAP_STREAM_METRICS;

    beforeEach(() => {
        process.env.QAAP_STREAM_METRICS = '1';
        QaapChatUiPerfCollector.resetForTests();
    });

    afterEach(() => {
        process.env.QAAP_STREAM_METRICS = previous;
        QaapChatUiPerfCollector.resetForTests();
    });

    it('reports TTFT, paint coalescing, and duration for a streaming turn', () => {
        const collector = QaapChatUiPerfCollector.get();
        let now = 1000;
        collector.setNowProvider(() => now);

        collector.beginTurn('req-1', 'session-a', 'chat-view');
        now += 120;
        collector.recordContentChange('req-1');
        collector.recordContentChange('req-1');
        collector.recordContentChange('req-1');
        collector.recordPaint('req-1');
        now += 880;
        collector.recordContentChange('req-1');
        collector.recordPaint('req-1');

        const snapshot = collector.finishTurn('req-1');
        expect(snapshot).to.not.equal(undefined);
        expect(snapshot?.ttftMs).to.equal(120);
        expect(snapshot?.durationMs).to.equal(1000);
        expect(snapshot?.contentChangeEvents).to.equal(4);
        expect(snapshot?.paintEvents).to.equal(2);
        expect(snapshot?.coalesceRatio).to.equal(2);
        expect(formatQaapChatUiPerfLog(snapshot!)).to.include('[Qaap chat UI perf/chat-view]');
        expect(formatQaapChatUiPerfLog(snapshot!)).to.include('coalesce=2x');
    });

    it('is a no-op when metrics are disabled', () => {
        process.env.QAAP_STREAM_METRICS = '0';
        QaapChatUiPerfCollector.resetForTests();
        const collector = QaapChatUiPerfCollector.get();
        collector.beginTurn('req-2', 'session-b', 'chat-view');
        collector.recordContentChange('req-2');
        expect(collector.finishTurn('req-2')).to.equal(undefined);
    });
});
