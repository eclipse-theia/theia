// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    filterLocalChatSummaries,
    filterVpsTaskSummaries,
    isLocalChatSummary,
    isVpsTaskSummary,
    normalizeWorkHubViewId,
} from './qaap-work-hub-surfaces';
import type { QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';

function summary(source: QaapAgentConversationSummaryDTO['source']): QaapAgentConversationSummaryDTO {
    return {
        id: 'id',
        source,
        cwd: '/tmp/repo',
        agentId: 'qaiq',
        title: 't',
        status: 'idle',
        createdAt: 1,
        updatedAt: 1,
        messageCount: 0,
    };
}

describe('qaap-work-hub-surfaces', () => {

    it('splits local chat from VPS task summaries', () => {
        const local = summary('theia-chat');
        const vps = summary('qaap-agent');
        expect(isLocalChatSummary(local)).to.be.true;
        expect(isVpsTaskSummary(local)).to.be.false;
        expect(isVpsTaskSummary(vps)).to.be.true;
        expect(filterLocalChatSummaries([local, vps])).to.deep.equal([local]);
        expect(filterVpsTaskSummaries([local, vps])).to.deep.equal([vps]);
    });

    it('maps legacy hub ids to tasks', () => {
        expect(normalizeWorkHubViewId('chats')).to.equal('tasks');
        expect(normalizeWorkHubViewId('team')).to.equal('tasks');
        expect(normalizeWorkHubViewId('tasks')).to.equal('tasks');
        expect(normalizeWorkHubViewId('home')).to.equal('home');
    });

});
