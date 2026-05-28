// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    extractBackendAgentMention,
    isStickyComposerAgentSelected,
    normalizeBackendAgentId,
    migrateLegacyBackendAgentId,
    QAIQ_AGENT_ID,
    reconcileSelectedAgent,
    reconcileStickyComposerAgent,
    resolveBackendAgentForTurn,
    resolveExplicitAgentForSubmit,
    resolveQaapAgentMentionToken,
    shellAgentFallback,
    THEIA_CODER_AGENT_ID,
} from './qaap-agent-task-client';

describe('qaap-agent-task-client', () => {

    it('resolveQaapAgentMentionToken lowercases tokens', () => {
        expect(resolveQaapAgentMentionToken('QAIQ')).to.equal('qaiq');
    });

    it('normalizeBackendAgentId recognizes qaiq only as built-in coding agent', () => {
        expect(normalizeBackendAgentId('qaiq')).to.equal('qaiq');
        expect(normalizeBackendAgentId('opencode')).to.equal(undefined);
        expect(normalizeBackendAgentId('openclaude')).to.equal(undefined);
        expect(normalizeBackendAgentId('claude')).to.equal('claude');
    });

    it('extractBackendAgentMention prefers the last recognized @agent', () => {
        expect(extractBackendAgentMention('@codex hola @qaiq adiós')).to.equal(QAIQ_AGENT_ID);
        expect(extractBackendAgentMention('@opencode revisa la app')).to.equal(undefined);
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
});
