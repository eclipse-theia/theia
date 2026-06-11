// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    compressAgentMessageWireDeltaForWire,
    inflateDeflateBase64ForTests,
} from './qaap-agent-message-wire-compress';

describe('compressAgentMessageWireDeltaForWire', () => {
    it('compresses large tool result appends', () => {
        const large = `${'x'.repeat(5000)}\n${'y'.repeat(5000)}`;
        const delta = compressAgentMessageWireDeltaForWire({
            kind: 'patch_tool',
            messageId: 'm1',
            toolUseId: 't1',
            resultAppend: large,
        });
        expect(delta.kind).to.equal('patch_tool');
        if (delta.kind !== 'patch_tool') {
            return;
        }
        expect(delta.resultAppendEncoding).to.equal('deflate-base64');
        expect(delta.resultAppend?.length ?? 0).to.be.lessThan(large.length);
        const restored = inflateDeflateBase64ForTests(delta.resultAppend ?? '');
        expect(restored).to.equal(large);
    });

    it('leaves small deltas untouched', () => {
        const delta = compressAgentMessageWireDeltaForWire({
            kind: 'append_content',
            messageId: 'm1',
            text: 'hello',
        });
        expect(delta).to.deep.equal({
            kind: 'append_content',
            messageId: 'm1',
            text: 'hello',
        });
    });
});
