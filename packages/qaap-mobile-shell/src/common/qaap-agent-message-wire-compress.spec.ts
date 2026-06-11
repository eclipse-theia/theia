// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { deflateRawSync } from 'zlib';
import { expandAgentMessageWireDelta } from './qaap-agent-message-wire-compress';

describe('expandAgentMessageWireDelta', () => {
    it('expands compressed tool result appends when DecompressionStream is available', async function (): Promise<void> {
        if (typeof DecompressionStream === 'undefined') {
            this.skip();
        }
        const large = `${'line\n'.repeat(2000)}END`;
        const encoded = deflateRawSync(Buffer.from(large, 'utf8')).toString('base64');
        const expanded = await expandAgentMessageWireDelta({
            kind: 'patch_tool',
            messageId: 'm1',
            toolUseId: 't1',
            resultAppend: encoded,
            resultAppendEncoding: 'deflate-base64',
        });
        expect(expanded.kind).to.equal('patch_tool');
        if (expanded.kind !== 'patch_tool') {
            return;
        }
        expect(expanded.resultAppend).to.equal(large);
        expect(expanded.resultAppendEncoding).to.equal(undefined);
    });
});
