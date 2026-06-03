// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    ANTIGRAVITY_API_MODELS,
    agentUsesNativeModelCatalog,
    agentUsesSettingsModelCatalog,
    listStaticAntigravityModels,
    listStaticNativeAgentModels,
    parseNativeModelLines,
} from './qaap-agent-native-model-catalog';

describe('qaap-agent-native-model-catalog', () => {
    it('only QAIQ uses the Settings model catalog', () => {
        expect(agentUsesSettingsModelCatalog('qaiq')).to.equal(true);
        expect(agentUsesSettingsModelCatalog('qwen')).to.equal(false);
        expect(agentUsesSettingsModelCatalog('opencode')).to.equal(false);
        expect(agentUsesSettingsModelCatalog('codex')).to.equal(false);
    });

    it('treats other VPS agents as native catalogs', () => {
        expect(agentUsesNativeModelCatalog('opencode')).to.equal(true);
        expect(agentUsesNativeModelCatalog('qwen')).to.equal(true);
        expect(agentUsesNativeModelCatalog('qaiq')).to.equal(false);
        expect(agentUsesNativeModelCatalog('shell')).to.equal(false);
        expect(agentUsesNativeModelCatalog('cursor')).to.equal(false);
    });

    it('parses CLI model lines', () => {
        const models = parseNativeModelLines('opencode', ['  opencode/foo  ', '# comment', 'opencode/foo', 'bar']);
        expect(models.map(m => m.modelId)).to.deep.equal(['opencode/foo', 'bar']);
        expect(models.every(m => m.vendor === 'opencode')).to.equal(true);
    });

    it('lists static fallbacks per agent', () => {
        expect(listStaticNativeAgentModels('codex').length).to.be.greaterThan(0);
        expect(listStaticNativeAgentModels('qwen').map(m => m.modelId)).to.include('qwen3-coder-plus');
        expect(listStaticNativeAgentModels('unknown-agent')).to.deep.equal([]);
    });

    it('lists frontier Claude Code and Codex models', () => {
        const claude = listStaticNativeAgentModels('claude').map(m => m.modelId);
        expect(claude).to.deep.equal([
            'claude-opus-4-8',
            'claude-sonnet-4-6',
            'claude-haiku-4-5',
            'claude-opus-4-7',
            'claude-opus-4-6',
        ]);

        const codex = listStaticNativeAgentModels('codex').map(m => m.modelId);
        expect(codex).to.deep.equal(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini']);
    });

    it('lists Antigravity API models from the CLI /model menu', () => {
        const models = listStaticAntigravityModels('antigravity');
        expect(models).to.have.length(ANTIGRAVITY_API_MODELS.length);
        expect(models.map(m => m.modelId)).to.deep.equal(ANTIGRAVITY_API_MODELS.map(m => m.label));
        expect(models.map(m => m.label)).to.deep.equal(ANTIGRAVITY_API_MODELS.map(m => m.label));
        expect(listStaticNativeAgentModels('gemini').map(m => m.modelId))
            .to.deep.equal(listStaticAntigravityModels('gemini').map(m => m.modelId));
    });
});
