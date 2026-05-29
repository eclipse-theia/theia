// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildWorkHubInboxItems,
    compareWorkHubInboxItems,
    conversationQualifiesForWorkHubInbox,
    githubRepoKeysForProjects,
    pullRequestBelongsToProject,
} from '../browser/mobile-work-hub-inbox';
import type { MobileProjectEntry } from '../browser/mobile-projects-types';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';

function project(overrides: Partial<MobileProjectEntry> = {}): MobileProjectEntry {
    return {
        id: 'p1',
        name: 'qaap',
        color: '#ccc',
        branch: 'main',
        status: 'idle',
        task: '',
        progress: 0,
        agents: [],
        lastActive: '',
        tokens: '',
        cost: '',
        pinned: false,
        isCurrent: false,
        github: { owner: 'acme', name: 'qaap', fullName: 'acme/qaap', htmlUrl: '', private: false },
        ...overrides,
    };
}

function pull(overrides: Partial<QaapGithubPullRequestSummary> = {}): QaapGithubPullRequestSummary {
    return {
        owner: 'acme',
        repo: 'qaap',
        number: 42,
        title: 'Add inbox',
        branch: 'feat/inbox',
        base: 'main',
        author: 'dev',
        files: 2,
        adds: 10,
        dels: 1,
        tests: 'unknown',
        htmlUrl: 'https://github.com/acme/qaap/pull/42',
        filesPreview: [],
        updatedAt: '2026-05-01T12:00:00.000Z',
        ...overrides,
    };
}

function conversation(overrides: Partial<QaapAgentConversationSummaryDTO> = {}): QaapAgentConversationSummaryDTO {
    return {
        id: 'c1',
        cwd: '/tmp',
        agentId: 'claude',
        title: 'Work on inbox',
        status: 'idle',
        createdAt: 1,
        updatedAt: 2,
        messageCount: 1,
        ...overrides,
    };
}

describe('mobile-work-hub-inbox', () => {

    it('githubRepoKeysForProjects deduplicates owner/name pairs', () => {
        const keys = githubRepoKeysForProjects([
            project(),
            project({ id: 'p2', github: { owner: 'acme', name: 'qaap', fullName: 'acme/qaap', htmlUrl: '', private: false } }),
            project({ id: 'p3', github: { owner: 'acme', name: 'other', fullName: 'acme/other', htmlUrl: '', private: false } }),
        ]);
        expect(keys).to.deep.equal(['acme/qaap', 'acme/other']);
    });

    it('buildWorkHubInboxItems omits conversations without git activity', () => {
        const items = buildWorkHubInboxItems(
            project(),
            [conversation({ updatedAt: 100 })],
            [pull({ updatedAt: '2026-05-02T00:00:00.000Z' })],
        );
        expect(items).to.have.length(1);
        expect(items[0].kind).to.equal('pullRequest');
    });

    it('buildWorkHubInboxItems includes git-linked conversations and PRs', () => {
        const items = buildWorkHubInboxItems(
            project(),
            [conversation({ updatedAt: 100, hasGitOperation: true })],
            [pull({ updatedAt: '2026-05-02T00:00:00.000Z' })],
        );
        expect(items).to.have.length(2);
        expect(items.some(i => i.kind === 'pullRequest')).to.equal(true);
        expect(items.some(i => i.kind === 'conversation')).to.equal(true);
    });

    it('conversationQualifiesForWorkHubInbox accepts git flag or linked PR', () => {
        expect(conversationQualifiesForWorkHubInbox({})).to.equal(false);
        expect(conversationQualifiesForWorkHubInbox({ hasGitOperation: true })).to.equal(true);
        expect(conversationQualifiesForWorkHubInbox({
            linkedPullRequest: { owner: 'acme', repo: 'qaap', number: 1, branch: 'main' },
        })).to.equal(true);
    });

    it('streaming conversations sort above idle PRs', () => {
        const items = buildWorkHubInboxItems(
            project(),
            [conversation({ status: 'streaming', updatedAt: 1, hasGitOperation: true })],
            [pull({ updatedAt: '2099-01-01T00:00:00.000Z' })],
        );
        expect(items[0].kind).to.equal('conversation');
    });

    it('pullRequestBelongsToProject matches case-insensitively', () => {
        expect(pullRequestBelongsToProject(pull({ owner: 'Acme', repo: 'Qaap' }), project())).to.equal(true);
        expect(pullRequestBelongsToProject(pull({ owner: 'other', repo: 'qaap' }), project())).to.equal(false);
    });

    it('skips standalone PR rows when a conversation is already linked', () => {
        const items = buildWorkHubInboxItems(
            project(),
            [conversation({
                linkedPullRequest: { owner: 'acme', repo: 'qaap', number: 42, branch: 'feat/inbox' },
            })],
            [pull()],
        );
        expect(items.filter(i => i.kind === 'pullRequest')).to.have.length(0);
        expect(items.filter(i => i.kind === 'conversation')).to.have.length(1);
    });

    it('compareWorkHubInboxItems is transitive on priority', () => {
        const a = buildWorkHubInboxItems(project(), [conversation({ status: 'streaming', updatedAt: 1, hasGitOperation: true })], [])[0];
        const b = buildWorkHubInboxItems(project(), [], [pull()])[0];
        expect(compareWorkHubInboxItems(a, b)).to.be.lessThan(0);
    });
});
