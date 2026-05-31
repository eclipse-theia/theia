// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { appendTeamDelegationToPrompt, buildTeamDelegationPromptBlock } from './qaap-team-delegation';

describe('buildTeamDelegationPromptBlock', () => {
    it('lists available agents except shell', () => {
        const block = buildTeamDelegationPromptBlock(['qaiq', 'codex', 'shell']);
        expect(block).to.include('qaap-task');
        expect(block).to.include('qaiq, codex');
        expect(block).not.to.include('shell');
    });

    it('omits agent hint when only shell is available', () => {
        const block = buildTeamDelegationPromptBlock(['shell']);
        expect(block).to.include('qaap-task');
        expect(block).not.to.include('--agent values');
    });
});

describe('appendTeamDelegationToPrompt', () => {
    it('prepends delegation instructions for agent prompts', () => {
        const result = appendTeamDelegationToPrompt('Fix the bug', 'qaiq', ['qaiq']);
        expect(result).to.include('[Team delegation — qaap-task]');
        expect(result).to.include('Fix the bug');
    });

    it('leaves shell commands unchanged', () => {
        expect(appendTeamDelegationToPrompt('npm test', 'shell', ['qaiq'])).to.equal('npm test');
    });
});
