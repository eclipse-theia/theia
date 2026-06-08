// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveTranscriptInlineApproval } from './qaap-transcript-approval-inline';

describe('resolveTranscriptInlineApproval', () => {
    it('returns the newest pending approval for the open conversation', () => {
        const pending = resolveTranscriptInlineApproval([
            {
                id: 'a1',
                conversationId: 'conv-1',
                cwd: '/repo',
                agentId: 'qaiq',
                conversationTitle: 'Fix auth',
                kind: 'tool',
                toolName: 'Bash',
                summary: 'Run npm test',
                createdAt: 10,
            },
            {
                id: 'a2',
                conversationId: 'conv-1',
                cwd: '/repo',
                agentId: 'qaiq',
                conversationTitle: 'Fix auth',
                kind: 'tool',
                toolName: 'Edit',
                summary: 'Edit src/foo.ts',
                createdAt: 20,
            },
        ], 'conv-1');
        expect(pending?.id).to.equal('a2');
    });
});
