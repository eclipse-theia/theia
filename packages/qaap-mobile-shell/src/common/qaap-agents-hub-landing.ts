// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';

/** When true, the Work Hub Agents tab uses the unified execution shell (tabs + transcript + composer). */
export const QAAP_AGENTS_HUB_LANDING_ENABLED = true;

/** Optional recent rows below an empty workspace transcript (not on the Agents tab landing). */
export const QAAP_AGENTS_HUB_RECENT_LIMIT = 3;

/** Placeholder conversation id while no session is open on the Agents tab. */
export const QAAP_AGENTS_HUB_IDLE_CONVERSATION_ID = '__qaap_agents_hub_idle__';

export function isAgentsHubIdleConversationSummary(summary: QaapAgentConversationSummaryDTO): boolean {
    return summary.id === QAAP_AGENTS_HUB_IDLE_CONVERSATION_ID;
}

/**
 * True when the Agents tab has painted execution content — not merely the landing CSS class
 * ({@code theia-mod-agents-hub-landing}), which is applied before the inline shell mounts.
 */
export function isAgentsHubExecutionSurfacePainted(
    agentsHubShellActive: boolean,
    scroll: ParentNode,
): boolean {
    if (agentsHubShellActive) {
        return true;
    }
    return scroll.querySelector(
        '.theia-mobile-agents-hub-inline-execution, .theia-mobile-tasks-hub-root.theia-mod-agents-loading, .theia-mobile-agent-transcript-empty',
    ) !== null;
}

export function buildAgentsHubIdleConversationSummary(cwd: string): QaapAgentConversationSummaryDTO {
    return {
        id: QAAP_AGENTS_HUB_IDLE_CONVERSATION_ID,
        cwd,
        workspacePath: cwd,
        agentId: 'task',
        title: '',
        status: 'idle',
        createdAt: 0,
        updatedAt: Date.now(),
        messageCount: 0,
    };
}

/** One-tap starter prompt shown in the empty Agents transcript (fills the sticky composer). */
export interface QaapAgentsHubQuickAction {
    readonly id: string;
    readonly icon: string;
    readonly labelKey: string;
    readonly labelDefault: string;
    readonly promptKey: string;
    readonly promptDefault: string;
}

export const QAAP_AGENTS_HUB_QUICK_ACTIONS: readonly QaapAgentsHubQuickAction[] = [
    {
        id: 'fix-bug',
        icon: 'bug',
        labelKey: 'qaap/agentsHub/quickAction/fixBug',
        labelDefault: 'Fix a bug',
        promptKey: 'qaap/agentsHub/quickAction/fixBugPrompt',
        promptDefault: 'Find and fix a bug in this project. Reproduce the issue, explain the root cause, and apply a minimal fix.',
    },
    {
        id: 'review-pr',
        icon: 'git-pull-request',
        labelKey: 'qaap/agentsHub/quickAction/reviewPr',
        labelDefault: 'Review PR',
        promptKey: 'qaap/agentsHub/quickAction/reviewPrPrompt',
        promptDefault: 'Review the latest pull request: summarize changes, flag risks, and suggest concrete improvements.',
    },
    {
        id: 'add-tests',
        icon: 'beaker',
        labelKey: 'qaap/agentsHub/quickAction/addTests',
        labelDefault: 'Add tests',
        promptKey: 'qaap/agentsHub/quickAction/addTestsPrompt',
        promptDefault: 'Add tests for the most important untested behavior in this codebase. Identify gaps first, then implement focused coverage.',
    },
    {
        id: 'explore',
        icon: 'search',
        labelKey: 'qaap/agentsHub/quickAction/explore',
        labelDefault: 'Explore code',
        promptKey: 'qaap/agentsHub/quickAction/explorePrompt',
        promptDefault: 'Explore this codebase and give me a concise overview of the architecture, key modules, and how to run the project.',
    },
    {
        id: 'run-app',
        icon: 'rocket',
        labelKey: 'qaap/agentsHub/quickAction/runApp',
        labelDefault: 'Run app',
        promptKey: 'qaap/agentsHub/quickAction/runAppPrompt',
        promptDefault: 'Figure out how to build and run this project locally. Start the dev server, confirm it boots cleanly, and report the URL plus any setup steps I should know.',
    },
];
