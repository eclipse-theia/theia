// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapComposerSurface } from '../common/qaap-composer-surface';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';
import type { QaapDiffProjectTab } from './mobile-projects-diff-hub-ui';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';

/** Panel surface for Work Hub landing tab switches. */
export interface MobileProjectsHubLandingHost {
    hubView: MobileProjectsHubView;
    tasksHubSurface: QaapComposerSurface;
    agentsHubLegacyInbox: boolean;
    expandedId: string | undefined;
    soloExpanded: boolean;
    diffPendingPreferredProjectId: string | undefined;
    diffScopedToProject: boolean;
    diffReturnProjectId: string | undefined;
    diffProjectTabs: QaapDiffProjectTab[];
    projects: MobileProjectEntry[];
    diffActiveProjectId: string | undefined;
    visible: boolean;
    inboxLoadGeneration: number;
    inboxPullRequestsLoaded: boolean;
    scroll: HTMLElement;
    projectsService: MobileProjectsService;
    conversations: MobileProjectsConversations | undefined;
    activeTasks: MobileProjectsActiveTasks | undefined;
    inboxStream: MobileWorkHubInboxStream | undefined;
    delegate: {
        onHubLandingViewChanged?(): void;
        onProjectsChanged?(): void;
    };

    transcriptSheetUi: import('./mobile-projects-transcript-sheet-ui').MobileProjectsTranscriptSheetUi;
    isProjectDiffView(): boolean;
    show(options?: { preferredHubView?: MobileProjectsHubView }): Promise<void>;
    hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
    refreshHomeHubData(force?: boolean): void;
    scheduleChatHubListRefreshAfterSummaries(): void;
    refreshTasksHubApprovals(forceRender?: boolean): void;
    render(): void;
    syncLandingHubListChrome(): void;
    subscribeToInboxStream(): void;
    refreshInboxPullRequests(projects?: import('./mobile-projects-types').MobileProjectEntry[], force?: boolean): Promise<void>;
    refreshWorkHubRoutines(force?: boolean): Promise<void>;
    refreshDiffHubView(): Promise<void>;
    detachDiffReviewWidget(): void;
}

/** Work Hub landing view switches (repos, tasks, diff, etc.). */
export class MobileProjectsHubLandingUi {

    constructor(protected readonly host: MobileProjectsHubLandingHost) { }

    selectHubLandingView(
        view: MobileProjectsHubView,
        preferredDiffProjectId?: string,
        options?: { force?: boolean },
    ): void {
        this.host.transcriptSheetUi.closeTranscriptSheet();
        if (view === 'chat' || view === 'tasks') {
            // Chat surface removed — both legacy entry points land on the agentic Task surface.
            this.host.tasksHubSurface = 'task';
        }
        if (view === 'tasks') {
            this.host.agentsHubLegacyInbox = false;
        }
        view = this.host.hubQueryUi.redirectHubView(view);
        const force = options?.force === true;
        if (!force && this.host.hubView === view && view === 'home') {
            this.host.refreshHomeHubData(true);
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.host.hubView === view && view === 'repos' && this.host.expandedId === undefined) {
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.host.hubView === view && view === 'diff' && !preferredDiffProjectId) {
            void this.host.refreshDiffHubView();
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.host.hubView === view && view === 'chat') {
            this.host.scheduleChatHubListRefreshAfterSummaries();
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.host.hubView === view && view === 'tasks') {
            this.host.conversations?.start();
            this.host.activeTasks?.start();
            this.host.refreshTasksHubApprovals(false);
            this.host.render();
            this.host.syncLandingHubListChrome();
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.host.hubView === view && view === 'review') {
            this.host.conversations?.start();
            this.host.inboxStream?.start();
            this.host.subscribeToInboxStream();
            void this.host.refreshInboxPullRequests(undefined, true);
            this.host.render();
            this.host.syncLandingHubListChrome();
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.host.hubView === view && view === 'workflows') {
            this.host.render();
            this.host.syncLandingHubListChrome();
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.host.hubView === view && view === 'routines') {
            void this.host.refreshWorkHubRoutines(true);
            this.host.syncLandingHubListChrome();
            this.host.delegate.onHubLandingViewChanged?.();
            return;
        }
        this.host.hubView = view;
        if (view !== 'home') {
            this.host.projectsService.setHubView(view);
        }
        this.host.expandedId = undefined;
        this.host.soloExpanded = false;
        if (view === 'home') {
            this.host.refreshHomeHubData(true);
        }
        if (view === 'routines') {
            void this.host.refreshWorkHubRoutines(true);
        }
        if (view === 'chat') {
            this.host.scheduleChatHubListRefreshAfterSummaries();
        }
        if (view === 'review') {
            this.host.inboxLoadGeneration++;
            this.host.inboxPullRequestsLoaded = false;
            this.host.inboxStream?.start();
            this.host.subscribeToInboxStream();
            this.host.conversations?.start();
            void this.host.refreshInboxPullRequests(undefined, true);
        }
        if (view === 'tasks') {
            this.host.activeTasks?.start();
            this.host.conversations?.start();
            this.host.refreshTasksHubApprovals(true);
        }
        if (view === 'diff') {
            this.host.diffPendingPreferredProjectId = preferredDiffProjectId;
        } else {
            this.host.diffScopedToProject = false;
            this.host.diffReturnProjectId = undefined;
        }
        this.host.render();
        this.host.syncLandingHubListChrome();
        this.host.scroll.scrollTop = 0;
        this.host.delegate.onHubLandingViewChanged?.();
        if (view === 'diff') {
            void this.host.refreshDiffHubView();
        } else {
            this.host.detachDiffReviewWidget();
        }
    }

    /** Bottom-bar hub tabs: switch landing view without reloading from persisted hub state. */
    navigateHubTab(view: MobileProjectsHubView): void {
        if (view === 'tasks') {
            this.host.agentsHubLegacyInbox = false;
            this.host.tasksHubSurface = 'task';
        }
        this.selectHubLandingView(view, undefined, { force: true });
    }

    async openDiffView(preferredProjectId?: string): Promise<void> {
        if (!this.host.visible) {
            await this.host.show();
        }
        this.host.diffScopedToProject = false;
        this.host.diffReturnProjectId = undefined;
        this.selectHubLandingView('diff', preferredProjectId);
    }

    async openProjectDiffView(preferredProjectId?: string): Promise<void> {
        if (!this.host.visible) {
            await this.host.show();
        }
        const projectId = preferredProjectId
            ?? this.host.projects.find(p => p.isCurrent)?.id;
        this.host.diffScopedToProject = true;
        this.host.diffReturnProjectId = projectId;
        this.selectHubLandingView('diff', projectId);
    }

    closeProjectDiffView(): void {
        if (!this.host.isProjectDiffView()) {
            return;
        }
        this.host.diffScopedToProject = false;
        this.host.hubView = 'repos';
        this.host.projectsService.setHubView('repos');
        this.host.diffPendingPreferredProjectId = undefined;
        this.host.diffProjectTabs = [];
        this.host.diffActiveProjectId = undefined;
        if (this.host.diffReturnProjectId) {
            this.host.expandedId = this.host.diffReturnProjectId;
            this.host.soloExpanded = true;
        }
        this.host.diffReturnProjectId = undefined;
        this.host.detachDiffReviewWidget();
        this.host.render();
        this.host.syncLandingHubListChrome();
        this.host.delegate.onProjectsChanged?.();
    }
}
