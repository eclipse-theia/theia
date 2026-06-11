// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    classifyTranscriptToolActivityKind,
    excerptTranscriptThought,
    extractInlineDiffPreview,
    extractTranscriptDiffCard,
    hasTranscriptActivityTimeline,
    isTranscriptThoughtExcerptTruncated,
    isTranscriptTodoTool,
    parseTranscriptTodoChecklist,
    resolveTranscriptActivityStats,
    resolveTranscriptThinkingContent,
    resolveTranscriptToolPillDescriptors,
    resolveTranscriptToolRowParts,
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
        expect(classifyTranscriptToolActivityKind('todo_write')).to.equal('tool');
        expect(classifyTranscriptToolActivityKind('TodoWrite')).to.equal('tool');
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

    it('resolves read pill labels from file_path args', () => {
        expect(resolveTranscriptToolPillDescriptors([
            { type: 'tool', toolUseId: 't1', name: 'Read', args: '{"file_path":"src/browser/foo.ts"}', finished: true },
        ], {
            resolvePath: args => {
                try {
                    return JSON.parse(args).file_path as string;
                } catch {
                    return undefined;
                }
            },
        }).map(pill => pill.label)).to.deep.equal(['Read foo.ts']);
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

describe('extractTranscriptDiffCard', () => {
    const diff = [
        '--- a/src/auth.ts',
        '+++ b/src/auth.ts',
        '@@ -10,3 +10,4 @@',
        ' const a = 1;',
        '-const b = 2;',
        '+const b = 3;',
        '+const c = 4;',
        ' done();',
    ].join('\n');

    it('numbers lines from hunk headers and counts the whole diff', () => {
        const card = extractTranscriptDiffCard(diff);
        expect(card).to.not.equal(undefined);
        expect(card!.added).to.equal(2);
        expect(card!.removed).to.equal(1);
        expect(card!.truncated).to.equal(false);
        expect(card!.lines.map(line => [line.kind, line.lineNumber])).to.deep.equal([
            ['remove', 11],
            ['add', 11],
            ['add', 12],
        ]);
    });

    it('keeps full counts when the preview is truncated', () => {
        const big = ['@@ -1,9 +1,9 @@', ...Array.from({ length: 9 }, (_, i) => `+line ${i}`)].join('\n');
        const card = extractTranscriptDiffCard(big, 4);
        expect(card!.lines).to.have.length(4);
        expect(card!.added).to.equal(9);
        expect(card!.truncated).to.equal(true);
    });

    it('works without hunk headers (no line numbers)', () => {
        const card = extractTranscriptDiffCard('+added line\n-removed line');
        expect(card!.lines.map(line => line.lineNumber)).to.deep.equal([undefined, undefined]);
        expect(card!.added).to.equal(1);
        expect(card!.removed).to.equal(1);
    });

    it('returns undefined for non-diff text', () => {
        expect(extractTranscriptDiffCard('just some output\nwith lines')).to.equal(undefined);
    });
});

describe('resolveTranscriptToolRowParts', () => {
    it('builds verb-first parts per activity kind', () => {
        expect(resolveTranscriptToolRowParts('terminal', 'Bash', { command: 'npm run compile' }))
            .to.deep.equal({ verb: 'Ran', detail: 'npm run compile' });
        expect(resolveTranscriptToolRowParts('reading', 'Read', { path: 'src/browser/foo.ts' }))
            .to.deep.equal({ verb: 'Read', detail: 'foo.ts' });
        expect(resolveTranscriptToolRowParts('reading', 'Read', { path: 'packages/qaap-mobile-shell/src/browser/foo.ts' }))
            .to.deep.equal({ verb: 'Read', detail: 'foo.ts' });
        expect(resolveTranscriptToolRowParts('editing', 'Edit'))
            .to.deep.equal({ verb: 'Edited', detail: 'file' });
        expect(resolveTranscriptToolRowParts('tool', 'web_search'))
            .to.deep.equal({ verb: 'Used', detail: 'web search' });
    });

    it('excerpts long commands with collapsed whitespace', () => {
        const long = `npm   run    ${'x'.repeat(80)}`;
        const parts = resolveTranscriptToolRowParts('terminal', 'Bash', { command: long });
        expect(parts.detail.length).to.be.at.most(65);
        expect(parts.detail.endsWith('…')).to.equal(true);
        expect(parts.detail.startsWith('npm run x')).to.equal(true);
    });
});

describe('parseTranscriptTodoChecklist', () => {
    it('parses Claude Code TodoWrite args', () => {
        const args = JSON.stringify({
            todos: [
                { content: 'Fix the bug', status: 'completed', activeForm: 'Fixing the bug' },
                { content: 'Run tests', status: 'in_progress' },
                { content: 'Ship it', status: 'pending' },
            ],
        });
        expect(parseTranscriptTodoChecklist(args)).to.deep.equal([
            { label: 'Fix the bug', status: 'completed' },
            { label: 'Run tests', status: 'in_progress' },
            { label: 'Ship it', status: 'pending' },
        ]);
    });

    it('accepts bare arrays and alternate label keys, defaulting unknown statuses', () => {
        expect(parseTranscriptTodoChecklist(JSON.stringify([
            { subject: 'Alt label', status: 'weird' },
            { title: 'Titled' },
        ]))).to.deep.equal([
            { label: 'Alt label', status: 'pending' },
            { label: 'Titled', status: 'pending' },
        ]);
    });

    it('returns undefined for partial JSON or non-todo payloads', () => {
        expect(parseTranscriptTodoChecklist('{"todos":[{"content":"str')).to.equal(undefined);
        expect(parseTranscriptTodoChecklist('{"path":"foo.ts"}')).to.equal(undefined);
        expect(parseTranscriptTodoChecklist(JSON.stringify({ todos: [{ status: 'pending' }] }))).to.equal(undefined);
    });
});

describe('isTranscriptTodoTool', () => {
    it('matches todo tool name variants only', () => {
        expect(isTranscriptTodoTool('TodoWrite')).to.equal(true);
        expect(isTranscriptTodoTool('todo_write')).to.equal(true);
        expect(isTranscriptTodoTool('Edit')).to.equal(false);
    });
});
