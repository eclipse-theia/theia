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

    it('pairs tool_use with its tool_result and marks finished', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push([
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"tool_use","id":"tu1","name":"bash","input":{"command":"ls"}}]}}',
            '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu1","content":"file.ts"}]}}',
        ].join('\n') + '\n');
        const segments = acc.getSegments();
        expect(segments).to.have.length(1);
        expect(segments[0]).to.deep.equal({
            type: 'tool', toolUseId: 'tu1', name: 'Bash', args: '{"command":"ls"}', finished: true, result: 'file.ts',
        });
    });

    it('marks tool_result with is_error as an error result', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push([
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"tool_use","id":"te1","name":"Read","input":{}}]}}',
            '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"te1","content":"ENOENT","is_error":true}]}}',
        ].join('\n') + '\n');
        const tool = acc.getSegments()[0];
        expect(tool.type).to.equal('tool');
        if (tool.type === 'tool') {
            expect(tool.finished).to.be.true;
            expect(tool.result).to.equal('Error: ENOENT');
        }
    });

    it('parses thinking and redacted_thinking blocks', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push([
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"thinking","thinking":"step 1"}]}}',
            '{"type":"assistant","timestamp_ms":2,"message":{"content":[{"type":"redacted_thinking","data":"redacted"}]}}',
        ].join('\n') + '\n');
        const segments = acc.getSegments();
        expect(segments).to.have.length(1);
        expect(segments[0]).to.deep.equal({ type: 'thinking', content: 'step 1redacted' });
    });

    it('accumulates content split across multiple push() calls', () => {
        const acc = new QaapQaiqStreamAccumulator();
        const line = '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"hello"}]}}\n';
        // Split the line mid-way across two push calls
        const mid = Math.floor(line.length / 2);
        acc.push(line.slice(0, mid));
        acc.push(line.slice(mid));
        expect(acc.getSegments()).to.deep.equal([{ type: 'text', content: 'hello' }]);
    });

    it('appends text from incremental pushes without duplication', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"part1"}]}}\n');
        acc.push('{"type":"assistant","timestamp_ms":2,"message":{"content":[{"type":"text","text":" part2"}]}}\n');
        expect(acc.getSegments()).to.deep.equal([{ type: 'text', content: 'part1 part2' }]);
    });

    it('captures usage from assistant and result envelopes', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"assistant","message":{"usage":{"input_tokens":1200,"output_tokens":80}}}\n');
        expect(acc.getTurnUsage()).to.deep.equal({ inputTokens: 1200, outputTokens: 80 });
        acc.push('{"type":"result","usage":{"input_tokens":1500,"output_tokens":200,"cache_read_input_tokens":100}}\n');
        expect(acc.getTurnUsage()).to.deep.equal({
            inputTokens: 1500,
            outputTokens: 200,
            cacheReadInputTokens: 100,
        });
    });

    it('appends error result text when result type is result with is_error', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"result","is_error":true,"result":"fatal error occurred"}\n');
        const segments = acc.getSegments();
        expect(segments).to.have.length(1);
        expect(segments[0].type).to.equal('text');
        if (segments[0].type === 'text') {
            expect(segments[0].content).to.include('fatal error occurred');
        }
    });

    it('normalizes tool names to canonical casing', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"tool_use","id":"n1","name":"bash","input":{}}]}}\n');
        const seg = acc.getSegments()[0];
        expect(seg.type).to.equal('tool');
        if (seg.type === 'tool') {
            expect(seg.name).to.equal('Bash');
        }
    });
});
