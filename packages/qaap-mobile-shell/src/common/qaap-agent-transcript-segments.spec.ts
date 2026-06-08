// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    classifyTranscriptToolActivityKind,
    excerptTranscriptThought,
    extractInlineDiffPreview,
    hasTranscriptActivityTimeline,
    isTranscriptThoughtExcerptTruncated,
    resolveTranscriptActivityStats,
    resolveTranscriptThinkingContent,
    resolveTranscriptToolPillDescriptors,
    shouldOpenTranscriptToolDetails,
    shouldRenderTranscriptToolSegmentInline,
} from './qaap-agent-transcript-segments';

describe('hasTranscriptActivityTimeline', () => {
    it('returns false for empty segments', () => {
        expect(hasTranscriptActivityTimeline([])).to.equal(false);
    });

    it('returns true when tools or thinking are present', () => {
        expect(hasTranscriptActivityTimeline([{ type: 'tool' }])).to.equal(true);
        expect(hasTranscriptActivityTimeline([{ type: 'thinking', content: 'plan' }])).to.equal(true);
    });

    it('returns true when only response text is present', () => {
        expect(hasTranscriptActivityTimeline([{ type: 'text', content: 'Hello' }])).to.equal(true);
    });

    it('ignores blank thinking segments', () => {
        expect(hasTranscriptActivityTimeline([{ type: 'thinking', content: '   ' }])).to.equal(false);
    });
});

describe('shouldRenderTranscriptToolSegmentInline', () => {
    it('always renders when no activity timeline is shown', () => {
        expect(shouldRenderTranscriptToolSegmentInline({
            activityTimelineShown: false,
            finished: true,
            resultFailed: false,
        })).to.equal(true);
    });

    it('renders unfinished tools while the timeline covers completed ones', () => {
        expect(shouldRenderTranscriptToolSegmentInline({
            activityTimelineShown: true,
            finished: false,
            resultFailed: false,
        })).to.equal(true);
    });

    it('renders failed finished tools for inline inspection', () => {
        expect(shouldRenderTranscriptToolSegmentInline({
            activityTimelineShown: true,
            finished: true,
            resultFailed: true,
        })).to.equal(true);
    });

    it('omits finished successful tools when the timeline is shown', () => {
        expect(shouldRenderTranscriptToolSegmentInline({
            activityTimelineShown: true,
            finished: true,
            resultFailed: false,
        })).to.equal(false);
    });
});

describe('shouldOpenTranscriptToolDetails', () => {
    it('opens while the tool is still running', () => {
        expect(shouldOpenTranscriptToolDetails({
            finished: false,
            resultFailed: false,
        })).to.equal(true);
    });

    it('opens finished tools when the result failed', () => {
        expect(shouldOpenTranscriptToolDetails({
            finished: true,
            resultFailed: true,
        })).to.equal(true);
    });

    it('collapses finished successful tools', () => {
        expect(shouldOpenTranscriptToolDetails({
            finished: true,
            resultFailed: false,
        })).to.equal(false);
    });
});

describe('classifyTranscriptToolActivityKind', () => {
    it('maps common tool names to activity buckets', () => {
        expect(classifyTranscriptToolActivityKind('Read')).to.equal('reading');
        expect(classifyTranscriptToolActivityKind('Grep')).to.equal('searching');
        expect(classifyTranscriptToolActivityKind('Bash')).to.equal('terminal');
        expect(classifyTranscriptToolActivityKind('Edit')).to.equal('editing');
        expect(classifyTranscriptToolActivityKind('todo_write')).to.equal('editing');
        expect(classifyTranscriptToolActivityKind('custom_tool')).to.equal('tool');
    });
});

describe('resolveTranscriptActivityStats', () => {
    it('counts tool calls by activity bucket', () => {
        expect(resolveTranscriptActivityStats([
            { type: 'tool', name: 'Read' },
            { type: 'tool', name: 'Read' },
            { type: 'tool', name: 'Grep' },
            { type: 'tool', name: 'Bash' },
            { type: 'tool', name: 'Edit' },
        ])).to.deep.equal({
            fileReads: 2,
            searches: 1,
            shells: 1,
            edits: 1,
            otherTools: 0,
        });
    });
});

describe('resolveTranscriptThinkingContent', () => {
    it('joins non-empty thinking segments', () => {
        expect(resolveTranscriptThinkingContent([
            { type: 'thinking', content: 'Plan A' },
            { type: 'thinking', content: 'Plan B' },
        ])).to.equal('Plan A\n\nPlan B');
    });

    it('returns undefined when no thinking is present', () => {
        expect(resolveTranscriptThinkingContent([{ type: 'tool', name: 'Read' }])).to.equal(undefined);
    });
});

describe('extractInlineDiffPreview', () => {
    it('parses unified diff hunks into add/remove lines', () => {
        const text = [
            '--- a/src/foo.ts',
            '+++ b/src/foo.ts',
            '@@ -1,3 +1,3 @@',
            '-const old = 1;',
            '+const next = 2;',
            ' context line',
        ].join('\n');
        expect(extractInlineDiffPreview(text)).to.deep.equal([
            { kind: 'remove', text: 'const old = 1;' },
            { kind: 'add', text: 'const next = 2;' },
            { kind: 'context', text: 'context line' },
        ]);
    });
});

describe('resolveTranscriptToolPillDescriptors', () => {
    it('builds compact labels from tool segments', () => {
        expect(resolveTranscriptToolPillDescriptors([
            { type: 'tool', toolUseId: 't1', name: 'Read', args: '{"path":"src/auth.ts"}', finished: true },
            { type: 'tool', toolUseId: 't2', name: 'Edit', args: '{"path":"src/auth.ts"}', finished: true, result: '+added\n-removed' },
        ], {
            resolvePath: args => {
                try {
                    return JSON.parse(args).path as string;
                } catch {
                    return undefined;
                }
            },
        }).map(pill => pill.label)).to.deep.equal(['Read auth.ts', 'Edit auth.ts']);
    });
});

describe('excerptTranscriptThought', () => {
    it('collapses whitespace and truncates long thoughts', () => {
        const long = 'word '.repeat(80);
        expect(excerptTranscriptThought('  hello\nworld  ')).to.equal('hello world');
        expect(excerptTranscriptThought(long).endsWith('…')).to.equal(true);
        expect(isTranscriptThoughtExcerptTruncated(long)).to.equal(true);
    });
});
