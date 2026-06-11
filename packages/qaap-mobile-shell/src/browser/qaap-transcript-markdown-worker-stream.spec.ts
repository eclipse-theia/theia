// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { computeTranscriptStreamingMarkdownPatch } from './qaap-transcript-markdown-worker-stream';

describe('qaap-transcript-markdown-worker-stream', () => {

    it('computeTranscriptStreamingMarkdownPatch returns undefined on identical lengths', () => {
        const content = `${'Closed.\n\n'.repeat(8)}Tail`;
        const stable = computeTranscriptStreamingMarkdownPatch(content, -1, -1, md => md)?.stableLength ?? 0;
        const again = computeTranscriptStreamingMarkdownPatch(
            content,
            stable,
            content.length,
            md => `<p>${md.length}</p>`,
        );
        expect(again).to.equal(undefined);
    });

    it('computeTranscriptStreamingMarkdownPatch re-renders only the tail when stable boundary is unchanged', () => {
        const prefix = `${'Stable block.\n\n'.repeat(12)}Tail `;
        const first = computeTranscriptStreamingMarkdownPatch(prefix + 'one', -1, -1, md => `<span>${md}</span>`);
        expect(first).to.not.equal(undefined);
        const second = computeTranscriptStreamingMarkdownPatch(
            prefix + 'one-two',
            first!.stableLength,
            prefix.length + 3,
            md => `<span>${md}</span>`,
        );
        expect(second?.frozenHtml).to.equal(undefined);
        expect(second?.tailHtml).to.contain('one-two');
    });
});
