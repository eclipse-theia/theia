// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Same command ids as the IDE welcome quick actions / settings. */
export const QAAP_WORK_HUB_COLOR_THEME_COMMAND = 'workbench.action.selectTheme';
export const QAAP_WORK_HUB_AI_FEATURES_COMMAND = 'ai-chat-ui.show-settings';
export const QAAP_WORK_HUB_AI_CONFIGURATION_COMMAND = 'aiConfiguration:open';
/** Default tab when opening AI Configuration from the Work Hub account menu. */
export const QAAP_WORK_HUB_AI_CONFIGURATION_AGENTS_TAB = 'ai-agent-configuration-container-widget';

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
            id: 'workflow-color-theme',
            sectionId: 'start',
            title: 'Color Theme',
            subtitle: 'Switch light, dark, or high contrast color themes.',
            iconClass: 'codicon-color-mode',
            action: { type: 'command', commandId: QAAP_WORK_HUB_COLOR_THEME_COMMAND },
            searchText: 'color theme light dark high contrast appearance',
        },
        {
            id: 'workflow-ai-features',
            sectionId: 'start',
            title: 'AI Features',
            subtitle: 'API keys, models, agents, and chat defaults.',
            iconClass: 'codicon-sparkle',
            action: { type: 'command', commandId: QAAP_WORK_HUB_AI_FEATURES_COMMAND },
            searchText: 'ai features settings api keys models agents chat',
        },
        {
            id: 'workflow-ai-configuration',
            sectionId: 'start',
            title: 'AI Configuration',
            subtitle: 'Agents, prompts, MCP servers, and model aliases.',
            iconClass: 'codicon-hubot',
            action: { type: 'command', commandId: QAAP_WORK_HUB_AI_CONFIGURATION_COMMAND },
            searchText: 'ai configuration agents variables mcp prompt fragments model aliases tools skills',
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
                title: 'Triage agent handoffs',
                subtitle: 'See running threads, blockers, and open PRs across every project.',
                meta: 'Inbox tab',
                iconClass: 'codicon-inbox',
                action: { type: 'hub-view', view: 'tasks' },
                searchText: 'inbox chats pull requests agents handoffs blockers',
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
                title: 'Finish the PR',
                subtitle: 'Browse open PRs, review files, and keep checks visible from mobile.',
                meta: 'Review tab',
                iconClass: 'codicon-git-pull-request',
                action: { type: 'hub-view', view: 'review' },
                searchText: 'pull request pr review github merge checks files',
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
                title: 'Delegate to an agent',
                subtitle: 'Open a repo, pick @qiq or @codex, and push the work toward a reviewable branch.',
                meta: 'Per-repo chats',
                iconClass: 'codicon-sparkle',
                action: { type: 'hub-view', view: 'repos' },
                searchText: 'agent qiq codex composer chat task branch review',
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
