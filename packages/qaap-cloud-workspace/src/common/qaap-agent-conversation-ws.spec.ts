// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { parseQaapAgentConversationWsClientMessage } from './qaap-agent-conversation-ws';

describe('parseQaapAgentConversationWsClientMessage', () => {
    it('parses cancel frames', () => {
        expect(parseQaapAgentConversationWsClientMessage({
            op: 'cancel',
            conversationId: ' conv-1 ',
        })).to.deep.equal({ op: 'cancel', conversationId: 'conv-1' });
    });

    it('parses ping frames', () => {
        expect(parseQaapAgentConversationWsClientMessage({ op: 'ping' })).to.deep.equal({ op: 'ping' });
    });

    it('rejects malformed frames', () => {
        expect(parseQaapAgentConversationWsClientMessage({ op: 'cancel' })).to.equal(undefined);
        expect(parseQaapAgentConversationWsClientMessage(null)).to.equal(undefined);
    });
});
