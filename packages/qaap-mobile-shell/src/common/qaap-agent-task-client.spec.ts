// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildCreateAgentTaskBody,
    extractBackendAgentMention,
    hashString,
    isOpencodeAgent,
    isQaiqAgent,
    usesStructuredAgentTranscript,
    isStickyComposerAgentSelected,
    isTheiaCoderMention,
    stripNonCoderAgentMention,
    normalizeBackendAgentId,
    migrateLegacyBackendAgentId,
    QAIQ_AGENT_ID,
    readStoredQaiqModel,
    filterQaapComposerAgents,
    mergeComposerAgentPickerOptions,
    filterUiSelectableVpsAgents,
    migrateQaapProductAgentId,
    QAAP_COMPOSER_DEFAULT_AGENT_ID,
    QAAP_PRIMARY_AGENT_ID,
    reconcileSelectedAgent,
    reconcileStickyComposerAgent,
    resolveAgentOptionId,
    resolveBackendAgentForTurn,
    resolveExplicitAgentForSubmit,
    resolveQaapAgentMentionToken,
    resolveStoredAgentModelForSubmit,
    writeStoredAgentModel,
    SHELL_AGENT_ID,
    shellAgentFallback,
    THEIA_CODER_AGENT_ID,
    toQaapCreateAgentTaskQaiqModel,
    writeStoredQaiqModel,
} from './qaap-agent-task-client';

describe('qaap-agent-task-client', () => {

    it('resolveQaapAgentMentionToken lowercases tokens', () => {
        expect(resolveQaapAgentMentionToken('QAIQ')).to.equal('qaiq');
    });

    it('normalizeBackendAgentId recognizes expanded built-in coding agents', () => {
        expect(normalizeBackendAgentId('qaiq')).to.equal('qaiq');
        expect(normalizeBackendAgentId('opencode')).to.equal('opencode');
        expect(normalizeBackendAgentId('goose')).to.equal('goose');
        expect(normalizeBackendAgentId('hermes')).to.equal('hermes');
        expect(normalizeBackendAgentId('openclaw')).to.equal('openclaw');
        expect(normalizeBackendAgentId('cursor')).to.equal('cursor');
        expect(normalizeBackendAgentId('cursor-agent')).to.equal('cursor');
        expect(normalizeBackendAgentId('antigravity')).to.equal('antigravity');
        expect(normalizeBackendAgentId('gemini')).to.equal('antigravity');
        expect(normalizeBackendAgentId('copilot')).to.equal('copilot');
        expect(normalizeBackendAgentId('qwen')).to.equal('qwen');
        expect(normalizeBackendAgentId('kimi')).to.equal('kimi');
        expect(normalizeBackendAgentId('openclaude')).to.equal(undefined);
        expect(normalizeBackendAgentId('claude')).to.equal('claude');
    });

    it('extractBackendAgentMention prefers the last recognized @agent', () => {
        expect(extractBackendAgentMention('@codex hola @qaiq adiós')).to.equal(QAIQ_AGENT_ID);
        expect(extractBackendAgentMention('@opencode revisa la app')).to.equal('opencode');
        expect(extractBackendAgentMention('@cursor-agent fix tests')).to.equal('cursor');
    });

    it('migrateLegacyBackendAgentId maps openclaude storage to qaiq', () => {
        expect(migrateLegacyBackendAgentId('openclaude')).to.equal('qaiq');
        expect(migrateLegacyBackendAgentId('codex')).to.equal('codex');
    });

    it('migrateQaapProductAgentId maps retired Coder defaults to QAIQ', () => {
        expect(migrateQaapProductAgentId('Coder')).to.equal(QAAP_PRIMARY_AGENT_ID);
        expect(migrateQaapProductAgentId('codex')).to.equal('codex');
        expect(migrateQaapProductAgentId('opencode')).to.equal('opencode');
    });

    it('filterQaapComposerAgents exposes selectable VPS agents', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            { id: 'codex', label: 'Codex', available: true },
            shellAgentFallback(),
        ];
        const ids = filterQaapComposerAgents(agents).map(agent => agent.id);
        expect(ids).to.include('qaiq');
        expect(ids).to.include('codex');
        expect(ids).to.not.include('shell');
    });

    it('mergeComposerAgentPickerOptions only lists agents the server detected as installed', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            { id: 'claude', label: 'Claude Code', available: false },
        ];
        const ids = mergeComposerAgentPickerOptions(agents).map(agent => agent.id);
        expect(ids).to.deep.equal(['qaiq']);
    });

    it('reconcileSelectedAgent prefers OpenCode as the composer default', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            { id: 'opencode', label: 'OpenCode', available: true },
            { id: 'codex', label: 'Codex', available: true },
        ];
        expect(reconcileSelectedAgent(undefined, agents, 'codex', undefined)).to.equal('opencode');
    });

    it('reconcileSelectedAgent upgrades a stored openclaude pick to qaiq', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            shellAgentFallback(),
        ];
        expect(reconcileSelectedAgent('openclaude', agents, 'qaiq', undefined)).to.equal('qaiq');
    });

    it('filterUiSelectableVpsAgents hides shell and Cursor Agent', () => {
        const agents = [
            { id: 'codex', label: 'Codex', available: true },
            { id: 'cursor', label: 'Cursor Agent', available: true },
            shellAgentFallback(),
        ];
        expect(filterUiSelectableVpsAgents(agents).map(agent => agent.id)).to.deep.equal(['codex']);
    });

    it('reconcileSelectedAgent skips a stored Cursor Agent pick', () => {
        const storage = new Map<string, string>();
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
        storage.set(`qaap.agentTasks.selectedAgent.${hashString('/repo')}`, 'cursor');
        const agents = [
            { id: 'codex', label: 'Codex', available: true },
            { id: 'cursor', label: 'Cursor Agent', available: true },
            shellAgentFallback(),
        ];
        expect(reconcileSelectedAgent(undefined, agents, 'cursor', '/repo')).to.equal('codex');
    });

    it('resolveExplicitAgentForSubmit prefers @mention over pinned chat agent', () => {
        expect(resolveExplicitAgentForSubmit('hola @codex', { pinnedChatAgentId: 'qaiq' })).to.equal('codex');
        expect(resolveExplicitAgentForSubmit('arregla tests', { pinnedChatAgentId: 'qaiq' })).to.equal('qaiq');
    });

    it('resolveBackendAgentForTurn honors explicit qaiq when not listed on the server', () => {
        const agents = [shellAgentFallback()];
        expect(resolveBackendAgentForTurn('sin mención', agents, {
            explicitAgentId: 'qaiq',
        })).to.equal('qaiq');
    });

    it('reconcileStickyComposerAgent defaults to OpenCode but honors an explicit VPS pick', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            { id: 'opencode', label: 'OpenCode', available: true },
            { id: 'codex', label: 'Codex', available: true },
        ];
        expect(reconcileStickyComposerAgent(THEIA_CODER_AGENT_ID, agents, 'codex', undefined, true))
            .to.equal(QAIQ_AGENT_ID);
        expect(reconcileStickyComposerAgent('codex', agents, 'codex', undefined, true))
            .to.equal('codex');
        expect(reconcileStickyComposerAgent(undefined, agents, 'codex', undefined, false))
            .to.equal(QAAP_COMPOSER_DEFAULT_AGENT_ID);
    });

    it('isStickyComposerAgentSelected matches Coder case-insensitively', () => {
        expect(isStickyComposerAgentSelected(THEIA_CODER_AGENT_ID, 'coder', undefined)).to.equal(true);
        expect(isStickyComposerAgentSelected('qaiq', 'codex', undefined)).to.equal(false);
    });

    it('buildCreateAgentTaskBody uses command for shell agent and prompt for others', () => {
        expect(buildCreateAgentTaskBody('ls -la', SHELL_AGENT_ID, '/home'))
            .to.deep.equal({ command: 'ls -la', cwd: '/home' });
        expect(buildCreateAgentTaskBody('fix tests', 'codex', '/home'))
            .to.deep.equal({ prompt: 'fix tests', agent: 'codex', cwd: '/home' });
    });

    describe('QAIQ model storage', () => {
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

        it('buildCreateAgentTaskBody attaches stored model per agent', () => {
            const cwd = '/tmp/qaap-qaiq-model-test';
            const model = toQaapCreateAgentTaskQaiqModel({
                provider: 'openai',
                vendor: 'openrouter',
                modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
            });
            writeStoredQaiqModel(cwd, model);
            expect(buildCreateAgentTaskBody('fix tests', QAIQ_AGENT_ID, cwd)).to.deep.equal({
                prompt: 'fix tests',
                agent: QAIQ_AGENT_ID,
                cwd,
                agentModel: model,
                qaiqModel: model,
            });
            expect(resolveStoredAgentModelForSubmit('codex', cwd)).to.be.undefined;
            writeStoredAgentModel(cwd, 'aider', model);
            expect(resolveStoredAgentModelForSubmit('aider', cwd)).to.deep.equal(model);
            expect(readStoredQaiqModel(cwd)).to.deep.equal(model);
        });
    });

    it('isQaiqAgent recognizes qaiq and legacy openclaude alias', () => {
        expect(isQaiqAgent('qaiq')).to.be.true;
        expect(isQaiqAgent('openclaude')).to.be.true;
        expect(isQaiqAgent('QAIQ')).to.be.true;
        expect(isQaiqAgent('codex')).to.be.false;
        expect(isQaiqAgent(undefined)).to.be.false;
    });

    it('isOpencodeAgent only matches opencode; other agents stay on raw stdout', () => {
        expect(isOpencodeAgent('opencode')).to.be.true;
        expect(isOpencodeAgent('OpenCode')).to.be.true;
        expect(isOpencodeAgent('codex')).to.be.false;
        expect(isOpencodeAgent('claude')).to.be.false;
        expect(isOpencodeAgent('aider')).to.be.false;
        expect(usesStructuredAgentTranscript('opencode')).to.be.true;
        expect(usesStructuredAgentTranscript('qaiq')).to.be.true;
        expect(usesStructuredAgentTranscript('codex')).to.be.true;
        expect(usesStructuredAgentTranscript('claude')).to.be.true;
        expect(usesStructuredAgentTranscript('antigravity')).to.be.true;
        expect(usesStructuredAgentTranscript('aider')).to.be.false;
    });

    it('isTheiaCoderMention detects @coder prefix in message text', () => {
        expect(isTheiaCoderMention('@Coder fix this')).to.be.true;
        expect(isTheiaCoderMention('@coder')).to.be.true;
        expect(isTheiaCoderMention('please fix this @coder')).to.be.false;
        expect(isTheiaCoderMention('@qaiq do something')).to.be.false;
    });

    it('stripNonCoderAgentMention removes VPS mentions for chat-only Coder', () => {
        expect(stripNonCoderAgentMention('@codex fix tests')).to.equal('fix tests');
        expect(stripNonCoderAgentMention('@Coder keep me')).to.equal('@Coder keep me');
        expect(stripNonCoderAgentMention('plain prompt')).to.equal('plain prompt');
    });

    it('hashString produces stable non-negative base-36 output', () => {
        const a = hashString('hello');
        const b = hashString('hello');
        expect(a).to.equal(b);
        expect(a).to.match(/^[0-9a-z]+$/);
        expect(hashString('hello')).not.to.equal(hashString('world'));
    });

    it('resolveAgentOptionId matches by exact id and built-in alias', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            { id: 'my-custom', label: 'Custom', available: true },
        ];
        expect(resolveAgentOptionId('QAIQ', agents)).to.equal('qaiq');
        expect(resolveAgentOptionId('my-custom', agents)).to.equal('my-custom');
        expect(resolveAgentOptionId('codex', agents)).to.equal('codex');
        expect(resolveAgentOptionId(undefined, agents)).to.be.undefined;
    });

    it('resolveBackendAgentForTurn: @mention beats explicit, explicit beats stored', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            { id: 'codex', label: 'Codex', available: true },
        ];
        expect(resolveBackendAgentForTurn('@codex fix it', agents, { explicitAgentId: 'qaiq' }))
            .to.equal('codex');
        expect(resolveBackendAgentForTurn('fix it', agents, { explicitAgentId: 'codex' }))
            .to.equal('codex');
        expect(resolveBackendAgentForTurn('fix it', agents, { storedAgentId: 'qaiq' }))
            .to.equal('qaiq');
    });
});
