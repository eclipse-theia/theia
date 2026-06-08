// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapComposerSurface } from '../common/qaap-composer-surface';
import type { MobileProjectsHubView } from './mobile-projects-types';
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
    inboxLoadGeneration: number;
    inboxPullRequestsLoaded: boolean;
    scroll: HTMLElement;
    projectsService: MobileProjectsService;
    conversations: MobileProjectsConversations | undefined;
    activeTasks: MobileProjectsActiveTasks | undefined;
    inboxStream: MobileWorkHubInboxStream | undefined;
    delegate: { onHubLandingViewChanged?(): void };

    closeTranscriptSheet(): void;
    redirectHubView(view: MobileProjectsHubView): MobileProjectsHubView;
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
        this.host.closeTranscriptSheet();
        if (view === 'chat' || view === 'tasks') {
            // Chat surface removed — both legacy entry points land on the agentic Task surface.
            this.host.tasksHubSurface = 'task';
        }
        if (view === 'tasks') {
            this.host.agentsHubLegacyInbox = false;
        }
        view = this.host.redirectHubView(view);
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
}
