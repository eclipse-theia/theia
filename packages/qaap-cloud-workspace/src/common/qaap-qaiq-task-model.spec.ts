// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyQaapQaiqCredentialEnv,
    bindingFromQaiqModelSelection,
    formatQaiqProviderFlags,
} from './qaap-qaiq-model-binding';

/** Mirrors {@link QaapAgentTaskRunner.buildTemplateVars} for QAIQ. */
function buildQaiqTemplateFlags(model: {
    readonly provider: 'openai';
    readonly vendor: string;
    readonly modelId: string;
}): string {
    return formatQaiqProviderFlags(bindingFromQaiqModelSelection(model));
}

describe('QAIQ explicit model selection end-to-end', () => {
    it('uses picker model in CLI flags and OpenRouter credentials', () => {
        const model = {
            provider: 'openai' as const,
            vendor: 'openrouter',
            modelId: 'anthropic/claude-3.5-sonnet',
        };
        expect(buildQaiqTemplateFlags(model)).to.equal('--provider openai --model anthropic/claude-3.5-sonnet');

        const env: NodeJS.ProcessEnv = {};
        const binding = bindingFromQaiqModelSelection(model);
        applyQaapQaiqCredentialEnv(env, binding, key => {
            if (key === 'ai-features.openrouter.openrouterApiKey') {
                return 'sk-or-test';
            }
            if (key === 'ai-features.openrouter.openrouterBaseUrl') {
                return 'https://openrouter.example/v1';
            }
            return undefined;
        });
        expect(env.OPENROUTER_API_KEY).to.equal('sk-or-test');
        expect(env.OPENAI_BASE_URL).to.equal('https://openrouter.example/v1');
    });

    it('uses NVIDIA credentials when vendor is nvidia', () => {
        const model = {
            provider: 'openai' as const,
            vendor: 'nvidia',
            modelId: 'meta/llama-3.3-70b-instruct',
        };
        const env: NodeJS.ProcessEnv = {};
        applyQaapQaiqCredentialEnv(env, bindingFromQaiqModelSelection(model), key => {
            if (key === 'ai-features.nvidia.nvidiaApiKey') {
                return 'nvapi-test';
            }
            return undefined;
        });
        expect(env.NVIDIA_API_KEY).to.equal('nvapi-test');
        expect(env.OPENAI_API_KEY).to.equal('nvapi-test');
        expect(buildQaiqTemplateFlags(model)).to.equal('--provider openai --model meta/llama-3.3-70b-instruct');
    });
});
