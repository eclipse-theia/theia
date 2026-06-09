// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import type { QaapComposerSurface } from '../common/qaap-composer-surface';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry, MobileProjectFilter, MobileProjectsHubView } from './mobile-projects-types';

/** Panel surface for repository filter tabs and search chrome. */
export interface MobileProjectsRepoFiltersHost {
    hubView: MobileProjectsHubView;
    filter: MobileProjectFilter;
    query: string;
    filtersHost: HTMLElement;
    searchToggleBtn: HTMLButtonElement;
    workHubSearchQuickPick: { hide(): void; show(): void } | undefined;
    projects: MobileProjectEntry[];
    tasksHubSurface: 'tasks' | 'chat';
    projectsService: MobileProjectsService;

    isProjectDetailView(): boolean;
    hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
    projectNavigationUi: import('./mobile-projects-project-navigation-ui').MobileProjectsProjectNavigationUi;
    renderList(): void;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    workHubSearchUi: import('./mobile-projects-work-hub-search-ui').MobileProjectsWorkHubSearchUi;
    detailComposerSurfaceForProject(project: MobileProjectEntry): QaapComposerSurface;
    projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
}

/** Repository filter row and search toggle chrome for the repos hub. */
export class MobileProjectsRepoFiltersUi {

    static readonly REPO_FILTER_ORDER: readonly MobileProjectFilter[] = ['all', 'active', 'pinned'];

    constructor(protected readonly host: MobileProjectsRepoFiltersHost) { }

    renderFilters(): void {
        this.syncSearchChrome();
        const showRepoFilters = this.host.hubView === 'repos' && !this.host.isProjectDetailView();
        this.host.filtersHost.hidden = !showRepoFilters;
        this.host.filtersHost.replaceChildren();
        if (!showRepoFilters) {
            return;
        }
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-filters';
        row.setAttribute('role', 'tablist');
        row.setAttribute('aria-label', nls.localize('qaap/mobileProjects/filterRowLabel', 'Filter repositories'));
        for (const id of MobileProjectsRepoFiltersUi.REPO_FILTER_ORDER) {
            const spec = { id, label: this.repoFilterLabel(id) };
            const isActive = this.host.filter === spec.id;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-filter-tab';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            if (isActive) {
                btn.classList.add('theia-mod-active');
            }
            const label = document.createElement('span');
            label.className = 'theia-mobile-projects-filter-tab-label';
            label.textContent = spec.label;
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-filter-tab-count';
            count.textContent = String(this.host.hubQueryUi.applyFilter(this.host.projects, spec.id).length);
            btn.append(label, count);
            btn.addEventListener('click', () => {
                if (this.host.filter === spec.id) {
                    return;
                }
                this.host.filter = spec.id;
                this.host.projectsService.setFilter(spec.id);
                this.renderFilters();
                this.host.renderList();
                this.host.stickyComposerRenderUi.renderStickyComposer();
            });
            row.append(btn);
        }
        this.host.filtersHost.append(row);
    }

    repoFilterLabel(id: MobileProjectFilter): string {
        switch (id) {
            case 'active':
                return nls.localize('qaap/mobileProjects/filterActive', 'Active');
            case 'pinned':
                return nls.localize('qaap/mobileProjects/filterPinned', 'Pinned');
            default:
                return nls.localize('qaap/mobileProjects/filterAll', 'All');
        }
    }

    isSearchChromeHidden(): boolean {
        return this.host.hubView === 'diff'
            || this.host.hubView === 'home'
            || this.host.hubView === 'tasks'
            || this.host.hubView === 'review'
            || this.host.hubView === 'chat'
            || this.host.isProjectDetailView();
    }

    syncSearchChrome(): void {
        const hideSearch = this.isSearchChromeHidden();
        const open = !!this.host.workHubSearchQuickPick;
        this.host.searchToggleBtn.hidden = hideSearch;
        this.host.searchToggleBtn.classList.toggle('theia-mod-active', open);
        this.host.searchToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (hideSearch && open) {
            this.host.workHubSearchUi.closeWorkHubSearchQuickPick();
        }
    }

    workHubSearchPlaceholder(): string {
        if (this.host.hubView === 'chat') {
            return nls.localize('qaap/mobileProjects/searchChatPlaceholder', 'Search local chat sessions');
        }
        if (this.host.hubView === 'tasks') {
            return this.host.tasksHubSurface === 'chat'
                ? nls.localize('qaap/mobileProjects/searchChatPlaceholder', 'Search local chat sessions')
                : nls.localize('qaap/mobileProjects/searchTasksPlaceholder', 'Search tasks and agents');
        }
        if (this.host.hubView === 'review') {
            return nls.localize('qaap/mobileProjects/searchReviewPlaceholder', 'Search pull requests');
        }
        if (this.host.hubView === 'workflows') {
            return nls.localize('qaap/mobileProjects/searchWorkflowsPlaceholder', 'Search workflows and guides');
        }
        if (this.host.hubView === 'routines') {
            return nls.localize('qaap/mobileProjects/searchRoutinesPlaceholder', 'Search routines and automations');
        }
        if (this.host.isProjectDetailView()) {
            const project = this.host.projectNavigationUi.resolveSelectedProject();
            const surface = project ? this.host.projectRowsUi.detailComposerSurfaceForProject(project) : 'task';
            return surface === 'chat'
                ? nls.localize('qaap/mobileProjects/searchChatPlaceholder', 'Search local chat sessions')
                : nls.localize('qaap/mobileProjects/searchTasksPlaceholder', 'Search tasks and agents');
        }
        return nls.localize('qaap/mobileProjects/searchPlaceholder', 'Search repositories and tasks');
    }

}
