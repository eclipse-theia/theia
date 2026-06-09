// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import type { QaapAgentConversationDTO, QaapAgentConversationSummaryDTO } from '../common/qaap-transcript-agent-types';
import { QaapTranscriptLiveController } from './qaap-transcript-live-controller';

const summary = (partial: Partial<QaapAgentConversationSummaryDTO> = {}): QaapAgentConversationSummaryDTO => ({
    id: 'conv-1',
    cwd: '/repo',
    agentId: 'qaiq',
    title: 'Test',
    status: 'streaming',
    createdAt: 1,
    updatedAt: 10,
    messageCount: 1,
    ...partial,
});

const conv = (partial: Partial<QaapAgentConversationDTO> = {}): QaapAgentConversationDTO => ({
    id: 'conv-1',
    cwd: '/repo',
    agentId: 'qaiq',
    title: 'Test',
    status: 'streaming',
    createdAt: 1,
    updatedAt: 10,
    messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: 5 }],
    ...partial,
});

describe('QaapTranscriptLiveController', () => {
    beforeEach(() => {
        (global as unknown as { window: typeof globalThis }).window = globalThis;
    });

    it('handleSummaryUpdated renders locally while SSE deltas are still arriving', () => {
        let rendered = 0;
        let lastConv = conv();
        const changeEmitter = new Emitter<void>();
        const controller = new QaapTranscriptLiveController({
            isWatching: () => true,
            getOpenSummary: () => summary(),
            setOpenSummary: () => undefined,
            getLastConv: () => lastConv,
            setLastConv: next => { if (next) { lastConv = next; } },
            getLastSseDeltaAt: () => Date.now(),
            setLastSseDeltaAt: () => undefined,
            findSummaryById: () => summary(),
            refreshConversation: async () => undefined,
            renderConversation: () => { rendered += 1; },
            onApprovalRefresh: () => undefined,
            conversationsOnDidChange: changeEmitter.event,
        });
        controller.handleSummaryUpdated(summary({ updatedAt: 11 }));
        expect(rendered).to.equal(1);
        expect(lastConv.updatedAt).to.equal(11);
        controller.dispose();
        changeEmitter.dispose();
    });

    it('handleSummaryUpdated forces a refetch when the conversation settles', async () => {
        let refreshCalls = 0;
        let settled = 0;
        let lastConv = conv();
        const changeEmitter = new Emitter<void>();
        const controller = new QaapTranscriptLiveController({
            isWatching: () => true,
            getOpenSummary: () => summary({ status: 'idle' }),
            setOpenSummary: () => undefined,
            getLastConv: () => lastConv,
            setLastConv: next => { if (next) { lastConv = next; } },
            getLastSseDeltaAt: () => Date.now(),
            setLastSseDeltaAt: () => undefined,
            findSummaryById: () => summary({ status: 'idle' }),
            refreshConversation: async () => { refreshCalls += 1; },
            renderConversation: () => undefined,
            onApprovalRefresh: () => undefined,
            onStatusSettled: () => { settled += 1; },
            conversationsOnDidChange: changeEmitter.event,
        });
        (controller as unknown as { watchedConversationId: string }).watchedConversationId = 'conv-1';
        controller.handleSummaryUpdated(summary({ status: 'idle' }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(refreshCalls).to.be.greaterThan(0);
        expect(settled).to.equal(1);
        expect(lastConv.status).to.equal('idle');
        controller.dispose();
        changeEmitter.dispose();
    });

    it('streaming fallback poll refetches when SSE is silent', async function (): Promise<void> {
        this.timeout(6_000);
        let refreshCalls = 0;
        let lastConv = conv();
        const changeEmitter = new Emitter<void>();
        const controller = new QaapTranscriptLiveController({
            isWatching: () => true,
            getOpenSummary: () => summary(),
            setOpenSummary: () => undefined,
            getLastConv: () => lastConv,
            setLastConv: next => { if (next) { lastConv = next; } },
            getLastSseDeltaAt: () => undefined,
            setLastSseDeltaAt: () => undefined,
            findSummaryById: () => summary(),
            refreshConversation: async options => {
                if (options?.forcePoll) {
                    refreshCalls += 1;
                }
            },
            renderConversation: () => undefined,
            onApprovalRefresh: () => undefined,
            conversationsOnDidChange: changeEmitter.event,
        });
        controller.watch('conv-1');
        await new Promise(resolve => setTimeout(resolve, 4_500));
        expect(refreshCalls).to.be.greaterThan(0);
        controller.dispose();
        changeEmitter.dispose();
    });
});
