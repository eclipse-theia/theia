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
        expect(normalizeAgentBrandId('  Gemini  ')).to.equal('gemini');
    });

    it('resolveAgentBrand returns svg brands for built-in agents', () => {
        expect(resolveAgentBrand('openclaw')?.label).to.equal('OpenClaw');
        expect(resolveAgentBrand('openclaw')?.svg).to.include('<svg');
        expect(resolveAgentBrand('gemini')?.tone).to.equal('light');
        expect(resolveAgentBrand('codex')?.tone).to.equal('dark');
        expect(resolveAgentBrand('qwen')?.label).to.equal('Qwen Code');
    });

    it('resolveAgentBrand uniquifies gemini mask ids across calls', () => {
        const first = resolveAgentBrand('gemini')?.svg ?? '';
        const second = resolveAgentBrand('gemini')?.svg ?? '';
        expect(first).to.not.equal(second);
        expect(first).to.include('gemini__a-');
        expect(second).to.include('gemini__a-');
    });

    it('resolveAgentBrand returns undefined for unknown ids', () => {
        expect(resolveAgentBrand('unknown-agent')).to.equal(undefined);
        expect(resolveAgentBrand(undefined)).to.equal(undefined);
    });
});
