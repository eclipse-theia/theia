// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationDTO, QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';
import { conversationToSummary } from './qaap-agent-conversation-client';
import {
    applyConversationComposerPrefs,
    applyProjectComposerDefaults,
    buildRuntimeComposerPersistPatch,
    extractConversationComposerPrefs,
    extractConversationComposerPrefsFromSummary,
    formatConversationComposerSessionMeta,
    readConversationComposerDraft,
    writeConversationComposerDraft,
} from './qaap-conversation-composer-state';
import { writeStoredAgentModel } from './qaap-agent-task-client';

const baseConv = (): QaapAgentConversationDTO => ({
    id: 'conv-1',
    cwd: '/repo',
    agentId: 'opencode',
    title: 'Test',
    status: 'idle',
    createdAt: 1,
    updatedAt: 2,
    messages: [],
});

describe('qaap-conversation-composer-state', () => {
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

    it('conversationToSummary includes composer prefs fields', () => {
        const summary = conversationToSummary({
            ...baseConv(),
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'claude-sonnet-4' },
            interactionModeId: 'plan',
            approvalPolicyId: 'approve-for-me',
        });
        expect(summary.agentModel?.modelId).to.equal('claude-sonnet-4');
        expect(summary.interactionModeId).to.equal('plan');
        expect(summary.approvalPolicyId).to.equal('approve-for-me');
    });

    it('formatConversationComposerSessionMeta renders agent and model', () => {
        const meta = formatConversationComposerSessionMeta({
            agentId: 'opencode',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'claude-sonnet-4' },
        }, id => id === 'opencode' ? 'OpenCode' : id);
        expect(meta).to.equal('OpenCode · claude-sonnet-4');
    });

    it('extractConversationComposerPrefsFromSummary mirrors full conversation extract', () => {
        const fromSummary = extractConversationComposerPrefsFromSummary({
            cwd: '/repo',
            agentId: 'opencode',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'model-a' },
            interactionModeId: 'plan',
            approvalPolicyId: 'approve-for-me',
        });
        const fromConv = extractConversationComposerPrefs({
            ...baseConv(),
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'model-a' },
            interactionModeId: 'plan',
            approvalPolicyId: 'approve-for-me',
        });
        expect(fromSummary).to.deep.equal(fromConv);
    });

    it('applyConversationComposerPrefs keeps per-conversation model isolated in storage keys', () => {
        const cwd = '/repo';
        applyConversationComposerPrefs({
            agentId: 'opencode',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'model-a' },
            approvalPolicyId: 'approve-for-me',
            toolApprovalRules: {},
            autoApprove: true,
        }, cwd, 'conv-a');
        applyConversationComposerPrefs({
            agentId: 'opencode',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'model-b' },
            approvalPolicyId: 'approve-for-me',
            toolApprovalRules: {},
            autoApprove: true,
        }, cwd, 'conv-b');

        const prefsA = extractConversationComposerPrefsFromSummary({
            cwd,
            agentId: 'opencode',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'model-a' },
        } as QaapAgentConversationSummaryDTO);
        const prefsB = extractConversationComposerPrefsFromSummary({
            cwd,
            agentId: 'opencode',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'model-b' },
        } as QaapAgentConversationSummaryDTO);

        expect(prefsA?.agentModel?.modelId).to.equal('model-a');
        expect(prefsB?.agentModel?.modelId).to.equal('model-b');
        expect(readConversationComposerDraft('conv-a')).to.equal('');
        writeConversationComposerDraft('conv-a', 'draft a');
        writeConversationComposerDraft('conv-b', 'draft b');
        expect(readConversationComposerDraft('conv-a')).to.equal('draft a');
        expect(readConversationComposerDraft('conv-b')).to.equal('draft b');
    });

    it('applyProjectComposerDefaults resets idle composer away from a prior conversation model', () => {
        const cwd = '/repo';
        writeStoredAgentModel(cwd, 'opencode', {
            provider: 'anthropic',
            vendor: 'anthropic',
            modelId: 'project-default',
        });
        applyConversationComposerPrefs({
            agentId: 'opencode',
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'conversation-only' },
            approvalPolicyId: 'approve-for-me',
            toolApprovalRules: {},
            autoApprove: true,
        }, cwd, 'conv-old');

        const runtime = applyProjectComposerDefaults(cwd, 'opencode');
        expect(runtime.conversationId).to.be.undefined;
        expect(runtime.agentModel?.modelId).to.equal('project-default');
    });

    it('buildRuntimeComposerPersistPatch prefers explicit runtime model', () => {
        const patch = buildRuntimeComposerPersistPatch('opencode', '/repo', {
            agentModel: { provider: 'anthropic', vendor: 'anthropic', modelId: 'picked-model' },
            modeId: 'plan',
            approvalPolicyId: 'approve-for-me',
        });
        expect(patch.agentModel?.modelId).to.equal('picked-model');
        expect(patch.interactionModeId).to.equal('plan');
    });
});
