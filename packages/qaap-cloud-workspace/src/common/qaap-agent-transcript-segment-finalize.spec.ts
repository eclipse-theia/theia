// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { finalizeUnfinishedAgentToolSegments } from './qaap-agent-transcript-segment-finalize';

describe('qaap-agent-transcript-segment-finalize', () => {
    it('marks unfinished tools finished with an interruption reason', () => {
        const segments = finalizeUnfinishedAgentToolSegments([
            { type: 'text', content: 'hello' },
            { type: 'tool', toolUseId: 't1', name: 'WebSearch', args: '{}', finished: false },
        ], 'Agent failed (exit 1).');
        expect(segments?.[1]).to.deep.equal({
            type: 'tool',
            toolUseId: 't1',
            name: 'WebSearch',
            args: '{}',
            finished: true,
            result: 'Agent failed (exit 1).',
        });
    });

    it('preserves existing tool results', () => {
        const segments = finalizeUnfinishedAgentToolSegments([
            { type: 'tool', toolUseId: 't1', name: 'Read', args: '{}', finished: false, result: 'partial' },
        ], 'Turn cancelled.');
        expect(segments?.[0]?.type === 'tool' && segments[0].result).to.equal('partial');
        expect(segments?.[0]?.type === 'tool' && segments[0].finished).to.equal(true);
    });
});
