// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    normalizeTranscriptCodeText,
    resolveTranscriptCodeLanguage,
} from './qaap-transcript-code-view';

describe('qaap-transcript-code-view', () => {
    it('resolves json from file extension', () => {
        expect(resolveTranscriptCodeLanguage('package.json')).to.equal('json');
    });

    it('resolves grep output from content shape', () => {
        const text = [
            'src/index.ts:12:const value = 1',
            'src/util.ts:4:export function run()',
        ].join('\n');
        expect(resolveTranscriptCodeLanguage(undefined, text)).to.equal('grep');
    });

    it('pretty-prints json before rendering', () => {
        const normalized = normalizeTranscriptCodeText('{"name":"match-pro"}', 'json');
        expect(normalized).to.equal('{\n  "name": "match-pro"\n}');
    });

    it('prefers grep language for ripgrep-style paths', () => {
        expect(resolveTranscriptCodeLanguage('package.json', 'src/index.ts:12:const value = 1')).to.equal('json');
        expect(resolveTranscriptCodeLanguage(undefined, 'src/index.ts:12:const value = 1\nsrc/util.ts:4:export function run()')).to.equal('grep');
    });
});
