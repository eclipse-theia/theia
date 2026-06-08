// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildConversationListMetrics,
    conversationMessagesHaveGitOperation,
    conversationTurnProgressRatio,
    formatToolActivityLabel,
    parseDiffStatsFromText,
    textInvokesGit,
} from './qaap-agent-conversation-list-metrics';

describe('textInvokesGit', () => {
    it('detects git commands in shell text and JSON args', () => {
        expect(textInvokesGit('git status')).to.equal(true);
        expect(textInvokesGit('cd repo && git push origin main')).to.equal(true);
        expect(textInvokesGit('{"command":"git diff --stat"}')).to.equal(true);
    });

    it('ignores unrelated words and empty input', () => {
        expect(textInvokesGit('')).to.equal(false);
        expect(textInvokesGit('github.com/org/repo')).to.equal(false);
        expect(textInvokesGit('legit refactor')).to.equal(false);
    });
});

describe('conversationMessagesHaveGitOperation', () => {
    it('sets hasGitOperation via buildConversationListMetrics when git ran in a tool', () => {
        expect(conversationMessagesHaveGitOperation([
            {
                role: 'agent',
                content: '',
                createdAt: 1,
                segments: [{
                    type: 'tool',
                    toolUseId: 'tu1',
                    name: 'Bash',
                    args: '{"command":"git commit -m fix"}',
                    finished: true,
                }],
            },
        ])).to.equal(true);
        const metrics = buildConversationListMetrics({
            status: 'idle',
            messages: [{
                role: 'user',
                content: 'please run git pull',
                createdAt: 1,
            }],
        });
        expect(metrics.hasGitOperation).to.equal(true);
    });
});

describe('parseDiffStatsFromText', () => {
    it('parses git combined insert/delete summary', () => {
        expect(parseDiffStatsFromText('3 files changed, 12 insertions(+), 23 deletions(-)'))
            .to.deep.equal({ added: 12, removed: 23 });
    });

    it('parses singular forms (1 insertion, 1 deletion)', () => {
        expect(parseDiffStatsFromText('1 file changed, 1 insertion(+), 1 deletion(-)'))
            .to.deep.equal({ added: 1, removed: 1 });
    });

    it('parses insertions-only summary', () => {
        expect(parseDiffStatsFromText('2 files changed, 8 insertions(+)'))
            .to.deep.equal({ added: 8, removed: 0 });
    });

    it('parses deletions-only summary', () => {
        expect(parseDiffStatsFromText('1 file changed, 4 deletions(-)'))
            .to.deep.equal({ added: 0, removed: 4 });
    });

    it('parses cursor-style +N -M', () => {
        expect(parseDiffStatsFromText('summary +12 -23 done'))
            .to.deep.equal({ added: 12, removed: 23 });
    });

    it('parses cursor-style with en-dash', () => {
        expect(parseDiffStatsFromText('+5 –23'))
            .to.deep.equal({ added: 5, removed: 23 });
    });

    it('returns undefined for empty or non-diff text', () => {
        expect(parseDiffStatsFromText('')).to.be.undefined;
        expect(parseDiffStatsFromText('no changes')).to.be.undefined;
    });
});

describe('formatToolActivityLabel', () => {
    it('maps search tools to Searching', () => {
        expect(formatToolActivityLabel('Grep')).to.equal('Searching');
        expect(formatToolActivityLabel('web_search')).to.equal('Searching');
        expect(formatToolActivityLabel('Glob')).to.equal('Searching');
    });

    it('maps pure Read tools to a minimal Read label', () => {
        expect(formatToolActivityLabel('Read')).to.equal('Read');
        expect(formatToolActivityLabel('list_dir')).to.equal('Reading files');
    });

    it('maps bash/shell tools to Running command', () => {
        expect(formatToolActivityLabel('Bash')).to.equal('Running command');
        expect(formatToolActivityLabel('run_command')).to.equal('Running command');
    });

    it('maps write/edit tools to Editing', () => {
        expect(formatToolActivityLabel('Edit')).to.equal('Editing');
        expect(formatToolActivityLabel('Write')).to.equal('Editing');
        expect(formatToolActivityLabel('patch')).to.equal('Editing');
    });

    it('maps think tools to Thinking', () => {
        expect(formatToolActivityLabel('think')).to.equal('Thinking');
    });

    it('humanizes unknown tool names by replacing underscores', () => {
        expect(formatToolActivityLabel('custom_tool')).to.equal('custom tool');
    });

    it('returns Working for empty string', () => {
        expect(formatToolActivityLabel('')).to.equal('Working');
    });

    it('returns Working when tool name is missing during streaming', () => {
        expect(formatToolActivityLabel(undefined)).to.equal('Working');
        expect(formatToolActivityLabel(null)).to.equal('Working');
    });

    it('enriches edit label with last two path segments from JSON args', () => {
        expect(formatToolActivityLabel('str_replace_editor', '{"path":"src/auth/login.ts"}')).to.equal('Editing auth/login.ts');
        expect(formatToolActivityLabel('Edit', '{"path":"packages/core/src/app.ts"}')).to.equal('Editing src/app.ts');
    });

    it('enriches bash label with command from JSON args', () => {
        expect(formatToolActivityLabel('Bash', '{"command":"npm test"}')).to.equal('Running: npm test');
    });

    it('enriches search label with pattern from JSON args', () => {
        expect(formatToolActivityLabel('Grep', '{"pattern":"findIndex"}')).to.equal('Searching: findIndex');
    });

    it('enriches read label with basename and line range from JSON args', () => {
        expect(formatToolActivityLabel('Read', '{"file_path":"src/index.ts"}')).to.equal('Read index.ts');
        expect(formatToolActivityLabel('Read', '{"file_path":"mobile-projects-panel.ts","offset":2505,"limit":50}'))
            .to.equal('Read mobile-projects-panel.ts L2505-2554');
    });

    it('falls back to generic label when args is not valid JSON', () => {
        expect(formatToolActivityLabel('Bash', 'not json')).to.equal('Running command');
        expect(formatToolActivityLabel('Edit', 'partial {')).to.equal('Editing');
    });

    it('falls back to generic label when args has no recognised detail field', () => {
        expect(formatToolActivityLabel('Bash', '{"timeout":30}')).to.equal('Running command');
    });
});

describe('buildConversationListMetrics', () => {
    it('exposes streaming activity and turn start', () => {
        const metrics = buildConversationListMetrics({
            status: 'streaming',
            messages: [
                { role: 'user', content: 'fix tests', createdAt: 1000 },
                {
                    role: 'agent',
                    content: '',
                    createdAt: 1100,
                    segments: [{
                        type: 'tool',
                        toolUseId: 't1',
                        name: 'Grep',
                        args: 'pattern',
                        finished: false,
                    }],
                },
            ],
        });
        expect(metrics.activityLabel).to.equal('Searching');
        expect(metrics.turnStartedAt).to.equal(1000);
        expect(metrics.turnProgressCurrent).to.equal(1);
        expect(metrics.turnProgressTotal).to.equal(1);
    });

    it('counts finished and active tools in the current turn', () => {
        const metrics = buildConversationListMetrics({
            status: 'streaming',
            messages: [
                { role: 'user', content: 'go', createdAt: 1000 },
                {
                    role: 'agent',
                    content: '',
                    createdAt: 1100,
                    segments: [
                        {
                            type: 'tool',
                            toolUseId: 't1',
                            name: 'Read',
                            args: '{}',
                            finished: true,
                        },
                        {
                            type: 'tool',
                            toolUseId: 't2',
                            name: 'Read',
                            args: '{}',
                            finished: true,
                        },
                        {
                            type: 'tool',
                            toolUseId: 't3',
                            name: 'Read',
                            args: '{}',
                            finished: true,
                        },
                        {
                            type: 'tool',
                            toolUseId: 't4',
                            name: 'Read',
                            args: '{}',
                            finished: true,
                        },
                        {
                            type: 'tool',
                            toolUseId: 't5',
                            name: 'Grep',
                            args: '{}',
                            finished: false,
                        },
                        {
                            type: 'tool',
                            toolUseId: 't6',
                            name: 'Bash',
                            args: '{}',
                            finished: false,
                        },
                    ],
                },
            ],
        });
        expect(metrics.turnProgressCurrent).to.equal(5);
        expect(metrics.turnProgressTotal).to.equal(6);
    });

    it('estimates early-turn progress before tools appear', () => {
        const metrics = buildConversationListMetrics({
            status: 'streaming',
            messages: [
                { role: 'user', content: 'plan', createdAt: 2000 },
                {
                    role: 'agent',
                    content: '',
                    createdAt: 2100,
                    segments: [{ type: 'thinking', content: 'hmm' }],
                },
            ],
        });
        expect(metrics.turnProgressCurrent).to.equal(2);
        expect(metrics.turnProgressTotal).to.equal(6);
    });

    it('shows Thinking when last segment is thinking and no text yet', () => {
        const metrics = buildConversationListMetrics({
            status: 'streaming',
            messages: [
                { role: 'user', content: 'plan it', createdAt: 2000 },
                {
                    role: 'agent',
                    content: '',
                    createdAt: 2100,
                    segments: [{ type: 'thinking', content: 'considering options' }],
                },
            ],
        });
        expect(metrics.activityLabel).to.equal('Thinking');
    });

    it('exposes diff stats and duration for a completed turn', () => {
        const metrics = buildConversationListMetrics({
            status: 'idle',
            messages: [
                { role: 'user', content: 'ship it', createdAt: 1000 },
                {
                    role: 'agent',
                    content: 'done\n3 files changed, 5 insertions(+), 2 deletions(-)',
                    createdAt: 5000,
                },
            ],
        });
        expect(metrics.linesAdded).to.equal(5);
        expect(metrics.linesRemoved).to.equal(2);
        expect(metrics.lastTurnDurationMs).to.equal(4000);
    });

    it('accumulates diff stats across all turns in the conversation', () => {
        const metrics = buildConversationListMetrics({
            status: 'idle',
            messages: [
                { role: 'user', content: 'first', createdAt: 1000 },
                {
                    role: 'agent',
                    content: '3 files changed, 2 insertions(+), 1 deletions(-)',
                    createdAt: 2000,
                },
                { role: 'user', content: 'second', createdAt: 3000 },
                {
                    role: 'agent',
                    content: 'more work +3 -4',
                    createdAt: 4000,
                },
            ],
        });
        expect(metrics.linesAdded).to.equal(5);
        expect(metrics.linesRemoved).to.equal(5);
    });

    it('reads diff stats from tool result segments', () => {
        const metrics = buildConversationListMetrics({
            status: 'idle',
            messages: [
                { role: 'user', content: 'commit', createdAt: 1000 },
                {
                    role: 'agent',
                    content: '',
                    createdAt: 2000,
                    segments: [{
                        type: 'tool',
                        toolUseId: 'tu1',
                        name: 'Bash',
                        args: 'git diff --stat',
                        finished: true,
                        result: '1 file changed, 3 insertions(+), 1 deletions(-)',
                    }],
                },
            ],
        });
        expect(metrics.linesAdded).to.equal(3);
        expect(metrics.linesRemoved).to.equal(1);
    });

    it('returns no activity label when no active tool is running', () => {
        const metrics = buildConversationListMetrics({
            status: 'streaming',
            messages: [
                { role: 'user', content: 'hi', createdAt: 1000 },
                {
                    role: 'agent',
                    content: 'sure',
                    createdAt: 1100,
                    segments: [{ type: 'text', content: 'sure' }],
                },
            ],
        });
        expect(metrics.activityLabel).to.be.undefined;
    });

    it('returns empty metrics for failed status with no messages', () => {
        const metrics = buildConversationListMetrics({ status: 'failed', messages: [] });
        expect(metrics.activityLabel).to.be.undefined;
        expect(metrics.linesAdded).to.be.undefined;
        expect(metrics.lastTurnDurationMs).to.be.undefined;
    });

    it('returns no duration when agent message precedes user message', () => {
        const metrics = buildConversationListMetrics({
            status: 'idle',
            messages: [
                { role: 'agent', content: 'welcome', createdAt: 500 },
                { role: 'user', content: 'hi', createdAt: 1000 },
            ],
        });
        expect(metrics.lastTurnDurationMs).to.be.undefined;
    });
});

describe('conversationTurnProgressRatio', () => {
    it('clamps to a 0..1 range', () => {
        expect(conversationTurnProgressRatio(4, 6)).to.be.closeTo(4 / 6, 0.001);
        expect(conversationTurnProgressRatio(0, 0)).to.equal(0);
        expect(conversationTurnProgressRatio(8, 6)).to.equal(1);
    });
});
