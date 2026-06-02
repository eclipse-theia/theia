// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    agentUsesNativeModelCatalog,
    agentUsesSettingsModelCatalog,
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
});
