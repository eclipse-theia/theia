// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationDTO } from './qaap-agent-conversation-client';
import {
    buildUpdateConversationComposerPatch,
    extractConversationComposerPrefs,
    readConversationComposerDraft,
    resolveApprovalPolicyFromConversation,
    writeConversationComposerDraft,
} from './qaap-conversation-composer-prefs';

const baseConv = (): QaapAgentConversationDTO => ({
    id: 'conv-1',
    cwd: '/repo',
    agentId: 'qaiq',
    title: 'Test',
    status: 'idle',
    createdAt: 1,
    updatedAt: 2,
    messages: [],
});

describe('qaap-conversation-composer-prefs', () => {
    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        (global as unknown as { window: Window }).window = {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => { storage.set(key, value); },
                removeItem: (key: string) => { storage.delete(key); },
                clear: () => { storage.clear(); },
                key: () => null,
                length: 0,
            },
        } as unknown as Window;
    });

    it('resolveApprovalPolicyFromConversation prefers stored approvalPolicyId', () => {
        expect(resolveApprovalPolicyFromConversation({
            approvalPolicyId: 'full-access',
            autoApprove: false,
        })).to.equal('full-access');
    });

    it('resolveApprovalPolicyFromConversation maps autoApprove false to request-approval', () => {
        expect(resolveApprovalPolicyFromConversation({ autoApprove: false })).to.equal('request-approval');
    });

    it('extractConversationComposerPrefs reads agent model and mode', () => {
        const prefs = extractConversationComposerPrefs({
            ...baseConv(),
            agentId: 'qaiq',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'claude-sonnet-4' },
            interactionModeId: 'plan',
            approvalPolicyId: 'approve-for-me',
        });
        expect(prefs.agentId).to.equal('qaiq');
        expect(prefs.agentModel?.modelId).to.equal('claude-sonnet-4');
        expect(prefs.interactionModeId).to.equal('plan');
        expect(prefs.approvalPolicyId).to.equal('approve-for-me');
    });

    it('buildUpdateConversationComposerPatch maps approval preset to autoApprove', () => {
        expect(buildUpdateConversationComposerPatch({
            approvalPolicyId: 'request-approval',
        })).to.deep.equal({
            approvalPolicyId: 'request-approval',
            autoApprove: false,
        });
    });

    it('read/write conversation composer draft is scoped by conversation id', () => {
        writeConversationComposerDraft('conv-a', 'draft a');
        writeConversationComposerDraft('conv-b', 'draft b');
        expect(readConversationComposerDraft('conv-a')).to.equal('draft a');
        expect(readConversationComposerDraft('conv-b')).to.equal('draft b');
    });
});
