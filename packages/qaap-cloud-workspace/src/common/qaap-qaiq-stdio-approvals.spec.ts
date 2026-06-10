// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildQaiqControlResponseLine,
    buildQaiqStdioPromptLine,
    parseQaiqStdioEvent,
} from './qaap-qaiq-stdio-approvals';

describe('qaap-qaiq-stdio-approvals', () => {

    it('parses a can_use_tool control_request', () => {
        const line = JSON.stringify({
            type: 'control_request',
            request_id: 'req-1',
            request: { subtype: 'can_use_tool', tool_name: 'Bash', tool_use_id: 'toolu_1', input: { command: 'npm test' } },
        });
        const event = parseQaiqStdioEvent(line);
        expect(event).to.deep.equal({
            type: 'control-request',
            request: { requestId: 'req-1', toolUseId: 'toolu_1', toolName: 'Bash' },
        });
    });

    it('ignores non-permission control requests and stream noise', () => {
        expect(parseQaiqStdioEvent('plain text output')).to.equal(undefined);
        expect(parseQaiqStdioEvent('{"type":"assistant","message":{}}')).to.equal(undefined);
        expect(parseQaiqStdioEvent(JSON.stringify({
            type: 'control_request',
            request_id: 'req-2',
            request: { subtype: 'hook_callback' },
        }))).to.equal(undefined);
        expect(parseQaiqStdioEvent('{not json')).to.equal(undefined);
    });

    it('detects end-of-turn result and control cancellation', () => {
        expect(parseQaiqStdioEvent('{"type":"result","subtype":"success"}')).to.deep.equal({ type: 'result' });
        expect(parseQaiqStdioEvent('{"type":"control_cancel_request","request_id":"req-3"}'))
            .to.deep.equal({ type: 'control-cancel', requestId: 'req-3' });
    });

    it('builds an NDJSON prompt line for stream-json input', () => {
        const line = buildQaiqStdioPromptLine('fix the build');
        expect(line.endsWith('\n')).to.equal(true);
        const parsed = JSON.parse(line);
        expect(parsed.type).to.equal('user');
        expect(parsed.message).to.deep.equal({ role: 'user', content: 'fix the build' });
        expect(parsed).to.have.property('parent_tool_use_id');
    });

    it('builds allow responses with empty updatedInput (use original)', () => {
        const line = buildQaiqControlResponseLine({ requestId: 'req-1', toolUseId: 'toolu_1' }, 'approve');
        const parsed = JSON.parse(line);
        expect(parsed.type).to.equal('control_response');
        expect(parsed.response.subtype).to.equal('success');
        expect(parsed.response.request_id).to.equal('req-1');
        expect(parsed.response.response).to.deep.equal({ behavior: 'allow', updatedInput: {}, toolUseID: 'toolu_1' });
    });

    it('builds deny responses with guidance for the model', () => {
        const line = buildQaiqControlResponseLine({ requestId: 'req-1' }, 'reject');
        const parsed = JSON.parse(line);
        expect(parsed.response.response.behavior).to.equal('deny');
        expect(parsed.response.response.message).to.contain('declined');
        expect(parsed.response.response).to.not.have.property('toolUseID');
    });
});
