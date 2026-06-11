// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    collapseConsecutiveDuplicateParagraphs,
    collapseExactRepeatedText,
    dedupeAgentMessageTextSegments,
    filterQaiqStreamMetadataLines,
    filterQaiqStreamProcessLogLines,
    mergeIncrementalStreamText,
    QaapQaiqStreamAccumulator,
    stripLeadingParagraphsInPriorText,
} from './qaap-qaiq-stream';

describe('mergeIncrementalStreamText', () => {

    it('appends token deltas', () => {
        expect(mergeIncrementalStreamText('Hi', ' there')).to.equal('Hi there');
    });

    it('skips exact duplicate snapshots', () => {
        const text = '¡Hola! Estoy bien.';
        expect(mergeIncrementalStreamText(text, text)).to.equal(text);
    });

    it('adopts cumulative snapshots', () => {
        expect(mergeIncrementalStreamText('part1', 'part1 part2')).to.equal('part1 part2');
    });

    it('ignores shorter duplicate snapshots', () => {
        expect(mergeIncrementalStreamText('part1 part2', 'part1')).to.equal('part1 part2');
    });

    it('collapses a single-chunk doubled snapshot', () => {
        expect(mergeIncrementalStreamText('msg', 'msgmsg')).to.equal('msg');
    });

    it('collapses consecutive duplicate paragraphs', () => {
        const text = 'Hola.\n\nHola.\n\nAhora sigo.';
        expect(collapseConsecutiveDuplicateParagraphs(text)).to.equal('Hola.\n\nAhora sigo.');
    });

    it('strips replayed paragraphs after prior text', () => {
        const prior = 'Hola. Disculpa la confusión anterior.';
        const replay = `${prior}\n\nAhora entiendo el problema.`;
        expect(stripLeadingParagraphsInPriorText(replay, prior)).to.equal('Ahora entiendo el problema.');
    });
});

describe('collapseExactRepeatedText', () => {

    it('collapses a single block repeated twice without a separator', () => {
        const once = '¡Hola! ¿En qué puedo ayudarte hoy con tu proyecto Mockup?';
        expect(collapseExactRepeatedText(`${once}${once}`)).to.equal(once);
    });
});

describe('dedupeAgentMessageTextSegments', () => {

    it('drops a replayed text segment after tool calls', () => {
        const intro = 'Hola. Disculpa la confusión anterior.';
        const deduped = dedupeAgentMessageTextSegments([
            { type: 'text', content: intro },
            { type: 'tool', toolUseId: 't1', name: 'Read', args: '{}', finished: true, result: 'ok' },
            { type: 'text', content: `${intro}\n\nAhora entiendo el problema.` },
        ]);
        expect(deduped).to.deep.equal([
            { type: 'text', content: intro },
            { type: 'tool', toolUseId: 't1', name: 'Read', args: '{}', finished: true, result: 'ok' },
            { type: 'text', content: 'Ahora entiendo el problema.' },
        ]);
    });

    it('drops identical adjacent text segments', () => {
        const intro = 'Hola. Disculpa la confusión anterior.';
        expect(dedupeAgentMessageTextSegments([
            { type: 'text', content: intro },
            { type: 'text', content: intro },
        ])).to.deep.equal([
            { type: 'text', content: intro },
        ]);
    });

    it('collapses duplicated prose inside one text segment', () => {
        const once = '¡Hola! ¿En qué puedo ayudarte hoy con tu proyecto Mockup?';
        expect(dedupeAgentMessageTextSegments([
            { type: 'text', content: `${once}${once}` },
        ])).to.deep.equal([
            { type: 'text', content: once },
        ]);
    });
});

describe('QaapQaiqStreamAccumulator', () => {

    it('ignores system init metadata envelopes', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push([
            '{"type":"system","subtype":"init","cwd":"/tmp","session_id":"abc","tools":["Bash"],"model":"moonshotai/kimi-k2.6:free"}',
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"Hola"}]}}',
        ].join('\n') + '\n');
        expect(acc.getSegments()).to.deep.equal([{ type: 'text', content: 'Hola' }]);
        expect(acc.getDisplayText()).to.equal('Hola');
    });

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

    it('streams tool args from content_block_start and input_json_delta before the tool finishes', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push([
            '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu-edit","name":"Edit","input":{}}}}',
            '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\":\\"src/"}}}',
            '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"config.ts\\"}"}}}',
        ].join('\n') + '\n');
        const segments = acc.getSegments();
        expect(segments).to.have.length(1);
        expect(segments[0]).to.deep.equal({
            type: 'tool',
            toolUseId: 'tu-edit',
            name: 'Edit',
            args: '{"file_path":"src/config.ts"}',
            finished: false,
        });
    });

    it('drops live tool overlay once the timestamped assistant snapshot arrives', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push([
            '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu-read","name":"Read","input":{}}}}',
            '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\":\\"a.ts\\"}"}}}',
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"tool_use","id":"tu-read","name":"Read","input":{"file_path":"a.ts"}}]}}',
        ].join('\n') + '\n');
        expect(acc.getSegments()).to.deep.equal([
            { type: 'tool', toolUseId: 'tu-read', name: 'Read', args: '{"file_path":"a.ts"}', finished: false },
        ]);
    });

    it('skips duplicate timestamped assistant snapshot after stream_event deltas', () => {
        const acc = new QaapQaiqStreamAccumulator();
        const reply = '¡Hola! Estoy bien, gracias por preguntar. ¿En qué puedo ayudarte hoy?';
        acc.push(`{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":${JSON.stringify(reply)}}}}\n`);
        acc.push(`{"type":"assistant","timestamp_ms":2,"message":{"content":[{"type":"text","text":${JSON.stringify(reply)}}]}}\n`);
        expect(acc.getSegments()).to.deep.equal([{ type: 'text', content: reply }]);
        expect(acc.getDisplayText()).to.equal(reply);
    });

    it('adopts cumulative timestamped assistant snapshots', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"part1"}]}}\n');
        acc.push('{"type":"assistant","timestamp_ms":2,"message":{"content":[{"type":"text","text":"part1 part2"}]}}\n');
        expect(acc.getSegments()).to.deep.equal([{ type: 'text', content: 'part1 part2' }]);
    });

    it('skips replayed prose after tool_use blocks in assistant snapshots', () => {
        const acc = new QaapQaiqStreamAccumulator();
        const intro = 'Hola. Disculpa la confusión anterior.';
        acc.push([
            `{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":${JSON.stringify(intro)}}]}}`,
            '{"type":"assistant","timestamp_ms":2,"message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"a.ts"}}]}}',
            '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}',
            `{"type":"assistant","timestamp_ms":3,"message":{"content":[{"type":"text","text":${JSON.stringify(`${intro}\n\nAhora entiendo el problema.`)}},{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"b.ts"}}]}}`,
        ].join('\n') + '\n');
        expect(acc.getSegments()).to.deep.equal([
            { type: 'text', content: intro },
            { type: 'tool', toolUseId: 't1', name: 'Read', args: '{"file_path":"a.ts"}', finished: true, result: 'ok' },
            { type: 'text', content: 'Ahora entiendo el problema.' },
            { type: 'tool', toolUseId: 't2', name: 'Read', args: '{"file_path":"b.ts"}', finished: false },
        ]);
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

    it('adopts success result text when stream deltas were filtered upstream', () => {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push('{"type":"result","subtype":"success","is_error":false,"result":"Hola, ¿en qué puedo ayudarte?"}\n');
        expect(acc.getSegments()).to.deep.equal([
            { type: 'text', content: 'Hola, ¿en qué puedo ayudarte?' },
        ]);
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

describe('filterQaiqStreamProcessLogLines', () => {

    it('strips system init but keeps stream_event text deltas', () => {
        const input = [
            '{"type":"system","subtype":"init","cwd":"/tmp","model":"moonshotai/kimi-k2.6:free"}',
            '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hola"}}}',
        ].join('\n');
        expect(filterQaiqStreamProcessLogLines(input)).to.equal(
            '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hola"}}}',
        );
    });

    it('keeps success result envelopes for final transcript replay', () => {
        const input = [
            '{"type":"system","subtype":"init","cwd":"/tmp"}',
            '{"type":"result","subtype":"success","is_error":false,"result":"Done"}',
        ].join('\n');
        expect(filterQaiqStreamProcessLogLines(input)).to.equal(
            '{"type":"result","subtype":"success","is_error":false,"result":"Done"}',
        );
    });
});

describe('filterQaiqStreamMetadataLines', () => {

    it('strips system init lines but keeps assistant output', () => {
        const input = [
            '{"type":"system","subtype":"init","cwd":"/tmp","model":"moonshotai/kimi-k2.6:free"}',
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"Hola"}]}}',
        ].join('\n');
        expect(filterQaiqStreamMetadataLines(input)).to.equal(
            '{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"Hola"}]}}',
        );
    });
});
