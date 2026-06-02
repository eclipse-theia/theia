// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    agentSupportsModelPicker,
    agentUsesNativeModelCatalog,
    agentUsesSettingsModelCatalog,
    readStoredAgentModel,
    writeStoredAgentModel,
} from './qaap-agent-model-selection';
import { QAIQ_AGENT_ID, SHELL_AGENT_ID, THEIA_CODER_AGENT_ID } from './qaap-agent-task-client';

describe('qaap-agent-model-selection', () => {
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

    it('agentSupportsModelPicker excludes shell and local Coder', () => {
        expect(agentSupportsModelPicker('aider')).to.be.true;
        expect(agentSupportsModelPicker(SHELL_AGENT_ID)).to.be.false;
        expect(agentSupportsModelPicker(THEIA_CODER_AGENT_ID)).to.be.false;
    });

    it('only QAIQ reads models from Settings; Qwen and others use native catalogs', () => {
        expect(agentUsesSettingsModelCatalog(QAIQ_AGENT_ID)).to.be.true;
        expect(agentUsesSettingsModelCatalog('qwen')).to.be.false;
        expect(agentUsesSettingsModelCatalog('opencode')).to.be.false;
        expect(agentUsesNativeModelCatalog('qwen')).to.be.true;
        expect(agentUsesNativeModelCatalog('opencode')).to.be.true;
        expect(agentUsesNativeModelCatalog(QAIQ_AGENT_ID)).to.be.false;
        expect(agentUsesNativeModelCatalog('cursor')).to.be.false;
        expect(agentSupportsModelPicker('cursor')).to.be.false;
    });

    it('stores models per agent within the same cwd', () => {
        const cwd = '/repo/a';
        const qaiqModel = { provider: 'openai' as const, vendor: 'openrouter', modelId: 'a/b' };
        const aiderModel = { provider: 'openai' as const, vendor: 'nvidia', modelId: 'meta/llama' };
        writeStoredAgentModel(cwd, QAIQ_AGENT_ID, qaiqModel);
        writeStoredAgentModel(cwd, 'aider', aiderModel);
        expect(readStoredAgentModel(cwd, QAIQ_AGENT_ID)).to.deep.equal(qaiqModel);
        expect(readStoredAgentModel(cwd, 'aider')).to.deep.equal(aiderModel);
    });
});
