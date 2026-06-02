// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { bindingFromQaiqModelSelection } from './qaap-qaiq-model-binding';
import { formatAiderModelArg, formatModelFlagsForAgent } from './qaap-agent-model-flags';

describe('formatAiderModelArg', () => {
    it('prefixes openrouter and nvidia model ids', () => {
        const openrouter = bindingFromQaiqModelSelection({
            provider: 'openai',
            vendor: 'openrouter',
            modelId: 'anthropic/claude-3.5-sonnet',
        });
        expect(formatAiderModelArg(openrouter)).to.equal('openrouter/anthropic/claude-3.5-sonnet');

        const nvidia = bindingFromQaiqModelSelection({
            provider: 'openai',
            vendor: 'nvidia',
            modelId: 'meta/llama-3.3-70b-instruct',
        });
        expect(formatAiderModelArg(nvidia)).to.equal('openai/meta/llama-3.3-70b-instruct');
    });
});

describe('formatModelFlagsForAgent', () => {
    it('formats qaiq and aider flags differently', () => {
        const binding = bindingFromQaiqModelSelection({
            provider: 'openai',
            vendor: 'openrouter',
            modelId: 'deepseek/deepseek-chat:free',
        });
        expect(formatModelFlagsForAgent('qaiq', binding)).to.equal('--provider openai --model deepseek/deepseek-chat:free');
        expect(formatModelFlagsForAgent('aider', binding)).to.equal('--model openrouter/deepseek/deepseek-chat:free');
    });

    it('uses codex -m and native model id for other CLIs', () => {
        const binding = bindingFromQaiqModelSelection({
            provider: 'openai',
            vendor: 'codex',
            modelId: 'o4-mini',
        });
        expect(formatModelFlagsForAgent('codex', binding)).to.equal('-m o4-mini');
        expect(formatModelFlagsForAgent('opencode', binding)).to.equal('--model o4-mini');
    });
});
