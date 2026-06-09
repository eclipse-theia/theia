// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { normalizeAgentMessageContentForDisplay, resolveMessagePreviewText } from './qaap-agent-message-content';

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

    it('hides QAIQ system init metadata envelopes', () => {
        const raw = JSON.stringify({
            type: 'system',
            subtype: 'init',
            cwd: '/tmp',
            session_id: 'abc',
            model: 'moonshotai/kimi-k2.6:free',
            tools: ['Bash', 'Read'],
        });
        expect(normalizeAgentMessageContentForDisplay(raw)).to.equal('');
    });

    it('hides QAIQ stream_event process logs with no assistant text', () => {
        const raw = [
            '{"type":"stream_event","event":{"type":"message_start","message":{"role":"assistant","content":[]}}}',
            '{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"}}}',
            '{"type":"result","subtype":"success","is_error":false,"result":""}',
        ].join(' ');
        expect(normalizeAgentMessageContentForDisplay(raw)).to.equal('');
    });

    it('treats missing content as empty text', () => {
        expect(normalizeAgentMessageContentForDisplay(undefined)).to.equal('');
        expect(normalizeAgentMessageContentForDisplay(null)).to.equal('');
    });
});

describe('resolveMessagePreviewText', () => {
    it('falls back to the last text segment when content is a placeholder', () => {
        expect(resolveMessagePreviewText({
            content: '…',
            segments: [{ type: 'text', content: 'Streaming answer' }],
        })).to.equal('Streaming answer');
    });

    it('does not throw when content is undefined', () => {
        expect(resolveMessagePreviewText({
            segments: [{ type: 'thinking', content: 'plan' }],
        })).to.equal('');
    });
});
