// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { normalizeAgentMessageContentForDisplay } from './qaap-agent-message-content';

describe('normalizeAgentMessageContentForDisplay', () => {
    it('extracts text from Responses-style user messages', () => {
        const raw = JSON.stringify({
            role: 'user',
            content: [
                { type: 'input_text', text: 'Fix the mobile chat rendering.' },
            ],
        });

        expect(normalizeAgentMessageContentForDisplay(raw)).to.equal('Fix the mobile chat rendering.');
    });

    it('extracts output text from assistant message envelopes', () => {
        const raw = JSON.stringify({
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'output_text', text: 'Done.\n\n- Updated chat display' },
            ],
        });

        expect(normalizeAgentMessageContentForDisplay(raw)).to.equal('Done.\n\n- Updated chat display');
    });

    it('joins multiple text blocks without exposing JSON syntax', () => {
        const raw = JSON.stringify({
            role: 'assistant',
            content: [
                { type: 'text', text: 'First' },
                { type: 'output_text', text: 'Second' },
            ],
        });

        expect(normalizeAgentMessageContentForDisplay(raw)).to.equal('First\n\nSecond');
    });

    it('leaves ordinary text and arbitrary JSON unchanged', () => {
        expect(normalizeAgentMessageContentForDisplay('plain **markdown**')).to.equal('plain **markdown**');
        expect(normalizeAgentMessageContentForDisplay('{"command":"npm test"}')).to.equal('{"command":"npm test"}');
    });
});
