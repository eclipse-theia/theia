// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { scrollElementTo } from '../common/qaap-prefers-reduced-motion';
import { dismissQaapAccountMenu } from './qaap-workbench-account-menu';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';
import type { MobileProjectsExecutionSurfaceTabsUi } from './mobile-projects-execution-surface-tabs-ui';
import type { MobileProjectsTranscriptHeaderUi } from './mobile-projects-transcript-header-ui';
import type { MobileProjectsTranscriptSheetUi } from './mobile-projects-transcript-sheet-ui';

export interface MobileProjectsHubHeaderHost {
    sessionsMenuBtn: HTMLButtonElement;
    headerBackBtn: HTMLButtonElement;
    titleBlock: HTMLElement;
    titleEl: HTMLHeadingElement;
    titleAttentionEl: HTMLSpanElement;
    accountBtn: HTMLButtonElement;
    homeMode: boolean;
    hubView: MobileProjectsHubView;
    agentsHubInlineActive: boolean;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;

    isProjectDetailView(): boolean;
    isProjectDiffView(): boolean;
    shouldUseAgentsHubLanding(): boolean;
    isSidebarSecondaryHubView(): boolean;
    transcriptHeaderUi: MobileProjectsTranscriptHeaderUi;
    transcriptSheetUi: MobileProjectsTranscriptSheetUi;
    executionSurfaceTabsUi: MobileProjectsExecutionSurfaceTabsUi;
    updateTasksAttentionChrome(): void;
    buildHomeGreeting(): string;
    projectDetailHeaderTitle(project: MobileProjectEntry | undefined): string;
    resolveSelectedProject(projects?: MobileProjectEntry[]): MobileProjectEntry | undefined;
    scroll: HTMLElement;
    lastTitleTap: number;

    closeAgentsHubSession(): void;
    navigateBackFromSidebarSecondaryHub(): void;
    closeProjectDiffView(): void;
    closeProjectDetail(): void;
    openWorkHubSessionsSidebar(): void;
}

export class MobileProjectsHubHeaderUi {
    constructor(protected readonly host: MobileProjectsHubHeaderHost) { }

    renderHeader(): void {
        const inProjectDetail = this.host.isProjectDetailView();
        const inProjectDiff = this.host.isProjectDiffView();
        const showSessionsMenu = this.host.homeMode
            && this.host.hubView === 'tasks'
            && this.host.shouldUseAgentsHubLanding()
            && !inProjectDetail
            && !inProjectDiff;
        this.host.sessionsMenuBtn.hidden = !showSessionsMenu;
        this.host.sessionsMenuBtn.setAttribute('aria-hidden', showSessionsMenu ? 'false' : 'true');
        const showHeaderBack = inProjectDetail
            || inProjectDiff
            || this.host.isSidebarSecondaryHubView()
            || (this.host.agentsHubInlineActive && !this.host.shouldUseAgentsHubLanding());
        this.host.headerBackBtn.hidden = !showHeaderBack;
        this.host.headerBackBtn.setAttribute('aria-hidden', showHeaderBack ? 'false' : 'true');
        this.host.titleBlock.classList.toggle('theia-mod-with-back', showHeaderBack);
        if (this.host.isSidebarSecondaryHubView()) {
            this.host.headerBackBtn.title = nls.localize('qaap/mobileProjects/backToAgents', 'Back to agents');
            this.host.headerBackBtn.setAttribute('aria-label', this.host.headerBackBtn.title);
        } else if (inProjectDiff) {
            this.host.headerBackBtn.title = nls.localize('qaap/diff/backToProject', 'Back to project');
            this.host.headerBackBtn.setAttribute('aria-label', this.host.headerBackBtn.title);
        } else {
            this.host.headerBackBtn.title = nls.localize('qaap/mobileProjects/backToProjects', 'Back to projects');
            this.host.headerBackBtn.setAttribute('aria-label', this.host.headerBackBtn.title);
        }

        if (this.host.hubView === 'diff') {
            this.host.titleEl.textContent = nls.localize('qaap/diff/reviewLabel', 'Working changes');
            return;
        }
        if (this.host.hubView === 'chat') {
            this.host.titleEl.textContent = nls.localize('qaap/mobileProjects/chatTitle', 'Chat');
            return;
        }
        if (this.host.hubView === 'tasks') {
            if (this.host.agentsHubInlineActive && this.host.transcriptOpenProject && this.host.transcriptOpenSummary) {
                this.host.titleEl.textContent = this.host.transcriptHeaderUi.resolveTranscriptHeaderTitle(
                    this.host.transcriptOpenProject,
                    this.host.transcriptOpenSummary,
                );
            } else {
                this.host.titleEl.textContent = this.host.shouldUseAgentsHubLanding()
                    ? nls.localize('qaap/mobileBottomBar/hubAgents', 'Agents')
                    : nls.localize('qaap/mobileProjects/tasksHubTitle', 'Tasks');
            }
            this.host.updateTasksAttentionChrome();
            return;
        }
        if (this.host.hubView === 'review') {
            this.host.titleEl.textContent = nls.localize('qaap/mobileProjects/reviewHubTitle', 'Review');
            this.host.titleAttentionEl.hidden = true;
            this.host.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        if (this.host.hubView === 'workflows') {
            this.host.titleEl.textContent = nls.localize('qaap/mobileProjects/workflowsTitle', 'Workflows');
            return;
        }
        if (this.host.hubView === 'routines') {
            this.host.titleEl.textContent = nls.localize('qaap/mobileProjects/routinesTitle', 'Routines');
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'home') {
            this.host.titleEl.textContent = this.host.buildHomeGreeting();
            this.host.titleAttentionEl.hidden = true;
            this.host.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        this.host.titleAttentionEl.hidden = true;
        if (inProjectDetail) {
            this.host.titleEl.textContent = this.host.projectDetailHeaderTitle(this.host.resolveSelectedProject());
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'repos') {
            this.host.titleEl.textContent = nls.localize('qaap/mobileProjects/projectsTitle', 'Projects');
            return;
        }
        if (this.host.homeMode) {
            const appName = FrontendApplicationConfigProvider.get().applicationName?.trim();
            this.host.titleEl.textContent = appName || nls.localize('qaap/mobileProjects/title', 'Work Hub');
            return;
        }
        this.host.titleEl.textContent = nls.localize('qaap/mobileProjects/title', 'Work Hub');
        this.syncAgentsHubAccountChrome();
    }

    syncAgentsHubAccountChrome(): void {
        const hideAccount = this.host.homeMode && (
            (this.host.hubView === 'tasks' && this.host.shouldUseAgentsHubLanding())
            || this.host.isSidebarSecondaryHubView()
        );
        this.host.accountBtn.hidden = hideAccount;
        this.host.accountBtn.style.display = hideAccount ? 'none' : '';
        this.host.accountBtn.setAttribute('aria-hidden', hideAccount ? 'true' : 'false');
        if (hideAccount) {
            dismissQaapAccountMenu();
        }
    }

    projectDetailHeaderTitle(project: MobileProjectEntry | undefined): string {
        if (!project) {
            return nls.localize('qaap/mobileProjects/tasksTitle', 'Tasks');
        }
        return project.name;
    }

    onTitleTap(): void {
        const now = Date.now();
        if (now - this.host.lastTitleTap < 320) {
            scrollElementTo(this.host.scroll, 0, 'smooth');
            this.host.lastTitleTap = 0;
        } else {
            this.host.lastTitleTap = now;
        }
    }

    handleHeaderBackClick(): void {
        if (this.host.agentsHubInlineActive && this.host.shouldUseAgentsHubLanding()) {
            this.host.closeAgentsHubSession();
            return;
        }
        if (this.host.agentsHubInlineActive) {
            this.host.transcriptSheetUi.closeTranscriptSheet();
            return;
        }
        if (this.host.isSidebarSecondaryHubView()) {
            this.host.navigateBackFromSidebarSecondaryHub();
            return;
        }
        if (this.host.isProjectDiffView()) {
            this.host.closeProjectDiffView();
            return;
        }
        const project = this.host.resolveSelectedProject();
        if (project && this.host.executionSurfaceTabsUi.navigateExecutionSurfaceBack(project)) {
            return;
        }
        this.host.closeProjectDetail();
    }

}
