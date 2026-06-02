// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    normalizeAgentBrandId,
    resolveAgentBrand,
} from './qaap-agent-branding';
import { QAIQ_AGENT_ID, THEIA_CODER_AGENT_ID } from './qaap-agent-task-client';

describe('qaap-agent-branding', () => {

    it('normalizeAgentBrandId maps aliases and legacy ids', () => {
        expect(normalizeAgentBrandId('cursor-agent')).to.equal('cursor');
        expect(normalizeAgentBrandId('openclaude')).to.equal(QAIQ_AGENT_ID);
        expect(normalizeAgentBrandId(THEIA_CODER_AGENT_ID)).to.equal('coder');
        expect(normalizeAgentBrandId('  Antigravity  ')).to.equal('antigravity');
        expect(normalizeAgentBrandId('  Gemini  ')).to.equal('antigravity');
    });

    it('resolveAgentBrand returns svg brands for built-in agents', () => {
        expect(resolveAgentBrand('openclaw')?.label).to.equal('OpenClaw');
        expect(resolveAgentBrand('openclaw')?.svg).to.include('<svg');
        expect(resolveAgentBrand('antigravity')?.tone).to.equal('light');
        expect(resolveAgentBrand('codex')?.tone).to.equal('dark');
        expect(resolveAgentBrand('qwen')?.label).to.equal('Qwen Code');
    });

    it('resolveAgentBrand uniquifies antigravity mask ids across calls', () => {
        const first = resolveAgentBrand('antigravity')?.svg ?? '';
        const second = resolveAgentBrand('antigravity')?.svg ?? '';
        expect(first).to.not.equal(second);
        expect(first).to.include('antigravity__mask0_111_52-');
        expect(second).to.include('antigravity__mask0_111_52-');
    });

    it('resolveAgentBrand returns undefined for unknown ids', () => {
        expect(resolveAgentBrand('unknown-agent')).to.equal(undefined);
        expect(resolveAgentBrand(undefined)).to.equal(undefined);
    });
});
