// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveMarkdownStreamStablePrefixLength } from './qaap-transcript-streaming-markdown';

describe('qaap-transcript-streaming-markdown', () => {

    it('resolveMarkdownStreamStablePrefixLength freezes closed paragraphs outside code fences', () => {
        const text = 'Intro line.\n\nOpen **bold';
        expect(resolveMarkdownStreamStablePrefixLength(text)).to.equal('Intro line.\n\n'.length);
    });

    it('resolveMarkdownStreamStablePrefixLength does not split inside a code fence', () => {
        const text = '```ts\nconst a = 1;\n\nstill open';
        expect(resolveMarkdownStreamStablePrefixLength(text)).to.equal(0);
    });
});
