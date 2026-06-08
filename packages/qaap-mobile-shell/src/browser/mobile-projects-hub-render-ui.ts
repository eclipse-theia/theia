// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';
import type { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';

export interface MobileProjectsHubRenderHost {
    root: HTMLElement;
    hubView: MobileProjectsHubView;
    transcriptSheet: HTMLElement | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    sessionsSidebar: MobileWorkHubSessionsSidebar | undefined;

    isProjectDiffView(): boolean;
    shouldUseAgentsHubLanding(): boolean;
    isProjectDetailView(): boolean;
    resolveSelectedProject(projects?: MobileProjectEntry[]): MobileProjectEntry | undefined;
    executionSurfaceTabForProject(project: MobileProjectEntry): import('../common/qaap-execution-surface-tabs').ExecutionSurfaceTabId;
    renderHeader(): void;
    renderSubtitle(): void;
    syncHeaderComposerSurfacePicker(): void;
    syncHeaderExecutionTabStrip(): void;
    syncExecutionSurfaceChrome(project: MobileProjectEntry): void;
    syncHubViewAvailability(): void;
    renderFilters(): void;
    renderList(): void;
}

export class MobileProjectsHubRenderUi {
    constructor(protected readonly host: MobileProjectsHubRenderHost) { }

    render(): void {
        this.host.root.classList.toggle('theia-mod-hub-home', this.host.hubView === 'home');
        this.host.root.classList.toggle('theia-mod-hub-diff', this.host.hubView === 'diff');
        this.host.root.classList.toggle('theia-mod-hub-project-diff', this.host.isProjectDiffView());
        this.host.root.classList.toggle('theia-mod-hub-inbox', this.host.hubView === 'tasks');
        this.host.root.classList.toggle('theia-mod-hub-tasks', this.host.hubView === 'tasks');
        this.host.root.classList.toggle('theia-mod-hub-review', this.host.hubView === 'review');
        this.host.root.classList.toggle('theia-mod-hub-chat', this.host.hubView === 'chat');
        this.host.root.classList.toggle('theia-mod-hub-workflows', this.host.hubView === 'workflows');
        this.host.root.classList.toggle('theia-mod-hub-routines', this.host.hubView === 'routines');
        this.host.root.classList.toggle('theia-mod-hub-repos', this.host.hubView === 'repos');
        this.host.root.classList.toggle('theia-mod-agents-hub-landing', this.host.shouldUseAgentsHubLanding());
        this.host.root.classList.toggle('theia-mod-project-detail', this.host.isProjectDetailView());
        const detailProject = this.host.resolveSelectedProject();
        const detailTab = detailProject ? this.host.executionSurfaceTabForProject(detailProject) : 'messages';
        this.host.root.classList.toggle(
            'theia-mod-project-surface-chat',
            this.host.isProjectDetailView() && detailTab === 'messages',
        );
        this.host.root.classList.toggle(
            'theia-mod-project-surface-tools',
            this.host.isProjectDetailView() && detailTab !== 'messages',
        );
        this.host.renderHeader();
        this.host.renderSubtitle();
        this.host.syncHeaderComposerSurfacePicker();
        this.host.syncHeaderExecutionTabStrip();
        if (this.host.transcriptSheet && this.host.transcriptOpenProject) {
            this.host.syncExecutionSurfaceChrome(this.host.transcriptOpenProject);
        }
        this.host.syncHubViewAvailability();
        this.host.renderFilters();
        this.host.renderList();
        if (this.host.sessionsSidebar?.isVisible()) {
            this.host.sessionsSidebar.refreshList();
        }
    }

    syncHubViewAvailability(): void {
        // Inbox is PRs + optional agent threads; keep the tab even when the VPS conversation service is absent.
    }

}
