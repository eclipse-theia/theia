// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { UnsafeWidgetUtilities } from '@theia/core/lib/browser';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitChangedFile,
} from '../common/qaap-git-review';
import {
    QaapDiffReviewWidget,
    type QaapDiffReviewRepositoryContext,
} from './qaap-diff-review-widget';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry } from './mobile-projects-types';

export interface QaapDiffProjectTab {
    projectId: string;
    label: string;
    rootUri: string;
    rootFsPath: string;
    isActiveWorkspace: boolean;
    fileCount: number;
}

/** Panel surface for the Work Hub diff review hub. */
export interface MobileProjectsDiffHubHost {
    diffProjectTabsHost: HTMLElement;
    diffWidgetHost: HTMLElement;
    scroll: HTMLElement;
    newFabBtn: HTMLButtonElement;
    stickyComposerHost: HTMLElement;
    root: HTMLElement;
    diffProjectTabs: QaapDiffProjectTab[];
    diffActiveProjectId: string | undefined;
    diffScanning: boolean;
    diffScopedToProject: boolean;
    diffPendingPreferredProjectId: string | undefined;
    diffReviewWidget: QaapDiffReviewWidget | undefined;
    createDiffReviewWidget: (() => Promise<QaapDiffReviewWidget>) | undefined;
    projects: MobileProjectEntry[];
    projectsService: MobileProjectsService;

    renderHeader(): void;
    renderSubtitle(): void;
}

/** Diff hub: project tabs, git change scan, and embedded review widget. */
export class MobileProjectsDiffHubUi {

    constructor(protected readonly host: MobileProjectsDiffHubHost) { }

    renderDiffHubView(): void {
        this.host.newFabBtn.hidden = true;
        this.host.stickyComposerHost.hidden = true;
        this.host.root.classList.remove('theia-mod-sticky-composer');
        this.host.scroll.append(this.host.diffProjectTabsHost, this.host.diffWidgetHost);
        this.host.diffProjectTabsHost.hidden = false;
        this.host.diffWidgetHost.hidden = false;
        this.renderDiffProjectTabs();
        if (this.host.diffScanning) {
            this.detachDiffReviewWidget();
            const loading = document.createElement('div');
            loading.className = 'theia-mobile-projects-diff-loading';
            loading.textContent = nls.localize('qaap/diff/scanningProjects', 'Scanning projects for changes…');
            this.host.diffWidgetHost.replaceChildren(loading);
            return;
        }
        if (this.host.diffProjectTabs.length === 0) {
            this.detachDiffReviewWidget();
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-projects-diff-empty';
            empty.innerHTML = `<i class="codicon codicon-check-all" aria-hidden="true"></i>`
                + `<p>${nls.localize('qaap/diff/noChangesAnyProject', 'No pending changes across your projects.')}</p>`
                + `<span>${nls.localize('qaap/diff/noChangesHint', 'Edits made by you or an agent will show up here.')}</span>`;
            this.host.diffWidgetHost.replaceChildren(empty);
            return;
        }
        void this.mountDiffReviewWidget();
    }

    renderDiffProjectTabs(): void {
        this.host.diffProjectTabsHost.replaceChildren();
        if (this.host.diffScopedToProject || this.host.diffProjectTabs.length <= 1) {
            this.host.diffProjectTabsHost.hidden = true;
            return;
        }
        this.host.diffProjectTabsHost.hidden = false;
        const bar = document.createElement('div');
        bar.className = 'theia-mobile-projects-diff-tabs-bar';
        bar.setAttribute('role', 'tablist');
        for (const tab of this.host.diffProjectTabs) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-diff-tab';
            btn.setAttribute('role', 'tab');
            const active = tab.projectId === this.host.diffActiveProjectId;
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) {
                btn.classList.add('theia-mod-active');
            }
            const label = document.createElement('span');
            label.className = 'theia-mobile-projects-diff-tab-label';
            label.textContent = tab.label;
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-diff-tab-count';
            count.textContent = String(tab.fileCount);
            btn.append(label, count);
            btn.addEventListener('click', () => {
                if (this.host.diffActiveProjectId !== tab.projectId) {
                    this.host.diffActiveProjectId = tab.projectId;
                    this.renderDiffProjectTabs();
                    void this.applyDiffTabToWidget(tab);
                }
            });
            bar.append(btn);
        }
        this.host.diffProjectTabsHost.append(bar);
    }

    async refreshDiffHubView(): Promise<void> {
        if (!this.host.createDiffReviewWidget) {
            return;
        }
        this.host.diffScanning = true;
        this.renderDiffHubView();
        try {
            const preferred = this.host.diffPendingPreferredProjectId;
            this.host.diffPendingPreferredProjectId = undefined;
            if (this.host.diffScopedToProject) {
                const tab = await this.scanSingleProjectWithChanges(preferred);
                this.host.diffProjectTabs = tab ? [tab] : [];
            } else {
                this.host.diffProjectTabs = await this.scanProjectsWithChanges();
            }
            const pick = (preferred && this.host.diffProjectTabs.some(t => t.projectId === preferred))
                ? preferred
                : this.host.diffProjectTabs.find(t => t.isActiveWorkspace)?.projectId
                ?? this.host.diffProjectTabs[0]?.projectId;
            this.host.diffActiveProjectId = pick;
        } finally {
            this.host.diffScanning = false;
            this.host.renderHeader();
            this.host.renderSubtitle();
            this.renderDiffHubView();
        }
    }

    async scanSingleProjectWithChanges(preferredProjectId?: string): Promise<QaapDiffProjectTab | undefined> {
        const projects = this.host.projects.length > 0 ? this.host.projects : await this.host.projectsService.loadProjects();
        const project = (preferredProjectId
            ? projects.find(p => p.id === preferredProjectId)
            : undefined)
            ?? projects.find(p => p.isCurrent)
            ?? projects[0];
        if (!project) {
            return undefined;
        }
        const cwd = this.host.projectsService.getProjectCwd(project);
        if (!cwd) {
            return undefined;
        }
        const rootUri = project.uri?.toString() ?? `file://${cwd}`;
        try {
            const response = await fetch(
                `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(cwd)}`,
                { credentials: 'include' },
            );
            if (!response.ok) {
                return undefined;
            }
            const body = await response.json() as { files?: QaapGitChangedFile[] };
            const files = body.files ?? [];
            return {
                projectId: project.id,
                label: project.name,
                rootUri,
                rootFsPath: cwd,
                isActiveWorkspace: project.isCurrent,
                fileCount: files.length,
            };
        } catch {
            return undefined;
        }
    }

    async scanProjectsWithChanges(): Promise<QaapDiffProjectTab[]> {
        const tabs: QaapDiffProjectTab[] = [];
        const projects = this.host.projects.length > 0 ? this.host.projects : await this.host.projectsService.loadProjects();
        await Promise.all(projects.map(async project => {
            const cwd = this.host.projectsService.getProjectCwd(project);
            if (!cwd) {
                return;
            }
            const rootUri = project.uri?.toString() ?? `file://${cwd}`;
            try {
                const response = await fetch(
                    `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(cwd)}`,
                    { credentials: 'include' },
                );
                if (!response.ok) {
                    return;
                }
                const body = await response.json() as { files?: QaapGitChangedFile[] };
                const files = body.files ?? [];
                if (files.length === 0) {
                    return;
                }
                tabs.push({
                    projectId: project.id,
                    label: project.name,
                    rootUri,
                    rootFsPath: cwd,
                    isActiveWorkspace: project.isCurrent,
                    fileCount: files.length,
                });
            } catch {
                /* skip unreachable repos */
            }
        }));
        tabs.sort((a, b) => {
            if (a.isActiveWorkspace !== b.isActiveWorkspace) {
                return a.isActiveWorkspace ? -1 : 1;
            }
            return a.label.localeCompare(b.label);
        });
        return tabs;
    }

    async mountDiffReviewWidget(): Promise<void> {
        if (!this.host.createDiffReviewWidget) {
            return;
        }
        const tab = this.host.diffProjectTabs.find(t => t.projectId === this.host.diffActiveProjectId)
            ?? this.host.diffProjectTabs[0];
        if (!tab) {
            return;
        }
        this.host.diffActiveProjectId = tab.projectId;
        if (!this.host.diffReviewWidget) {
            this.host.diffReviewWidget = await this.host.createDiffReviewWidget();
            this.host.diffReviewWidget.node.classList.add('theia-mobile-projects-diff-embed');
        }
        this.host.diffReviewWidget.enableWorkHubEmbed();
        this.host.diffReviewWidget.setTranscriptAgentFeedbackHandler(undefined);
        this.host.diffReviewWidget.setReviewStatsChangeHandler(undefined);
        this.attachDiffReviewWidget(this.host.diffWidgetHost);
        await this.applyDiffTabToWidget(tab);
    }

    async applyDiffTabToWidget(tab: QaapDiffProjectTab): Promise<void> {
        if (!this.host.diffReviewWidget) {
            return;
        }
        const context: QaapDiffReviewRepositoryContext = {
            rootUri: tab.rootUri,
            rootFsPath: tab.rootFsPath,
            isActiveWorkspace: tab.isActiveWorkspace,
        };
        this.host.diffReviewWidget.setRepositoryContext(context);
    }

    detachDiffReviewWidget(): void {
        this.detachDiffReviewWidgetFromHost();
    }

    attachDiffReviewWidget(host: HTMLElement): void {
        const widget = this.host.diffReviewWidget;
        if (!widget || !host.isConnected) {
            return;
        }
        if (!widget.isAttached) {
            UnsafeWidgetUtilities.attach(widget, host);
        } else if (widget.node.parentElement !== host) {
            host.appendChild(widget.node);
        }
    }

    detachDiffReviewWidgetFromHost(): void {
        const widget = this.host.diffReviewWidget;
        if (!widget?.isAttached) {
            widget?.node.remove();
            return;
        }
        if (widget.node.parentElement) {
            UnsafeWidgetUtilities.detach(widget);
        }
    }

}
