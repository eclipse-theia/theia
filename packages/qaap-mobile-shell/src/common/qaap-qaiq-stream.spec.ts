// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { QaapQaiqStreamAccumulator } from './qaap-qaiq-stream';

describe('QaapQaiqStreamAccumulator', () => {

    it('parses assistant text and tool_use blocks', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push([
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"Hola"}]}}',
            '{"type":"assistant","timestamp_ms":2,"message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"a.ts"}}]}}',
        ].join('\n') + '\n');
        const segments = acc.getSegments();
        expect(segments).to.deep.equal([
            { type: 'text', content: 'Hola' },
            { type: 'tool', toolUseId: 't1', name: 'Read', args: '{"file_path":"a.ts"}', finished: false },
        ]);
    });

    it('merges stream_event text deltas', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n');
        acc.push('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}}\n');
        expect(acc.getSegments()).to.deep.equal([{ type: 'text', content: 'Hi there' }]);
    });

    it('skips buffered assistant flushes after timestamped deltas', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"Live"}]}}\n');
        acc.push('{"type":"assistant","message":{"content":[{"type":"text","text":"Buffered duplicate"}]}}\n');
        expect(acc.getSegments()).to.deep.equal([{ type: 'text', content: 'Live' }]);
    });
});
