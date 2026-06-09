// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QAAP_AGENTS_HUB_LANDING_ENABLED } from '../common/qaap-agents-hub-landing';
import { normalizeWorkHubViewId } from '../common/qaap-work-hub-surfaces';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectEntry, MobileProjectFilter, MobileProjectsHubView } from './mobile-projects-types';

export interface MobileProjectsHubQueryHost {
    hubView: MobileProjectsHubView;
    projects: MobileProjectEntry[];
    filter: MobileProjectFilter;
    query: string;
    homeMode: boolean;

    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi;
    closeRoutineEditor(): void;
    selectHubLandingView(view: MobileProjectsHubView): void;
}

export class MobileProjectsHubQueryUi {
    constructor(protected readonly host: MobileProjectsHubQueryHost) { }

    applyFilter(projects: MobileProjectEntry[], filter: MobileProjectFilter): MobileProjectEntry[] {
        if (filter === 'pinned') {
            return projects.filter(p => p.pinned);
        }
        if (filter === 'active') {
            return projects.filter(p => p.isCurrent || this.host.conversationIndexUi.isProjectRunning(p));
        }
        return projects;
    }

    applySearch(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        if (!this.host.query) {
            return projects;
        }
        return projects.filter(project => this.projectMatchesSearch(project, this.host.query));
    }

    projectMatchesSearch(project: MobileProjectEntry, query: string): boolean {
        if (project.name.toLowerCase().includes(query)
            || project.branch.toLowerCase().includes(query)
            || project.task.toLowerCase().includes(query)
            || project.github?.fullName.toLowerCase().includes(query)) {
            return true;
        }
        return this.host.conversationIndexUi.conversationsForProject(project).some(c => this.conversationMatchesQuery(c, query));
    }

    conversationMatchesQuery(
        conversation: QaapAgentConversationSummaryDTO,
        query: string,
    ): boolean {
        if (conversation.title.toLowerCase().includes(query)) {
            return true;
        }
        if (conversation.agentId.toLowerCase().includes(query)) {
            return true;
        }
        const preview = conversation.lastMessagePreview?.toLowerCase();
        return !!preview && preview.includes(query);
    }

    projectsForCurrentHubList(): MobileProjectEntry[] {
        const base = (this.host.hubView === 'tasks' || this.host.hubView === 'chat' || this.host.hubView === 'review')
            ? this.host.projects
            : this.applyFilter(this.host.projects, this.host.filter);
        return this.applySearch(base);
    }


    isReviewHubView(): boolean {
        return this.host.hubView === 'review';
    }

    isHomeHubView(): boolean {
        return this.host.hubView === 'home';
    }

    isTasksHubView(): boolean {
        return this.host.hubView === 'tasks';
    }

    isSidebarSecondaryHubView(): boolean {
        return QAAP_AGENTS_HUB_LANDING_ENABLED
            && this.host.homeMode
            && (this.host.hubView === 'routines' || this.host.hubView === 'home' || this.host.hubView === 'workflows');
    }

    navigateBackFromSidebarSecondaryHub(): void {
        this.host.closeRoutineEditor();
        this.host.selectHubLandingView('tasks');
    }

    redirectHubView(view: MobileProjectsHubView): MobileProjectsHubView {
        return normalizeWorkHubViewId(view) as MobileProjectsHubView;
    }

}
