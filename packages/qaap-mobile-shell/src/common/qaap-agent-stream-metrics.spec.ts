// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    QaapConversationStreamMetricsCollector,
    formatQaapStreamMetricsLog,
} from './qaap-agent-stream-metrics';

describe('QaapConversationStreamMetricsCollector', () => {
    const previous = process.env.QAAP_STREAM_METRICS;

    beforeEach(() => {
        process.env.QAAP_STREAM_METRICS = '1';
    });

    afterEach(() => {
        process.env.QAAP_STREAM_METRICS = previous;
    });

    it('summarizes events, bytes, and deltas for a streaming turn', () => {
        const collector = new QaapConversationStreamMetricsCollector('server');
        collector.setTransport('conv-1', 'ws');
        collector.recordWireEvent('conv-1', 'message_delta', {
            type: 'message_delta',
            conversationId: 'conv-1',
            delta: { kind: 'append_content', messageId: 'm1', text: 'hello' },
        });
        collector.recordWireEvent('conv-1', 'updated', {
            type: 'updated',
            conversation: { id: 'conv-1', status: 'idle' },
        });
        const snapshot = collector.finishTurn('conv-1');
        expect(snapshot).to.not.equal(undefined);
        expect(snapshot?.eventsTotal).to.equal(2);
        expect(snapshot?.messageDeltaEvents).to.equal(1);
        expect(snapshot?.updatedEvents).to.equal(1);
        expect(snapshot?.transport).to.equal('ws');
        expect(snapshot?.bytesTotal).to.be.greaterThan(0);
        expect(formatQaapStreamMetricsLog(snapshot!)).to.include('[Qaap stream metrics/server]');
    });
});
