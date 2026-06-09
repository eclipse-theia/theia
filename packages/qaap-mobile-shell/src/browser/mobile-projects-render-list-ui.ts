// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';

/** Panel surface for hub list rendering and repo row expansion. */
export interface MobileProjectsRenderListHost {
    hubView: MobileProjectsHubView;
    agentsHubShellActive: boolean;
    scroll: HTMLElement;
    diffProjectTabsHost: HTMLElement;
    diffWidgetHost: HTMLElement;
    expandedId: string | undefined;
    soloExpanded: boolean;
    homeMode: boolean;
    suppressCurrentAutoExpand: boolean;
    projects: MobileProjectEntry[];
    projectDetailSurfaceTargets: unknown;
    projectDetailTabStrip: unknown;

    shouldUseAgentsHubLanding(): boolean;
    teardownAgentsHubExecutionShell(): void;
    closeCardMenu(): void;
    shouldPreserveAgentsHubInlineTranscriptShell(): boolean;
    renderDiffHubView(): void;
    hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
    renderHomeHubView(): void;
    renderChatHubView(projects: MobileProjectEntry[]): void;
    renderTasksHubView(projects: MobileProjectEntry[]): void;
    renderReviewHubView(projects: MobileProjectEntry[]): void;
    renderCatalogHubView(): void;
    renderRoutinesHubView(): void;
    createEmptyState(): HTMLElement;
    createProjectDetailView(project: MobileProjectEntry): HTMLElement;
    createRow(project: MobileProjectEntry): HTMLElement;
    updateNewFabVisibility(): void;
    syncLandingHubListChrome(): void;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    cardMenuUi: import('./mobile-projects-card-menu-ui').MobileProjectsCardMenuUi;
    projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
}

/**
 * Hub list orchestrator: routes to per-view renderers without tearing down inline transcript mid-stream.
 */
export class MobileProjectsRenderListUi {

    constructor(protected readonly host: MobileProjectsRenderListHost) { }

    renderList(): void {
        if ((this.host.hubView !== 'tasks' || !this.host.shouldUseAgentsHubLanding()) && this.host.agentsHubShellActive) {
            this.host.teardownAgentsHubExecutionShell();
        }
        this.host.cardMenuUi.closeCardMenu();
        this.host.projectDetailSurfaceTargets = undefined;
        this.host.projectDetailTabStrip = undefined;
        if (!this.host.shouldPreserveAgentsHubInlineTranscriptShell()) {
            this.host.scroll.replaceChildren();
        }
        try {
            if (this.host.hubView === 'diff') {
                this.host.renderDiffHubView();
                return;
            }
            this.host.diffProjectTabsHost.hidden = true;
            this.host.diffWidgetHost.hidden = true;

            const filtered = this.host.hubQueryUi.projectsForCurrentHubList();

            if (this.host.hubView === 'home') {
                this.host.renderHomeHubView();
                return;
            }
            if (this.host.hubView === 'chat') {
                this.host.renderChatHubView(filtered);
                return;
            }
            if (this.host.hubView === 'tasks') {
                this.host.renderTasksHubView(filtered);
                return;
            }
            if (this.host.hubView === 'review') {
                this.host.renderReviewHubView(filtered);
                return;
            }
            if (this.host.hubView === 'workflows') {
                this.host.renderCatalogHubView();
                return;
            }
            if (this.host.hubView === 'routines') {
                this.host.renderRoutinesHubView();
                return;
            }

            if (filtered.length === 0) {
                this.host.scroll.append(this.host.createEmptyState());
                return;
            }

            if (this.host.homeMode && this.host.expandedId !== undefined) {
                const selected = filtered.find(p => p.id === this.host.expandedId)
                    ?? this.host.projects.find(p => p.id === this.host.expandedId);
                if (selected) {
                    this.host.scroll.append(this.host.createProjectDetailView(selected));
                    return;
                }
                this.host.expandedId = undefined;
                this.host.soloExpanded = false;
            }

            if (!this.host.homeMode && this.host.expandedId === undefined && !this.host.suppressCurrentAutoExpand) {
                const current = filtered.find(p => p.isCurrent);
                if (current) {
                    this.host.expandedId = current.id;
                    this.host.soloExpanded = true;
                }
            }

            let visible = filtered;
            if (!this.host.homeMode && this.host.soloExpanded && this.host.expandedId !== undefined) {
                visible = filtered.filter(p => p.id === this.host.expandedId);
                if (visible.length === 0) {
                    visible = filtered;
                    this.host.soloExpanded = false;
                }
            }

            const list = document.createElement('div');
            list.className = 'theia-mobile-projects-rows';
            for (const p of visible) {
                list.append(this.host.projectRowsUi.createRow(p));
            }
            this.host.scroll.append(list);
        } finally {
            this.host.updateNewFabVisibility();
            this.host.syncLandingHubListChrome();
            if (this.host.homeMode) {
                this.host.stickyComposerRenderUi.renderStickyComposer();
            }
        }
    }

    /** FAB opens "new repository"; hide while a repo row is expanded (conversations + composer). */
}
