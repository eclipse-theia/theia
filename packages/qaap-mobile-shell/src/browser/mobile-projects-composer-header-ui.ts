// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { dismissQaapAccountMenu } from './qaap-workbench-account-menu';
import { setMobileWorkHubComposerHeaderChrome } from './mobile-projects-open';
import { createSegmentedField, type QaapSegmentedFieldController } from './qaap-mobile-form-ui';
import { writeStoredComposerSurface, type QaapComposerSurface } from '../common/qaap-composer-surface';
import { QAAP_PRIMARY_AGENT_ID, writeStoredAgent } from '../common/qaap-agent-task-client';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectEntry, MobileProjectFilter } from './mobile-projects-types';

export interface MobileProjectsComposerHeaderHost {
    visible: boolean;
    hubView: import('./mobile-projects-types').MobileProjectsHubView;
    root: HTMLElement;
    stickyComposerHost: HTMLElement;
    headerSurfacePickerHost: HTMLElement;
    accountBtn: HTMLButtonElement;
    headerSurfacePicker: QaapSegmentedFieldController<QaapComposerSurface> | undefined;
    stickyComposerSurface: QaapComposerSurface;
    tasksHubSurface: QaapComposerSurface;
    stickyComposerFabLiftPx: number;
    projects: MobileProjectEntry[];
    filter: MobileProjectFilter;
    preparedCwdByProjectId: Map<string, string>;

    isProjectDetailView(): boolean;
    syncAgentsHubAccountChrome(): void;
    hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
    projectNavigationUi: import('./mobile-projects-project-navigation-ui').MobileProjectsProjectNavigationUi;
    projectsService: import('./mobile-projects-service').MobileProjectsService;
    stickyComposerPinnedAgentId: string | undefined;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    renderList(): void;
    renderSubtitle(): void;
    shouldUseAgentsHubLanding(): boolean;
    resolveHomePinnedProject(): MobileProjectEntry | undefined;
}

export class MobileProjectsComposerHeaderUi {
    constructor(protected readonly host: MobileProjectsComposerHeaderHost) { }

    composerSurfaceSegmentOptions(): Array<{ id: QaapComposerSurface; label: string; iconClass: string }> {
        return [
            {
                id: 'chat',
                label: nls.localize('qaap/composerSurface/chat', 'Chat'),
                iconClass: 'codicon-comment-discussion',
            },
            {
                id: 'task',
                label: nls.localize('qaap/composerSurface/task', 'Task'),
                iconClass: 'codicon-server-process',
            },
        ];
    }

    shouldShowHeaderComposerSurfacePicker(): boolean {
        // The local Chat surface was removed; only the agentic Task surface remains, so the
        // Chat/Task segmented picker is never shown.
        return false;
    }

    syncHeaderComposerSurfacePicker(): void {
        const show = this.shouldShowHeaderComposerSurfacePicker();
        const hideAccount = show || this.host.isProjectDetailView();
        setMobileWorkHubComposerHeaderChrome(show);
        if (!hideAccount) {
            this.host.syncAgentsHubAccountChrome();
        } else {
            this.host.accountBtn.hidden = true;
            this.host.accountBtn.style.display = 'none';
            this.host.accountBtn.setAttribute('aria-hidden', 'true');
            dismissQaapAccountMenu();
        }
        this.host.headerSurfacePickerHost.hidden = !show;
        if (!show) {
            this.host.headerSurfacePickerHost.replaceChildren();
            this.host.headerSurfacePicker = undefined;
            return;
        }
        const sticky = this.host.isProjectDetailView();
        const value = sticky ? this.host.stickyComposerSurface : this.host.tasksHubSurface;
        if (!this.host.headerSurfacePicker) {
            const field = createSegmentedField<QaapComposerSurface>({
                segments: this.composerSurfaceSegmentOptions(),
                value,
                iconOnly: true,
                onChange: (surface: QaapComposerSurface) => { this.onHeaderComposerSurfaceChange(surface); },
            });
            field.root.classList.add('theia-mod-header-surface');
            this.host.headerSurfacePicker = field;
            this.host.headerSurfacePickerHost.append(field.root);
        } else {
            this.host.headerSurfacePicker.setValue(value);
        }
    }

    onHeaderComposerSurfaceChange(surface: QaapComposerSurface): void {
        if (this.host.isProjectDetailView()) {
            const filtered = this.host.hubQueryUi.applySearch(this.host.hubQueryUi.applyFilter(this.host.projects, this.host.filter));
            const project = this.resolveStickyComposerProject(filtered);
            const cwd = project
                ? (this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id))
                : undefined;
            this.host.stickyComposerSurface = surface;
            writeStoredComposerSurface(cwd, surface);
            if (surface === 'chat') {
                this.pinStickyComposerToQaiq(cwd);
            }
            this.host.stickyComposerRenderUi.renderStickyComposer();
            this.host.renderList();
            return;
        }
        if (this.host.hubQueryUi.isTasksHubView()) {
            this.host.tasksHubSurface = surface;
            writeStoredComposerSurface(undefined, surface);
            this.host.renderList();
            this.host.renderSubtitle();
            this.syncHeaderComposerSurfacePicker();
        }
    }

    updateStickyComposerFabLift(): void {
        const composerVisible = this.host.root.classList.contains('theia-mod-sticky-composer')
            && !this.host.stickyComposerHost.hidden
            && this.host.stickyComposerHost.offsetHeight > 0;
        if (composerVisible) {
            const lift = this.host.stickyComposerHost.offsetHeight;
            this.host.stickyComposerFabLiftPx = lift;
            this.host.root.style.setProperty('--theia-mobile-projects-fab-lift', `${lift}px`);
            return;
        }
        this.host.stickyComposerFabLiftPx = 0;
        this.host.root.style.setProperty('--theia-mobile-projects-fab-lift', '0px');
    }

    shouldShowComposerWorkspaceBar(_summary?: QaapAgentConversationSummaryDTO): boolean {
        return true;
    }

    pinStickyComposerToQaiq(cwd: string | undefined): void {
        this.host.stickyComposerPinnedAgentId = QAAP_PRIMARY_AGENT_ID;
        writeStoredAgent(cwd, QAAP_PRIMARY_AGENT_ID);
    }

    resolveStickyComposerProject(projects: MobileProjectEntry[]): MobileProjectEntry | undefined {
        if (this.host.shouldUseAgentsHubLanding()) {
            return this.host.resolveHomePinnedProject();
        }
        return this.host.projectNavigationUi.resolveSelectedProject(projects);
    }

    preferComposerSurface(surface: QaapComposerSurface, projectCwd?: string): void {
        void surface;
        writeStoredComposerSurface(projectCwd, 'task');
        this.host.stickyComposerSurface = 'task';
        if (this.host.visible && this.host.hubView === 'repos') {
            this.host.stickyComposerRenderUi.renderStickyComposer();
        }
    }

}
