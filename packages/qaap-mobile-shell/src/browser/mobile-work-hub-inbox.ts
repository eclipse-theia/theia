// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { QaapLinkedPullRequest } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectEntry } from './mobile-projects-types';

export function pullRequestKey(pullRequest: { owner: string; repo: string; number: number }): string {
    return `${pullRequest.owner.toLowerCase()}/${pullRequest.repo.toLowerCase()}#${pullRequest.number}`;
}

export function linkedPullRequestKey(link: QaapLinkedPullRequest): string | undefined {
    if (link.number === undefined) {
        return undefined;
    }
    return `${link.owner.toLowerCase()}/${link.repo.toLowerCase()}#${link.number}`;
}

export type MobileWorkHubInboxItem =
    | {
        readonly kind: 'conversation';
        readonly project: MobileProjectEntry;
        readonly summary: QaapAgentConversationSummaryDTO;
        readonly sortAt: number;
        readonly priority: number;
    }
    | {
        readonly kind: 'pullRequest';
        readonly project: MobileProjectEntry;
        readonly pullRequest: QaapGithubPullRequestSummary;
        readonly sortAt: number;
        readonly priority: number;
        readonly agentActivityLabel?: string;
    };

export function githubRepoKeysForProjects(projects: readonly MobileProjectEntry[]): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const project of projects) {
        if (!project.github) {
            continue;
        }
        const key = `${project.github.owner}/${project.github.name}`;
        const normalized = key.toLowerCase();
        if (seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        keys.push(key);
    }
    return keys;
}

export function pullRequestBelongsToProject(
    pullRequest: QaapGithubPullRequestSummary,
    project: MobileProjectEntry,
): boolean {
    if (!project.github) {
        return false;
    }
    return pullRequest.owner.toLowerCase() === project.github.owner.toLowerCase()
        && pullRequest.repo.toLowerCase() === project.github.name.toLowerCase();
}

export function pullRequestSortTime(pullRequest: QaapGithubPullRequestSummary): number {
    const parsed = Date.parse(pullRequest.updatedAt);
    return Number.isFinite(parsed) ? parsed : 0;
}

/** Inbox lists git-related agent threads (not every project chat). */
export function conversationQualifiesForWorkHubInbox(
    summary: Pick<QaapAgentConversationSummaryDTO, 'hasGitOperation' | 'linkedPullRequest'>,
): boolean {
    return !!summary.hasGitOperation || !!summary.linkedPullRequest;
}

export function conversationInboxPriority(summary: QaapAgentConversationSummaryDTO): number {
    if (summary.status === 'streaming') {
        return 3;
    }
    if (summary.status === 'failed') {
        return 2;
    }
    if (summary.priority) {
        return 1;
    }
    return 0;
}

export function buildWorkHubInboxItems(
    project: MobileProjectEntry,
    conversations: readonly QaapAgentConversationSummaryDTO[],
    pullRequests: readonly QaapGithubPullRequestSummary[],
    activeAgentBranch?: string,
): MobileWorkHubInboxItem[] {
    const items: MobileWorkHubInboxItem[] = [];
    for (const summary of conversations) {
        if (!conversationQualifiesForWorkHubInbox(summary)) {
            continue;
        }
        items.push({
            kind: 'conversation',
            project,
            summary,
            sortAt: summary.updatedAt,
            priority: conversationInboxPriority(summary),
        });
    }
    const linkedPrKeys = new Set(
        conversations
            .map(c => c.linkedPullRequest)
            .filter((link): link is QaapLinkedPullRequest => !!link)
            .map(link => linkedPullRequestKey(link))
            .filter((key): key is string => !!key),
    );
    for (const pullRequest of pullRequests) {
        if (!pullRequestBelongsToProject(pullRequest, project)) {
            continue;
        }
        if (linkedPrKeys.has(pullRequestKey(pullRequest))) {
            continue;
        }
        const branchMatch = activeAgentBranch
            && pullRequest.branch.toLowerCase() === activeAgentBranch.toLowerCase();
        const streamingOnRepo = conversations.some(c => c.status === 'streaming');
        items.push({
            kind: 'pullRequest',
            project,
            pullRequest,
            sortAt: pullRequestSortTime(pullRequest),
            priority: branchMatch || streamingOnRepo ? 2 : 0,
            agentActivityLabel: branchMatch && streamingOnRepo ? 'agent-active' : undefined,
        });
    }
    items.sort(compareWorkHubInboxItems);
    return items;
}

export function compareWorkHubInboxItems(a: MobileWorkHubInboxItem, b: MobileWorkHubInboxItem): number {
    if (a.priority !== b.priority) {
        return b.priority - a.priority;
    }
    if (a.sortAt !== b.sortAt) {
        return b.sortAt - a.sortAt;
    }
    if (a.kind !== b.kind) {
        return a.kind === 'pullRequest' ? -1 : 1;
    }
    if (a.kind === 'pullRequest' && b.kind === 'pullRequest') {
        return b.pullRequest.number - a.pullRequest.number;
    }
    return 0;
}

export function pullRequestMatchesQuery(pullRequest: QaapGithubPullRequestSummary, query: string): boolean {
    const haystack = [
        pullRequest.title,
        pullRequest.author,
        pullRequest.branch,
        pullRequest.base,
        `#${pullRequest.number}`,
        String(pullRequest.number),
        `${pullRequest.owner}/${pullRequest.repo}`,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
}
