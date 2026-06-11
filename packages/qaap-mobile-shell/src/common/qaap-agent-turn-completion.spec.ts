// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentMessageDTO } from './qaap-agent-conversation-client';
import {
    agentMessageDeliversTaskOutcome,
    agentMessageHasOpenTodos,
    buildAgentAutoContinuePrompt,
    isActionableAgentTaskMessage,
    isIncompleteAgentTurn,
} from './qaap-agent-turn-completion';

const RUN_APP_PROMPT = 'Figure out how to build and run this project locally. Start the dev server, confirm it boots cleanly, and report the URL plus any setup steps I should know.';

describe('qaap-agent-turn-completion', () => {

    it('isActionableAgentTaskMessage matches run-app style prompts', () => {
        expect(isActionableAgentTaskMessage(
            'Figure out how to build and run this project locally. Start the dev server.',
        )).to.equal(true);
        expect(isActionableAgentTaskMessage('levanta la app')).to.equal(true);
        expect(isActionableAgentTaskMessage('thanks')).to.equal(false);
    });

    it('isIncompleteAgentTurn detects thinking-only agent stops', () => {
        const agent: QaapAgentMessageDTO = {
            id: 'a1',
            role: 'agent',
            content: '',
            createdAt: 2,
            segments: [{
                type: 'thinking',
                content: 'I will explore the repo.',
            }],
        };
        expect(isIncompleteAgentTurn('Start the dev server and report the URL', agent)).to.equal(true);
        expect(isIncompleteAgentTurn('Start the dev server', {
            ...agent,
            segments: [{
                type: 'text',
                content: 'Dev server is on port 5173.',
            }],
        })).to.equal(false);
    });

    it('isIncompleteAgentTurn detects search-only exploration stops', () => {
        const agent: QaapAgentMessageDTO = {
            id: 'a1',
            role: 'agent',
            content: '',
            createdAt: 2,
            segments: [
                {
                    type: 'thinking',
                    content: 'Need to inspect the repo.',
                },
                {
                    type: 'tool',
                    toolUseId: 't1',
                    name: 'Search',
                    args: '{"query":"package.json"}',
                    finished: true,
                },
                {
                    type: 'tool',
                    toolUseId: 't2',
                    name: 'Grep',
                    args: '{"pattern":"scripts"}',
                    finished: true,
                },
                {
                    type: 'text',
                    content: 'The user wants me to figure out how to build and run this project locally. Let me start by exploring the project structure.',
                },
            ],
        };
        expect(isIncompleteAgentTurn(RUN_APP_PROMPT, agent)).to.equal(true);
        expect(agentMessageDeliversTaskOutcome(RUN_APP_PROMPT, agent)).to.equal(false);
    });

    it('agentMessageDeliversTaskOutcome accepts shell work and preview ports', () => {
        const withShell: QaapAgentMessageDTO = {
            id: 'a2',
            role: 'agent',
            content: '',
            createdAt: 2,
            segments: [{
                type: 'tool',
                toolUseId: 't1',
                name: 'Bash',
                args: '{"command":"pnpm install"}',
                finished: true,
                result: 'done',
            }],
        };
        expect(agentMessageDeliversTaskOutcome(RUN_APP_PROMPT, withShell)).to.equal(true);

        const withPort: QaapAgentMessageDTO = {
            id: 'a3',
            role: 'agent',
            content: 'Dev server is ready on http://localhost:5173/',
            createdAt: 2,
        };
        expect(agentMessageDeliversTaskOutcome(RUN_APP_PROMPT, withPort)).to.equal(true);
    });

    it('buildAgentAutoContinuePrompt nudges tool use', () => {
        expect(buildAgentAutoContinuePrompt()).to.include('Read');
        expect(buildAgentAutoContinuePrompt()).to.include('remaining todo');
        expect(buildAgentAutoContinuePrompt(RUN_APP_PROMPT)).to.include('package.json');
    });

    it('agentMessageHasOpenTodos reads the latest TodoWrite checklist', () => {
        const agent: QaapAgentMessageDTO = {
            id: 'a1',
            role: 'agent',
            content: '',
            createdAt: 2,
            segments: [
                {
                    type: 'tool',
                    toolUseId: 't1',
                    name: 'TodoWrite',
                    args: JSON.stringify({
                        todos: [
                            { content: 'Find component', status: 'completed' },
                            { content: 'Add tests', status: 'pending' },
                        ],
                    }),
                    finished: true,
                },
            ],
        };
        expect(agentMessageHasOpenTodos(agent)).to.equal(true);
        expect(agentMessageHasOpenTodos({
            ...agent,
            segments: [{
                type: 'tool',
                toolUseId: 't2',
                name: 'TodoWrite',
                args: JSON.stringify({
                    todos: [
                        { content: 'Find component', status: 'completed' },
                        { content: 'Add tests', status: 'completed' },
                    ],
                }),
                finished: true,
            }],
        })).to.equal(false);
    });

    it('isIncompleteAgentTurn detects partial todo progress with edits', () => {
        const agent: QaapAgentMessageDTO = {
            id: 'a1',
            role: 'agent',
            content: 'Created one test file.',
            createdAt: 2,
            segments: [
                {
                    type: 'tool',
                    toolUseId: 't1',
                    name: 'TodoWrite',
                    args: JSON.stringify({
                        todos: [
                            { content: 'Locate MovieTimeline.tsx', status: 'completed' },
                            { content: 'Add unit tests', status: 'completed' },
                            { content: 'Add integration tests', status: 'pending' },
                            { content: 'Run test suite', status: 'pending' },
                        ],
                    }),
                    finished: true,
                },
                {
                    type: 'tool',
                    toolUseId: 't2',
                    name: 'Grep',
                    args: '{"pattern":"MovieTimeline"}',
                    finished: true,
                },
                {
                    type: 'tool',
                    toolUseId: 't3',
                    name: 'Write',
                    args: '{"path":"MovieTimeline.spec.ts"}',
                    finished: true,
                },
                {
                    type: 'text',
                    content: 'Created one test file.',
                },
            ],
        };
        const prompt = 'Implement tests for MovieTimeline and run the suite.';
        expect(agentMessageDeliversTaskOutcome(prompt, agent)).to.equal(false);
        expect(isIncompleteAgentTurn(prompt, agent)).to.equal(true);
    });
});
