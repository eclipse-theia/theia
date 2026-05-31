// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildCreateAgentTaskBody,
    extractBackendAgentMention,
    hashString,
    isQaiqAgent,
    isStickyComposerAgentSelected,
    isTheiaCoderMention,
    stripNonCoderAgentMention,
    normalizeBackendAgentId,
    migrateLegacyBackendAgentId,
    QAIQ_AGENT_ID,
    reconcileSelectedAgent,
    reconcileStickyComposerAgent,
    resolveAgentOptionId,
    resolveBackendAgentForTurn,
    resolveExplicitAgentForSubmit,
    resolveQaapAgentMentionToken,
    SHELL_AGENT_ID,
    shellAgentFallback,
    THEIA_CODER_AGENT_ID,
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
        expect(normalizeBackendAgentId('gemini')).to.equal('gemini');
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

    it('reconcileSelectedAgent upgrades a stored openclaude pick to qaiq', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            shellAgentFallback(),
        ];
        expect(reconcileSelectedAgent('openclaude', agents, 'qaiq', undefined)).to.equal('qaiq');
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

    it('reconcileStickyComposerAgent keeps Coder off the VPS agent list', () => {
        const agents = [
            { id: 'qaiq', label: 'QAIQ', available: true },
            { id: 'codex', label: 'Codex', available: true },
        ];
        expect(reconcileStickyComposerAgent(THEIA_CODER_AGENT_ID, agents, 'qaiq', undefined, true))
            .to.equal(THEIA_CODER_AGENT_ID);
        expect(reconcileStickyComposerAgent('codex', agents, 'qaiq', undefined, true))
            .to.equal('codex');
        expect(reconcileStickyComposerAgent(THEIA_CODER_AGENT_ID, agents, 'qaiq', undefined, false))
            .to.equal('qaiq');
    });

    it('isStickyComposerAgentSelected matches Coder case-insensitively', () => {
        expect(isStickyComposerAgentSelected(THEIA_CODER_AGENT_ID, 'coder', undefined)).to.equal(true);
        expect(isStickyComposerAgentSelected('qaiq', 'codex', undefined)).to.equal(false);
    });

    it('buildCreateAgentTaskBody uses command for shell agent and prompt for others', () => {
        expect(buildCreateAgentTaskBody('ls -la', SHELL_AGENT_ID, '/home'))
            .to.deep.equal({ command: 'ls -la', cwd: '/home' });
        expect(buildCreateAgentTaskBody('fix tests', QAIQ_AGENT_ID, '/home'))
            .to.deep.equal({ prompt: 'fix tests', agent: QAIQ_AGENT_ID, cwd: '/home' });
    });

    it('isQaiqAgent recognizes qaiq and legacy openclaude alias', () => {
        expect(isQaiqAgent('qaiq')).to.be.true;
        expect(isQaiqAgent('openclaude')).to.be.true;
        expect(isQaiqAgent('QAIQ')).to.be.true;
        expect(isQaiqAgent('codex')).to.be.false;
        expect(isQaiqAgent(undefined)).to.be.false;
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
