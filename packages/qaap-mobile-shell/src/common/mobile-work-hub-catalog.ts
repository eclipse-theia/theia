// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type WorkHubCatalogHubTarget = 'home' | 'repos' | 'chat' | 'tasks' | 'review' | 'diff';

export type WorkHubCatalogAction =
    | { readonly type: 'command'; readonly commandId: string }
    | { readonly type: 'hub-view'; readonly view: WorkHubCatalogHubTarget }
    | { readonly type: 'replay-tutorial' };

export interface WorkHubCatalogItem {
    readonly id: string;
    readonly sectionId: string;
    readonly title: string;
    readonly subtitle: string;
    readonly meta?: string;
    /** 0–1 completion for the progress bar; omit when not started. */
    readonly progress?: number;
    readonly iconClass: string;
    readonly accent?: string;
    readonly action: WorkHubCatalogAction;
    readonly searchText: string;
}

export interface WorkHubCatalogSection {
    readonly id: string;
    readonly title: string;
    readonly items: readonly WorkHubCatalogItem[];
}

/** Onboarding cards shown in the Work Hub account menu (avatar). */
export const QAAP_WORK_HUB_GETTING_STARTED: WorkHubCatalogSection = {
    id: 'start',
    title: 'Getting started',
    items: [
        {
            id: 'workflow-work-hub',
            sectionId: 'start',
            title: 'Navigate the Work Hub',
            subtitle: 'Projects, inbox, and opening a repository workspace.',
            meta: '3 steps · ~4 min',
            progress: 0.33,
            iconClass: 'codicon-home',
            action: { type: 'hub-view', view: 'home' },
            searchText: 'work hub home dashboard projects repositories',
        },
        {
            id: 'workflow-github',
            sectionId: 'start',
            title: 'Connect GitHub',
            subtitle: 'Sign in to load pull requests and sync your repos.',
            meta: '1 step',
            iconClass: 'codicon-github',
            action: { type: 'hub-view', view: 'tasks' },
            searchText: 'github sign in pull requests inbox',
        },
        {
            id: 'workflow-mobile-tour',
            sectionId: 'start',
            title: 'Mobile walkthrough',
            subtitle: 'Replay the narrow-viewport tutorial for gestures and the agent bar.',
            meta: 'Interactive',
            iconClass: 'codicon-device-mobile',
            action: { type: 'replay-tutorial' },
            searchText: 'tutorial onboarding mobile gestures',
        },
    ],
};

export const QAAP_WORK_HUB_WORKFLOWS: readonly WorkHubCatalogSection[] = [
    {
        id: 'agentic',
        title: 'Agent workflows',
        items: [
            {
                id: 'workflow-inbox',
                sectionId: 'agentic',
                title: 'Triage with Inbox',
                subtitle: 'See open PRs and streaming agent threads across every project.',
                meta: 'Inbox tab',
                iconClass: 'codicon-inbox',
                action: { type: 'hub-view', view: 'tasks' },
                searchText: 'inbox chats pull requests agents',
            },
            {
                id: 'workflow-diff',
                sectionId: 'agentic',
                title: 'Review working changes',
                subtitle: 'Accept or reject edits per file from the Work Hub diff surface.',
                meta: 'Diff view',
                iconClass: 'codicon-diff',
                action: { type: 'hub-view', view: 'diff' },
                searchText: 'diff review changes accept reject',
            },
            {
                id: 'workflow-review-prs',
                sectionId: 'agentic',
                title: 'Review pull requests',
                subtitle: 'Browse open PRs across linked repos and swipe through file diffs.',
                meta: 'Review tab',
                iconClass: 'codicon-git-pull-request',
                action: { type: 'hub-view', view: 'review' },
                searchText: 'pull request pr review github merge',
            },
            {
                id: 'workflow-team',
                sectionId: 'agentic',
                title: 'Team dashboard',
                subtitle: 'See leaders and subtasks spawned via qaap-task across every project.',
                meta: 'Team tab',
                iconClass: 'codicon-organization',
                action: { type: 'hub-view', view: 'tasks' },
                searchText: 'team agents dashboard subtasks qaap-task leader',
            },
            {
                id: 'workflow-agents',
                sectionId: 'agentic',
                title: 'Run a VPS agent',
                subtitle: 'Open a project, pick @qiq or @codex, and ship from the sticky composer.',
                meta: 'Per-repo chats',
                iconClass: 'codicon-sparkle',
                action: { type: 'hub-view', view: 'repos' },
                searchText: 'agent qiq codex composer chat task',
            },
        ],
    },
];

export function filterCatalogSections(
    sections: readonly WorkHubCatalogSection[],
    query: string,
): WorkHubCatalogSection[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return [...sections];
    }
    const filtered: WorkHubCatalogSection[] = [];
    for (const section of sections) {
        const items = section.items.filter(item =>
            item.title.toLowerCase().includes(normalized)
            || item.subtitle.toLowerCase().includes(normalized)
            || item.searchText.toLowerCase().includes(normalized)
            || (item.meta?.toLowerCase().includes(normalized) ?? false),
        );
        if (items.length > 0) {
            filtered.push({ ...section, items });
        }
    }
    return filtered;
}

export function countCatalogItems(sections: readonly WorkHubCatalogSection[]): number {
    return sections.reduce((sum, section) => sum + section.items.length, 0);
}
