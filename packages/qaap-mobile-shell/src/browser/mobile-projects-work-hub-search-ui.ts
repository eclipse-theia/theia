// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import type { QuickPick, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/common/quick-pick-service';
import type { QuickInputService } from '@theia/core/lib/browser';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { QAAP_WORK_HUB_WORKFLOWS, type WorkHubCatalogAction } from '../common/mobile-work-hub-catalog';
import { routineScheduleLabel, type QaapWorkHubRoutine } from '../common/qaap-work-hub-routine';
import type { QaapComposerSurface } from '../common/qaap-composer-surface';
import type { MobileProjectEntry, MobileProjectFilter, MobileProjectsHubView } from './mobile-projects-types';

export type WorkHubSearchTarget =
    | { readonly kind: 'project'; readonly projectId: string }
    | { readonly kind: 'conversation'; readonly projectId: string; readonly conversationId: string }
    | { readonly kind: 'pullRequest'; readonly pullRequest: QaapGithubPullRequestSummary }
    | { readonly kind: 'catalog'; readonly action: WorkHubCatalogAction }
    | { readonly kind: 'routine'; readonly routineId: string };

export interface WorkHubSearchPickItem extends QuickPickItem {
    readonly target: WorkHubSearchTarget;
}

/** Panel surface for Work Hub Monaco quick-pick search. */
export interface MobileProjectsWorkHubSearchHost {
    quickInputService: QuickInputService | undefined;
    workHubSearchQuickPick: QuickPick<WorkHubSearchPickItem> | undefined;
    workHubSearchQuickPickDispose: Disposable;
    hubView: MobileProjectsHubView;
    projects: MobileProjectEntry[];
    filter: MobileProjectFilter;
    tasksHubSurface: QaapComposerSurface;
    inboxPullRequests: QaapGithubPullRequestSummary[];
    workHubRoutines: QaapWorkHubRoutine[];
    expandedId: string | undefined;
    delegate: { onOpenPullRequest?(pullRequest: QaapGithubPullRequestSummary): void };

    repoFiltersUi: import('./mobile-projects-repo-filters-ui').MobileProjectsRepoFiltersUi;
    projectNavigationUi: import('./mobile-projects-project-navigation-ui').MobileProjectsProjectNavigationUi;
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi;
    hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
    isProjectDetailView(): boolean;
    detailComposerSurfaceForProject(project: MobileProjectEntry): import('../common/qaap-composer-surface').QaapComposerSurface;
    sortRoutinesForDisplay(routines: QaapWorkHubRoutine[]): QaapWorkHubRoutine[];
    openProjectDetail(project: MobileProjectEntry): void | Promise<void>;
    transcriptSheetUi: import('./mobile-projects-transcript-sheet-ui').MobileProjectsTranscriptSheetUi;
    runCatalogAction(action: WorkHubCatalogAction): Promise<void>;
    selectHubLandingView(view: MobileProjectsHubView, preferredDiffProjectId?: string, options?: { force?: boolean }): void;
    openRoutineEditor(routine: QaapWorkHubRoutine): void;
    syncSearchChrome(): void;
    projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
}

/** Work Hub quick-pick search: item builders and navigation targets. */
export class MobileProjectsWorkHubSearchUi {

    constructor(protected readonly host: MobileProjectsWorkHubSearchHost) { }

    openWorkHubSearchQuickPick(): void {
        if (!this.host.quickInputService || this.host.repoFiltersUi.isSearchChromeHidden()) {
            return;
        }
        if (this.host.workHubSearchQuickPick) {
            this.host.workHubSearchQuickPick.show();
            return;
        }
        const quickPick = this.host.quickInputService.createQuickPick<WorkHubSearchPickItem>();
        this.host.workHubSearchQuickPick = quickPick;
        quickPick.placeholder = this.host.repoFiltersUi.workHubSearchPlaceholder();
        quickPick.canSelectMany = false;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        quickPick.items = this.buildWorkHubSearchPickItems();
        this.host.workHubSearchQuickPickDispose = new DisposableCollection(
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected?.target) {
                    void this.activateWorkHubSearchTarget(selected.target);
                }
                quickPick.hide();
            }),
            quickPick.onDidHide(() => {
                this.host.workHubSearchQuickPick = undefined;
                this.host.workHubSearchQuickPickDispose.dispose();
                this.host.workHubSearchQuickPickDispose = Disposable.NULL;
                this.host.syncSearchChrome();
            }),
        );
        quickPick.show();
        this.host.syncSearchChrome();
    }

    closeWorkHubSearchQuickPick(): void {
        this.host.workHubSearchQuickPick?.hide();
    }

    buildWorkHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        if (this.host.isProjectDetailView()) {
            return this.buildProjectDetailSearchPickItems();
        }
        switch (this.host.hubView) {
            case 'repos':
                return this.buildReposSearchPickItems();
            case 'tasks':
                return this.buildTasksHubSearchPickItems();
            case 'chat':
                return this.buildChatHubSearchPickItems();
            case 'review':
                return this.buildReviewSearchPickItems();
            case 'workflows':
                return this.buildWorkflowSearchPickItems();
            case 'routines':
                return this.buildRoutineSearchPickItems();
            default:
                return [];
        }
    }

    buildProjectDetailSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const project = this.host.projectNavigationUi.resolveSelectedProject();
        if (!project) {
            return [];
        }
        const surface = this.host.projectRowsUi.detailComposerSurfaceForProject(project);
        const conversations = surface === 'chat'
            ? this.host.conversationIndexUi.localChatsForProject(project)
            : this.host.conversationIndexUi.vpsTasksForProject(project);
        return conversations.map(c => this.conversationToSearchPickItem(project, c));
    }

    buildReposSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        const projects = this.host.hubQueryUi.applyFilter(this.host.projects, this.host.filter);
        for (const project of projects) {
            items.push({
                label: project.name,
                description: project.branch,
                detail: project.task || project.github?.fullName,
                iconClasses: ['codicon', 'codicon-repo'],
                target: { kind: 'project', projectId: project.id },
            });
            for (const conversation of this.host.conversationIndexUi.conversationsForProject(project)) {
                items.push(this.conversationToSearchPickItem(project, conversation));
            }
        }
        return items;
    }

    buildTasksHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        if (this.host.tasksHubSurface === 'chat') {
            return this.buildChatHubSearchPickItems();
        }
        for (const project of this.host.projects) {
            for (const conversation of this.host.conversationIndexUi.vpsTasksForProject(project)) {
                items.push(this.conversationToSearchPickItem(project, conversation));
            }
        }
        return items;
    }

    buildChatHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        for (const project of this.host.projects) {
            for (const conversation of this.host.conversationIndexUi.localChatsForProject(project)) {
                items.push(this.conversationToSearchPickItem(project, conversation));
            }
        }
        return items;
    }

    buildReviewSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        for (const pullRequest of this.host.inboxPullRequests) {
            items.push({
                label: pullRequest.title,
                description: `${pullRequest.owner}/${pullRequest.repo}`,
                detail: pullRequest.author ? `@${pullRequest.author}` : undefined,
                iconClasses: ['codicon', 'codicon-git-pull-request'],
                target: { kind: 'pullRequest', pullRequest },
            });
        }
        return items;
    }

    buildWorkflowSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        for (const section of QAAP_WORK_HUB_WORKFLOWS) {
            items.push({ type: 'separator', label: section.title });
            for (const item of section.items) {
                items.push({
                    label: item.title,
                    description: item.subtitle,
                    detail: item.meta,
                    iconClasses: ['codicon', item.iconClass],
                    target: { kind: 'catalog', action: item.action },
                });
            }
        }
        return items;
    }

    buildRoutineSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.host.sortRoutinesForDisplay(this.host.workHubRoutines).map(routine => ({
            label: routine.title,
            description: routineScheduleLabel(routine),
            detail: routine.prompt?.trim() || undefined,
            iconClasses: ['codicon', 'codicon-sync'],
            target: { kind: 'routine', routineId: routine.id },
        }));
    }

    conversationToSearchPickItem(
        project: MobileProjectEntry,
        conversation: QaapAgentConversationSummaryDTO,
    ): WorkHubSearchPickItem {
        return {
            label: conversation.title?.trim() || conversation.agentId,
            description: project.name,
            detail: conversation.lastMessagePreview?.trim() || conversation.agentId,
            iconClasses: ['codicon', 'codicon-comment-discussion'],
            target: {
                kind: 'conversation',
                projectId: project.id,
                conversationId: conversation.id,
            },
        };
    }

    async activateWorkHubSearchTarget(target: WorkHubSearchTarget): Promise<void> {
        switch (target.kind) {
            case 'project': {
                const project = this.host.projects.find(entry => entry.id === target.projectId);
                if (project) {
                    await this.host.openProjectDetail(project);
                }
                return;
            }
            case 'conversation': {
                const project = this.host.projects.find(entry => entry.id === target.projectId);
                if (!project) {
                    return;
                }
                const summary = this.host.conversationIndexUi.conversationsForProject(project).find(entry => entry.id === target.conversationId);
                if (!summary) {
                    return;
                }
                if (this.host.expandedId !== project.id) {
                    await this.host.openProjectDetail(project);
                }
                await this.host.transcriptSheetUi.openTranscriptSheet(project, summary);
                return;
            }
            case 'pullRequest':
                this.host.delegate.onOpenPullRequest?.(target.pullRequest);
                return;
            case 'catalog':
                await this.host.runCatalogAction(target.action);
                return;
            case 'routine': {
                if (this.host.hubView !== 'routines') {
                    this.host.selectHubLandingView('routines');
                }
                const routine = this.host.workHubRoutines.find(entry => entry.id === target.routineId);
                if (routine) {
                    this.host.openRoutineEditor(routine);
                }
                return;
            }
        }
    }

    /**
     * SSE conversation ticks call {@link renderList} to refresh sidebar dots, but must not
     * `replaceChildren()` the inline transcript shell — that disconnects the chat host mid-stream
     * and aborts live refresh until the user reopens the conversation.
     */


}
