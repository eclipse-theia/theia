// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { ExecutionSurfaceTabId } from '../common/qaap-execution-surface-tabs';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsExecutionSurfaceTabsUi } from './mobile-projects-execution-surface-tabs-ui';
import type { MobileProjectsTranscriptSurfacesUi } from './mobile-projects-transcript-surfaces-ui';

type TranscriptTab = ExecutionSurfaceTabId;

export interface ProjectDetailSurfaceTargets {
    chatHost: HTMLElement;
    planHost: HTMLElement;
    reviewHost: HTMLElement;
    previewHost: HTMLElement;
    filesHost: HTMLElement;
    terminalHost: HTMLElement;
}

/** Panel surface for expanded project detail (multi-tab execution surfaces). */
export interface MobileProjectsProjectDetailHost {
    projectDetailExpandedId: string | undefined;
    projectDetailSurfaceTargets: ProjectDetailSurfaceTargets | undefined;
    agentsHubShellActive: boolean;
    projectsService: MobileProjectsService;
    preparedCwdByProjectId: Map<string, string>;

    executionSurfaceTabsUi: MobileProjectsExecutionSurfaceTabsUi;
    transcriptSurfacesUi: MobileProjectsTranscriptSurfacesUi;
    activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']>;
    createTaskBlock(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement;
    resolveAgentsHubShellSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO;
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi
    projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
}

/** Expanded repo row: task block + execution surface hosts. */
export class MobileProjectsProjectDetailUi {

    constructor(protected readonly host: MobileProjectsProjectDetailHost) { }

    createProjectDetailView(project: MobileProjectEntry): HTMLElement {
        if (this.host.projectDetailExpandedId !== project.id) {
            this.host.projectDetailExpandedId = project.id;
        }

        const activeTab = this.host.executionSurfaceTabsUi.executionSurfaceTabForProject(project);
        const detail = document.createElement('div');
        detail.className = 'theia-mobile-projects-detail theia-mod-surfaces';
        detail.style.setProperty('--qaap-mobile-project-accent', project.color);

        const summary = this.projectDetailSurfaceSummary(project);

        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-detail-surfaces-body';

        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-project-detail-panel theia-mobile-project-detail-chat';
        const activeInfo = this.host.conversationIndexUi.activeInfoForProject(project);
        chatHost.append(this.host.projectRowsUi.createTaskBlock(project, activeInfo));
        chatHost.hidden = activeTab !== 'messages';

        const planHost = document.createElement('div');
        planHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-plan';
        planHost.hidden = activeTab !== 'plan';

        const reviewHost = document.createElement('div');
        reviewHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-review';
        reviewHost.hidden = activeTab !== 'review';

        const previewHost = document.createElement('div');
        previewHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-preview';
        previewHost.hidden = activeTab !== 'preview';

        const filesHost = document.createElement('div');
        filesHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-files-host';
        filesHost.hidden = activeTab !== 'files';

        const terminalHost = document.createElement('div');
        terminalHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-terminal-host';
        terminalHost.hidden = activeTab !== 'terminal';

        body.append(chatHost, planHost, reviewHost, previewHost, filesHost, terminalHost);
        detail.append(body);

        this.host.projectDetailSurfaceTargets = {
            chatHost,
            planHost,
            reviewHost,
            previewHost,
            filesHost,
            terminalHost,
        };
        this.host.transcriptSurfacesUi.mountProjectDetailSurfaceTab(project, summary, activeTab);
        return detail;
    }

    /** Synthetic conversation scope for project-level Files/Terminal/Preview surfaces. */
    projectDetailSurfaceSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO {
        const cwd = this.host.projectsService.getProjectCwd(project)
            ?? this.host.preparedCwdByProjectId.get(project.id)
            ?? '';
        return {
            id: `__project__:${project.id}`,
            source: 'theia-chat',
            cwd,
            agentId: '',
            title: project.name,
            status: 'idle',
            createdAt: 0,
            updatedAt: 0,
            messageCount: 0,
        };
    }

    selectProjectDetailTab(tab: TranscriptTab, project: MobileProjectEntry): void {
        if (this.host.agentsHubShellActive) {
            this.host.executionSurfaceTabsUi.selectTranscriptTab(tab, project, this.host.resolveAgentsHubShellSummary(project));
            return;
        }
        this.host.executionSurfaceTabsUi.activateExecutionSurfaceTab(tab, project, this.projectDetailSurfaceSummary(project), 'project-detail');
    }


}
