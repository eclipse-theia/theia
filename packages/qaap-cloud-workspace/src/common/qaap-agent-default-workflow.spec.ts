// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { appendAgentDefaultWorkflowToPrompt, buildAgentDefaultWorkflowPromptBlock } from './qaap-agent-default-workflow';

describe('buildAgentDefaultWorkflowPromptBlock', () => {
    it('frames coding work toward PR by default', () => {
        const block = buildAgentDefaultWorkflowPromptBlock();
        expect(block).to.include('reviewable pull request');
        expect(block).to.include('branch');
        expect(block).to.include('verification');
    });
});

describe('appendAgentDefaultWorkflowToPrompt', () => {
    it('prepends the default workflow for agent prompts', () => {
        const result = appendAgentDefaultWorkflowToPrompt('Fix the bug', 'qaiq');
        expect(result).to.include('[QAAP default agent workflow]');
        expect(result).to.include('[QAAP dev preview]');
        expect(result).to.include('Fix the bug');
    });

    it('leaves shell commands unchanged', () => {
        expect(appendAgentDefaultWorkflowToPrompt('npm test', 'shell')).to.equal('npm test');
    });

    it('does not duplicate the workflow block', () => {
        const once = appendAgentDefaultWorkflowToPrompt('Fix the bug', 'codex');
        const twice = appendAgentDefaultWorkflowToPrompt(once, 'codex');
        expect(twice).to.equal(once);
    });
});
