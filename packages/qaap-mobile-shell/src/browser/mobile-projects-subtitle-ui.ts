// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import {
    filterCatalogSections,
    QAAP_WORK_HUB_WORKFLOWS,
    countCatalogItems,
} from '../common/mobile-work-hub-catalog';
import { filterRoutinesByQuery } from '../common/qaap-work-hub-routine';
import { githubRepoKeysForProjects } from './mobile-work-hub-inbox';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { WorkHubHomeSnapshot } from '../common/qaap-work-hub-home';
import type { QaapWorkHubRoutine } from '../common/qaap-work-hub-routine';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';

/** Panel surface for hub subtitle and meta chips. */
export interface MobileProjectsSubtitleHost {
    hubView: MobileProjectsHubView;
    subtitleEl: HTMLElement;
    diffScopedToProject: boolean;
    diffProjectTabs: ReadonlyArray<{ label: string; fileCount: number }>;
    diffScanning: boolean;
    homeMode: boolean;
    query: string;
    workHubRoutines: QaapWorkHubRoutine[];
    workHubRoutinesLoading: boolean;
    workHubRoutinesLoaded: boolean;
    agentsHubInlineActive: boolean;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    tasksHubSurface: 'tasks' | 'chat';
    projects: MobileProjectEntry[];
    inboxPullRequests: QaapGithubPullRequestSummary[];
    inboxPullRequestsLoading: boolean;
    inboxPullRequestsLoaded: boolean;
    inboxGithubSignedIn: boolean | undefined;

    buildHomeSubtitle(snapshot: WorkHubHomeSnapshot): string;
    buildHomeSnapshot(): WorkHubHomeSnapshot;
    renderActiveChatHeaderSubtitle(host: HTMLElement, project: MobileProjectEntry, summary?: QaapAgentConversationSummaryDTO): void;
    shouldUseAgentsHubLanding(): boolean;
    resolveHomePinnedProject(): MobileProjectEntry | undefined;
    localChatsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    countTasksAttention(): { needsYou: number; running: number };
    vpsTasksForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    isProjectDetailView(): boolean;
    resolveSelectedProject(projects?: MobileProjectEntry[]): MobileProjectEntry | undefined;
    isProjectRunning(project: MobileProjectEntry): boolean;
}

/** Hub subtitle line and desktop meta chips under the panel title. */
export class MobileProjectsSubtitleUi {

    constructor(protected readonly host: MobileProjectsSubtitleHost) { }

    renderSubtitle(): void {
        if (this.host.hubView === 'diff') {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            if (this.host.diffScopedToProject) {
                const tab = this.host.diffProjectTabs[0];
                if (!tab || tab.fileCount === 0) {
                    this.host.subtitleEl.textContent = this.host.diffScanning
                        ? nls.localize('qaap/diff/scanningProjects', 'Scanning projects for changes…')
                        : nls.localize('qaap/diff/noChanges', 'No changes to review.');
                } else if (tab.fileCount === 1) {
                    this.host.subtitleEl.textContent = nls.localize(
                        'qaap/diff/oneFileInProject',
                        '1 file · {0}',
                        tab.label,
                    );
                } else {
                    this.host.subtitleEl.textContent = nls.localize(
                        'qaap/diff/nFilesInProject',
                        '{0} files · {1}',
                        String(tab.fileCount),
                        tab.label,
                    );
                }
                return;
            }
            const count = this.host.diffProjectTabs.length;
            this.host.subtitleEl.textContent = count === 1
                ? nls.localize('qaap/diff/oneProjectWithChanges', '1 project with changes')
                : nls.localize('qaap/diff/nProjectsWithChanges', '{0} projects with changes', String(count));
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'home') {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle q-fs-meta';
            this.host.subtitleEl.textContent = this.host.buildHomeSubtitle(this.host.buildHomeSnapshot());
            this.host.subtitleEl.hidden = false;
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'workflows') {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const filtered = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, this.host.query);
            const count = countCatalogItems(filtered);
            this.host.subtitleEl.textContent = nls.localize(
                'qaap/mobileProjects/workflowsSubtitle',
                '{0} agent workflows for the Qaap mobile workbench',
                String(count),
            );
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'routines') {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const visible = filterRoutinesByQuery(this.host.workHubRoutines, this.host.query);
            const running = visible.filter(r => r.lastRunState === 'running').length;
            if (this.host.workHubRoutinesLoading && !this.host.workHubRoutinesLoaded) {
                this.host.subtitleEl.textContent = nls.localize('qaap/mobileProjects/routinesLoading', 'Loading routines…');
            } else if (running > 0) {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/routinesSubtitleRunning',
                    '{0} routines · {1} running on the VPS',
                    String(visible.length),
                    String(running),
                );
            } else {
                this.host.subtitleEl.textContent = visible.length > 0
                    ? nls.localize(
                        'qaap/mobileProjects/routinesSubtitle',
                        '{0} on your VPS',
                        String(visible.length),
                    )
                    : '';
            }
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'tasks') {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            if (this.host.agentsHubInlineActive && this.host.transcriptOpenProject) {
                this.host.renderActiveChatHeaderSubtitle(
                    this.host.subtitleEl,
                    this.host.transcriptOpenProject,
                    this.host.transcriptOpenSummary,
                );
                return;
            }
            if (this.host.shouldUseAgentsHubLanding()) {
                const branchProject = this.host.transcriptOpenProject ?? this.host.resolveHomePinnedProject();
                if (branchProject) {
                    this.host.subtitleEl.hidden = true;
                    this.host.subtitleEl.textContent = '';
                    return;
                }
            }
            if (this.host.tasksHubSurface === 'chat') {
                const chatCount = this.host.projects.reduce(
                    (sum, project) => sum + this.host.localChatsForProject(project).length,
                    0,
                );
                this.host.subtitleEl.textContent = chatCount > 0
                    ? nls.localize(
                        'qaap/mobileProjects/chatSubtitleCount',
                        '{0} local chat sessions · saved on this device',
                        String(chatCount),
                    )
                    : nls.localize(
                        'qaap/mobileProjects/chatSubtitleEmpty',
                        'Local chat sessions saved on this device',
                    );
                return;
            }
            const attention = this.host.countTasksAttention();
            const streamingCount = this.host.projects.reduce(
                (sum, project) => sum + this.host.vpsTasksForProject(project).filter(c => c.status === 'streaming').length,
                0,
            );
            if (attention.needsYou > 0) {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/tasksSubtitleNeedsYou',
                    '{0} need your attention · {1} agents active on the VPS',
                    String(attention.needsYou),
                    String(Math.max(attention.running, streamingCount)),
                );
            } else if (attention.running > 0 || streamingCount > 0) {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/tasksSubtitleRunning',
                    '{0} agents working on the VPS',
                    String(Math.max(attention.running, streamingCount)),
                );
            } else {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/tasksSubtitle',
                    'VPS agent work — keeps running when you close the app',
                );
            }
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'review') {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const prCount = this.host.inboxPullRequests.length;
            const repoCount = githubRepoKeysForProjects(this.host.projects).length;
            if (this.host.inboxPullRequestsLoading && !this.host.inboxPullRequestsLoaded) {
                this.host.subtitleEl.textContent = nls.localize('qaap/mobileProjects/reviewLoading', 'Loading pull requests…');
            } else if (this.host.inboxPullRequestsLoading && this.host.inboxPullRequestsLoaded) {
                this.host.subtitleEl.textContent = nls.localize('qaap/mobileProjects/reviewRefreshing', 'Refreshing pull requests…');
            } else if (repoCount === 0) {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitleNoRepos',
                    'Link a GitHub repository to see open pull requests',
                );
            } else if (this.host.inboxGithubSignedIn === false) {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitleSignIn',
                    'Sign in with GitHub to load pull requests',
                );
            } else if (prCount > 0) {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitleCount',
                    '{0} open pull requests · swipe to review',
                    String(prCount),
                );
            } else {
                this.host.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitle',
                    'Open pull requests across your linked repositories',
                );
            }
            return;
        }
        if (this.host.homeMode && this.host.hubView === 'chat') {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const chatCount = this.host.projects.reduce(
                (sum, project) => sum + this.host.localChatsForProject(project).length,
                0,
            );
            this.host.subtitleEl.textContent = chatCount > 0
                ? nls.localize(
                    'qaap/mobileProjects/chatSubtitleCount',
                    '{0} local chat sessions · saved on this device',
                    String(chatCount),
                )
                : nls.localize(
                    'qaap/mobileProjects/chatSubtitle',
                    'Interactive workspace chat — persists when you close the app',
                );
            return;
        }
        if (this.host.isProjectDetailView()) {
            const project = this.host.resolveSelectedProject();
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            this.host.subtitleEl.hidden = false;
            this.host.subtitleEl.textContent = project ? this.buildProjectBranchSubtitle(project) : '';
            return;
        }
        if (this.host.homeMode) {
            this.host.subtitleEl.className = 'theia-mobile-projects-subtitle';
            this.host.subtitleEl.textContent = nls.localize(
                'qaap/mobileProjects/projectsSubtitle',
                '{0} repositories · search, pin, and open a workspace',
                String(this.host.projects.length),
            );
            return;
        }
        this.host.subtitleEl.className = 'theia-mobile-projects-meta';
        const repoCount = this.host.projects.length;
        const openCount = this.host.projects.filter(p => p.isCurrent).length;
        const runningCount = this.host.projects.filter(p => this.host.isProjectRunning(p)).length;

        this.host.subtitleEl.replaceChildren();
        const reposChip = document.createElement('span');
        reposChip.className = 'theia-mobile-projects-meta-chip';
        reposChip.textContent = nls.localize(
            'qaap/mobileProjects/metaRepos', '{0} repos', String(repoCount)
        );
        this.host.subtitleEl.append(reposChip);

        if (openCount > 0) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-meta-chip theia-mod-open';
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-meta-dot';
            chip.append(dot, document.createTextNode(nls.localize(
                'qaap/mobileProjects/metaOpen', '{0} open', String(openCount)
            )));
            this.host.subtitleEl.append(chip);
        }

        if (runningCount > 0) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-meta-chip theia-mod-running';
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-meta-dot theia-mod-pulse';
            chip.append(dot, document.createTextNode(nls.localize(
                'qaap/mobileProjects/metaRunning', '{0} running', String(runningCount)
            )));
            this.host.subtitleEl.append(chip);
        }
    }

    buildProjectBranchSubtitle(project: MobileProjectEntry): string {
        const parts: string[] = [];
        if (project.branch) {
            parts.push(project.branch);
        }
        if (project.lastActive && project.lastActive !== '—') {
            parts.push(project.lastActive);
        }
        return parts.join(' · ');
    }

}
