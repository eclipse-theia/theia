// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    classifyAgentTaskKind,
    resolveEffectiveRequestAgentModel,
    resolveRoutedQaiqModelBinding,
} from './qaap-agent-task-model-routing';

describe('classifyAgentTaskKind', () => {
    it('treats ask mode as exploration', () => {
        expect(classifyAgentTaskKind('anything', 'ask')).to.equal('exploration');
    });

    it('detects implementation prompts', () => {
        expect(classifyAgentTaskKind('Refactor the auth module and open a PR')).to.equal('implementation');
        expect(classifyAgentTaskKind('Implementa el fix y haz commit')).to.equal('implementation');
    });

    it('detects exploration prompts', () => {
        expect(classifyAgentTaskKind('Where is the SSE handler defined?')).to.equal('exploration');
        expect(classifyAgentTaskKind('Explora cómo funciona el runner')).to.equal('exploration');
    });
});

describe('resolveRoutedQaiqModelBinding', () => {
    it('prefers universal alias for exploration', () => {
        const readPref = (key: string): unknown => {
            if (key === 'ai-features.languageModelAliases') {
                return {
                    'default/universal': { selectedModel: 'openrouter/meta-llama/llama-3.3-70b-instruct:free' },
                    'default/code': { selectedModel: 'anthropic/claude-sonnet-4-20250514' },
                };
            }
            return undefined;
        };
        const binding = resolveRoutedQaiqModelBinding(readPref, 'exploration');
        expect(binding?.modelId).to.equal('meta-llama/llama-3.3-70b-instruct:free');
    });

    it('prefers code alias for implementation', () => {
        const readPref = (key: string): unknown => {
            if (key === 'ai-features.languageModelAliases') {
                return {
                    'default/universal': { selectedModel: 'openrouter/meta-llama/llama-3.3-70b-instruct:free' },
                    'default/code': { selectedModel: 'anthropic/claude-sonnet-4-20250514' },
                };
            }
            return undefined;
        };
        const binding = resolveRoutedQaiqModelBinding(readPref, 'implementation');
        expect(binding?.modelId).to.equal('claude-sonnet-4-20250514');
    });
});

describe('resolveEffectiveRequestAgentModel', () => {
    it('keeps an explicit picker model', () => {
        const explicit = { provider: 'anthropic' as const, vendor: 'anthropic', modelId: 'claude-opus' };
        expect(resolveEffectiveRequestAgentModel(
            { prompt: 'explore foo', agentModel: explicit },
            () => undefined,
            'qaiq',
        )).to.deep.equal(explicit);
    });

    it('routes when no explicit model is provided', () => {
        const readPref = (key: string): unknown => {
            if (key === 'ai-features.languageModelAliases') {
                return {
                    'default/code': { selectedModel: 'anthropic/claude-sonnet-4-20250514' },
                };
            }
            return undefined;
        };
        const routed = resolveEffectiveRequestAgentModel(
            { prompt: 'Implement the OAuth callback fix' },
            readPref,
            'qaiq',
        );
        expect(routed?.modelId).to.equal('claude-sonnet-4-20250514');
    });
});
