// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationDTO } from './qaap-agent-conversation-client';
import {
    conversationAwaitingDevPreview,
    conversationHasActiveDevServerRun,
    conversationHasActiveShellRun,
    conversationRequestsDevPreview,
    extractDevPreviewUrlFromAgentText,
    findTranscriptPreviewPortHint,
    isLikelyDevServerShellCommand,
    messageRequestsDevPreview,
    transcriptPreviewProbePorts,
} from './qaap-transcript-preview-offer';

describe('qaap-transcript-preview-offer', () => {

    it('extractDevPreviewUrlFromAgentText accepts localhost URLs and port hints', () => {
        expect(extractDevPreviewUrlFromAgentText('Local: http://localhost:5173/', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5173/');
        expect(extractDevPreviewUrlFromAgentText('Use port 4321', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/4321/');
    });

    it('isLikelyDevServerShellCommand matches common dev commands', () => {
        expect(isLikelyDevServerShellCommand('pnpm dev')).to.equal(true);
        expect(isLikelyDevServerShellCommand('npm run start')).to.equal(true);
        expect(isLikelyDevServerShellCommand('pnpm install')).to.equal(false);
    });

    it('messageRequestsDevPreview matches run-app landing prompt', () => {
        expect(messageRequestsDevPreview(
            'Figure out how to build and run this project locally. Start the dev server, confirm it boots cleanly, and report the URL plus any setup steps I should know.',
        )).to.equal(true);
    });

    it('messageRequestsDevPreview matches Spanish and launch-style prompts', () => {
        expect(messageRequestsDevPreview('levanta la app')).to.equal(true);
        expect(messageRequestsDevPreview('Inicia el servidor de desarrollo y dime el puerto')).to.equal(true);
        expect(messageRequestsDevPreview('Launch the app so I can preview it')).to.equal(true);
        expect(messageRequestsDevPreview('refactor the auth module')).to.equal(false);
    });

    it('conversationRequestsDevPreview reads the latest user turn', () => {
        const conv: QaapAgentConversationDTO = {
            id: 'c3',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 'Run',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            messages: [{
                id: 'u1',
                role: 'user',
                content: 'Start the dev server and report the URL',
                createdAt: 1,
            }, {
                id: 'a1',
                role: 'agent',
                content: 'Exploring project…',
                createdAt: 2,
            }],
        };
        expect(conversationRequestsDevPreview(conv)).to.equal(true);
    });

    it('conversationHasActiveDevServerRun detects unfinished bash dev tools', () => {
        const conv: QaapAgentConversationDTO = {
            id: 'c1',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 'Run',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 2,
                segments: [{
                    type: 'tool',
                    toolUseId: 't1',
                    name: 'Bash',
                    args: '{"command":"pnpm dev"}',
                    finished: false,
                }],
            }],
        };
        expect(conversationHasActiveDevServerRun(conv)).to.equal(true);
        expect(findTranscriptPreviewPortHint(conv)).to.equal(undefined);
        expect(transcriptPreviewProbePorts(conv)[0]).to.equal(5173);
    });

    it('transcriptPreviewProbePorts skips default ports while agent is still working', () => {
        const conv: QaapAgentConversationDTO = {
            id: 'c4',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 'Run',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            messages: [{
                id: 'u1',
                role: 'user',
                content: 'levanta la app',
                createdAt: 1,
            }, {
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 2,
                segments: [{
                    type: 'thinking',
                    content: 'Revisando el proyecto…',
                }],
            }],
        };
        expect(transcriptPreviewProbePorts(conv)).to.deep.equal([]);
    });

    it('conversationHasActiveShellRun detects unfinished shell tools', () => {
        const conv: QaapAgentConversationDTO = {
            id: 'c2',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 'Run',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 2,
                segments: [{
                    type: 'tool',
                    toolUseId: 't1',
                    name: 'Bash',
                    args: '{"command":"pnpm"}',
                    finished: false,
                }],
            }],
        };
        expect(conversationHasActiveShellRun(conv)).to.equal(true);
        expect(conversationHasActiveDevServerRun(conv)).to.equal(false);
        expect(conversationAwaitingDevPreview(conv)).to.equal(true);
    });
});
