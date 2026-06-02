// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    QaapOpencodeStreamAccumulator,
    parseOpencodeFormattedLog,
    parseOpencodeLog,
} from './qaap-opencode-stream';

describe('QaapOpencodeStreamAccumulator', () => {

    it('parses tool_use and text JSON events', () => {
        const acc = new QaapOpencodeStreamAccumulator();
        acc.push([
            '{"type":"tool_use","timestamp":1,"sessionID":"s1","part":{"id":"p1","type":"tool","tool":"read","input":{"filePath":"a.ts"},"state":{"status":"completed","output":"ok"}}}',
            '{"type":"text","timestamp":2,"sessionID":"s1","part":{"type":"text","text":"Done."}}',
        ].join('\n') + '\n');
        expect(acc.getSegments()).to.deep.equal([
            {
                type: 'tool',
                toolUseId: 'p1',
                name: 'Read',
                args: '{"filePath":"a.ts"}',
                finished: true,
                result: 'ok',
            },
            { type: 'text', content: 'Done.' },
        ]);
    });

    it('maps reasoning events to thinking segments', () => {
        const acc = new QaapOpencodeStreamAccumulator();
        acc.push('{"type":"reasoning","part":{"type":"reasoning","text":"plan step"}}\n');
        expect(acc.getSegments()).to.deep.equal([{ type: 'thinking', content: 'plan step' }]);
    });
});

describe('parseOpencodeFormattedLog', () => {

    it('splits formatted tool lines from the assistant answer', () => {
        const log = [
            '> build · minimax-m3-free',
            '',
            '→ Read artifacts/mockup-studio/package.json',
            '→ Read artifacts/mockup-studio/src/App.tsx',
            '',
            '$ ls artifacts/mockup-studio/src',
            'Canvas.tsx',
            'LeftPanel.tsx',
            '',
            'Está muy sólida. Resumen breve.',
        ].join('\n');
        const { content, segments } = parseOpencodeFormattedLog(log);
        expect(content).to.equal('Está muy sólida. Resumen breve.');
        expect(segments.filter(segment => segment.type === 'tool')).to.have.length(3);
        const bash = segments.find(segment => segment.type === 'tool' && segment.name === 'Bash');
        expect(bash && bash.type === 'tool' && bash.result).to.include('Canvas.tsx');
    });
});

describe('parseOpencodeLog', () => {

    it('prefers JSON when the log contains OpenCode events', () => {
        const log = '{"type":"text","part":{"type":"text","text":"Hola"}}\n';
        const parsed = parseOpencodeLog(log);
        expect(parsed.segments).to.deep.equal([{ type: 'text', content: 'Hola' }]);
    });

    it('falls back to formatted parsing when JSON is absent', () => {
        const log = '→ Read src/index.ts\n\nHello.';
        const parsed = parseOpencodeLog(log);
        expect(parsed.segments.some(segment => segment.type === 'tool')).to.be.true;
        expect(parsed.content).to.equal('Hello.');
    });
});
