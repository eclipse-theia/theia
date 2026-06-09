// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT } from './mobile-projects-open';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { QaapComposerSurface } from '../common/qaap-composer-surface';

export interface MobileProjectsRepoLifecycleHost {
    hubView: MobileProjectsHubView;
    root: HTMLElement;
    projects: MobileProjectEntry[];
    projectsService: MobileProjectsService;
    openRepoDialog: MobileOpenRepositoryDialog | undefined;
    stickyComposerHost: HTMLElement;
    stickyComposerDraft: string;
    expandedId: string | undefined;
    soloExpanded: boolean;
    homeMode: boolean;
    conversations: MobileProjectsConversations | undefined;
    delegate: {
        onProjectsChanged?(): void;
        onWorkspaceOpened?(): void;
    };

    openRoutineEditor(): void;
    render(): void;
    renderList(): void;
    openProjectDetail(project: MobileProjectEntry): Promise<void>;
    preferComposerSurface(surface: QaapComposerSurface, projectCwd?: string): void;
    chatServiceSummariesUi: import('./mobile-projects-chat-service-summaries-ui').MobileProjectsChatServiceSummariesUi;
    closeCardMenu(): void;
    cardMenuUi: import('./mobile-projects-card-menu-ui').MobileProjectsCardMenuUi;
}

export class MobileProjectsRepoLifecycleUi {
    constructor(protected readonly host: MobileProjectsRepoLifecycleHost) { }

    async onNewClick(): Promise<void> {
        if (this.host.hubView === 'routines') {
            this.host.openRoutineEditor();
            return;
        }
        if (!this.host.openRepoDialog) {
            this.host.openRepoDialog = new MobileOpenRepositoryDialog(this.host.projectsService, {
                onProjectsChanged: nextProjects => {
                    this.host.projects = nextProjects;
                    this.host.hubView = 'repos';
                    this.host.projectsService.setHubView('repos');
                    this.host.render();
                    this.host.delegate.onProjectsChanged?.();
                },
                onWorkspaceOpened: () => this.host.delegate.onWorkspaceOpened?.(),
            });
            this.host.root.append(this.host.openRepoDialog.node);
        }
        await this.host.openRepoDialog.show();
    }

    async onCloneClick(): Promise<void> {
        this.host.root.classList.add('theia-mod-loading');
        try {
            const nextProjects = await this.host.projectsService.cloneGithubProject();
            if (!nextProjects) {
                return;
            }
            this.host.projects = nextProjects;
            this.host.render();
            this.host.delegate.onProjectsChanged?.();
            this.host.delegate.onWorkspaceOpened?.();
        } finally {
            this.host.root.classList.remove('theia-mod-loading');
        }
    }

    async refreshProjects(): Promise<void> {
        this.host.root.classList.add('theia-mod-loading');
        try {
            this.host.projects = await this.host.projectsService.loadProjects();
            await this.host.conversations?.refreshTheiaChatSessionsForProjects(this.host.projects);
            await this.host.chatServiceSummariesUi.refreshChatServiceSessionSummaries();
            this.host.render();
            this.host.delegate.onProjectsChanged?.();
        } finally {
            this.host.root.classList.remove('theia-mod-loading');
        }
    }

    async onTogglePin(project: MobileProjectEntry): Promise<void> {
        this.host.cardMenuUi.closeCardMenu();
        this.host.projectsService.togglePin(project);
        this.host.projects = await this.host.projectsService.loadProjects();
        this.host.render();
        this.host.delegate.onProjectsChanged?.();
    }

    async openAgentComposer(project: MobileProjectEntry, draft?: string): Promise<void> {
        this.host.cardMenuUi.closeCardMenu();
        const cwd = this.host.projectsService.getProjectCwd(project);
        this.host.preferComposerSurface('task', cwd);
        this.host.stickyComposerDraft = draft ?? this.host.stickyComposerDraft;
        if (this.host.homeMode) {
            await this.host.openProjectDetail(project);
        } else {
            this.host.expandedId = project.id;
            this.host.soloExpanded = true;
            this.host.renderList();
        }
        window.setTimeout(() => {
            const input = this.host.stickyComposerHost.querySelector<HTMLInputElement>(
                '.theia-mobile-projects-sticky-composer-input',
            );
            input?.focus();
        }, 80);
    }

    notifyWorkspaceHubBottomBarRefresh(): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT));
        }
    }

}
