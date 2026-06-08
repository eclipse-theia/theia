// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { QAAP_GIT_REVIEW_API_PATH, type QaapGitBranchesResponse } from '../common/qaap-git-review';
import type { StickyComposerWorkspaceBarView } from './qaap-sticky-composer-workspace-bar';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import { MobileSnackbar } from './mobile-snackbar';

export interface MobileProjectsStickyComposerWorkspaceHost {
composerWorkspaceBranchByProjectId: Map<string, string>;
preparedCwdByProjectId: Map<string, string>;
projects: MobileProjectEntry[];
agentsHubSelectedProjectId: string | undefined;
agentsHubShellActive: boolean;
stickyComposerWorkspaceSheet: HTMLElement | undefined;
transcriptComposerHost: HTMLElement | undefined;
transcriptComposerProject: MobileProjectEntry | undefined;
transcriptComposerSummary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO | undefined;
projectsService: MobileProjectsService;
delegate: { onProjectsChanged?: () => void };
renderStickyComposer(): void;
render(): void;
renderAgentsHubExecutionShell(): void;
openProject(project: MobileProjectEntry): Promise<void>;
onNewClick(): Promise<void>;
remountTranscriptStickyComposer(): void;
closeStickyComposerSheets(): void;
closeTranscriptComposerSheets(): void;
}

export class MobileProjectsStickyComposerWorkspaceUi {
    constructor(protected readonly host: MobileProjectsStickyComposerWorkspaceHost) { }

    resolveComposerWorkspaceBranch(project: MobileProjectEntry): string {
        return this.host.composerWorkspaceBranchByProjectId.get(project.id)
            ?? project.branch
            ?? this.host.projectsService.getCurrentWorkspaceBranch()
            ?? 'main';
    }
    async refreshComposerWorkspaceBranch(project: MobileProjectEntry): Promise<string> {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            return this.resolveComposerWorkspaceBranch(project);
        }
        try {
            const params = new URLSearchParams({ root: cwd });
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/changes?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!response.ok) {
                return this.resolveComposerWorkspaceBranch(project);
            }
            const payload = await response.json() as { branch?: string };
            if (payload.branch) {
                this.host.composerWorkspaceBranchByProjectId.set(project.id, payload.branch);
                return payload.branch;
            }
        } catch {
            /* optional */
        }
        return this.resolveComposerWorkspaceBranch(project);
    }
    resolveComposerWorkspaceBarView(project: MobileProjectEntry): StickyComposerWorkspaceBarView {
        return {
            projectName: project.name,
            branchName: this.resolveComposerWorkspaceBranch(project),
        };
    }
    remountComposerWithWorkspaceBar(project: MobileProjectEntry): void {
        if (this.host.transcriptComposerHost?.isConnected && this.host.transcriptComposerProject && this.host.transcriptComposerSummary) {
            this.host.remountTranscriptStickyComposer();
            return;
        }
        this.host.renderStickyComposer();
        void this.refreshComposerWorkspaceBranch(project).then(() => {
            if (this.host.transcriptComposerHost?.isConnected) {
                this.host.remountTranscriptStickyComposer();
            } else {
                this.host.renderStickyComposer();
            }
        });
    }
    openComposerWorkspaceProjectSheet(project: MobileProjectEntry, transcriptOverlay = false): void {
        this.host.closeStickyComposerSheets();
        this.host.closeTranscriptComposerSheets();
        const sheet = document.createElement('div');
        sheet.className = transcriptOverlay
            ? 'theia-mobile-sticky-composer-sheet theia-mod-workspace theia-mod-transcript-overlay'
            : 'theia-mobile-sticky-composer-sheet theia-mod-workspace';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.host.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/composerWorkspace/projectSheetTitle', 'Project');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.host.closeStickyComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        const label = document.createElement('div');
        label.className = 'theia-mobile-sticky-composer-sheet-section-label';
        label.textContent = nls.localize('qaap/composerWorkspace/projectSheetSection', 'Repository');
        list.append(label);

        for (const entry of this.host.projects) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-sticky-composer-sheet-option';
            if (entry.id === project.id) {
                btn.classList.add('theia-mod-selected');
            }
            const content = document.createElement('span');
            content.className = 'theia-mobile-sticky-composer-sheet-option-content';
            const name = document.createElement('span');
            name.className = 'theia-mobile-sticky-composer-sheet-option-label';
            name.textContent = entry.name;
            content.append(name);
            if (entry.id === project.id) {
                const check = document.createElement('span');
                check.className = 'codicon codicon-check theia-mobile-sticky-composer-sheet-option-check';
                check.setAttribute('aria-hidden', 'true');
                content.append(check);
            }
            btn.append(content);
            btn.addEventListener('click', () => {
                this.host.closeStickyComposerSheets();
                if (entry.id === project.id) {
                    return;
                }
                this.host.agentsHubSelectedProjectId = entry.id;
                void this.host.projectsService.prepareProjectCwd(entry).then(cwd => {
                    if (cwd) {
                        this.host.preparedCwdByProjectId.set(entry.id, cwd);
                    }
                    if (this.host.agentsHubShellActive) {
                        this.host.renderAgentsHubExecutionShell();
                        return;
                    }
                    if (entry.isCurrent) {
                        this.remountComposerWithWorkspaceBar(entry);
                        return;
                    }
                    void this.host.openProject(entry);
                });
            });
            list.append(btn);
        }

        const actionsLabel = document.createElement('div');
        actionsLabel.className = 'theia-mobile-sticky-composer-sheet-section-label';
        actionsLabel.textContent = nls.localize('qaap/composerWorkspace/projectSheetActions', 'Add');
        list.append(actionsLabel);
        list.append(this.createComposerProjectSheetAction({
            iconClass: 'codicon-repo-clone',
            label: nls.localize('qaap/mobileProjects/newRepository', 'Add repository'),
            onSelect: () => {
                this.host.closeStickyComposerSheets();
                void this.host.onNewClick();
            },
        }));
        list.append(this.createComposerProjectSheetAction({
            iconClass: 'codicon-add',
            label: nls.localize('qaap/mobileOpenRepo/startNewProject', 'Start new project'),
            onSelect: () => {
                this.host.closeStickyComposerSheets();
                void this.onCreateNewProjectFromSheet();
            },
        }));

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.host.stickyComposerWorkspaceSheet = sheet;
    }
    createComposerProjectSheetAction(options: {
        readonly iconClass: string;
        readonly label: string;
        readonly onSelect: () => void;
    }): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-sticky-composer-sheet-option theia-mod-action';
        const content = document.createElement('span');
        content.className = 'theia-mobile-sticky-composer-sheet-option-content';
        const icon = document.createElement('span');
        icon.className = `codicon ${options.iconClass} theia-mobile-sticky-composer-sheet-option-icon`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-sticky-composer-sheet-option-label';
        label.textContent = options.label;
        content.append(icon, label);
        btn.append(content);
        btn.addEventListener('click', () => options.onSelect());
        return btn;
    }
    async onCreateNewProjectFromSheet(): Promise<void> {
        const nextProjects = await this.host.projectsService.createGithubProject();
        if (!nextProjects) {
            return;
        }
        this.host.projects = nextProjects;
        this.host.render();
        this.host.delegate.onProjectsChanged?.();
    }
    openComposerWorkspaceBranchSheet(project: MobileProjectEntry, transcriptOverlay = false): void {
        this.host.closeStickyComposerSheets();
        this.host.closeTranscriptComposerSheets();
        const sheet = document.createElement('div');
        sheet.className = transcriptOverlay
            ? 'theia-mobile-sticky-composer-sheet theia-mod-workspace theia-mod-transcript-overlay'
            : 'theia-mobile-sticky-composer-sheet theia-mod-workspace';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.host.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/composerWorkspace/branchSheetTitle', 'Branch');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.host.closeStickyComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        const loading = document.createElement('p');
        loading.className = 'theia-mobile-sticky-composer-sheet-loading';
        loading.textContent = nls.localize('qaap/composerWorkspace/branchLoading', 'Loading branches…');
        list.append(loading);

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.host.stickyComposerWorkspaceSheet = sheet;

        void this.loadComposerWorkspaceBranchSheet(project, list);
    }
    async loadComposerWorkspaceBranchSheet(
        project: MobileProjectEntry,
        list: HTMLElement,
    ): Promise<void> {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            list.replaceChildren();
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-sticky-composer-sheet-loading';
            empty.textContent = nls.localize(
                'qaap/composerWorkspace/branchUnavailable',
                'Open this project in the workspace to switch branches.',
            );
            list.append(empty);
            return;
        }
        try {
            const params = new URLSearchParams({ root: cwd });
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/branches?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const payload = await response.json() as QaapGitBranchesResponse;
            if (this.host.stickyComposerWorkspaceSheet === undefined || !list.isConnected) {
                return;
            }
            const current = payload.current ?? this.resolveComposerWorkspaceBranch(project);
            list.replaceChildren();
            if (payload.branches.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'theia-mobile-sticky-composer-sheet-loading';
                empty.textContent = nls.localize('qaap/composerWorkspace/branchEmpty', 'No local branches found.');
                list.append(empty);
                return;
            }
            for (const branch of payload.branches) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'theia-mobile-sticky-composer-sheet-option';
                if (branch === current) {
                    btn.classList.add('theia-mod-selected');
                }
                const content = document.createElement('span');
                content.className = 'theia-mobile-sticky-composer-sheet-option-content';
                const label = document.createElement('span');
                label.className = 'theia-mobile-sticky-composer-sheet-option-label';
                label.textContent = branch;
                content.append(label);
                if (branch === current) {
                    const check = document.createElement('span');
                    check.className = 'codicon codicon-check theia-mobile-sticky-composer-sheet-option-check';
                    check.setAttribute('aria-hidden', 'true');
                    content.append(check);
                }
                btn.append(content);
                btn.addEventListener('click', () => {
                    void this.checkoutComposerWorkspaceBranch(project, branch);
                });
                list.append(btn);
            }
        } catch (error) {
            list.replaceChildren();
            const failed = document.createElement('p');
            failed.className = 'theia-mobile-sticky-composer-sheet-loading';
            failed.textContent = error instanceof Error ? error.message : String(error);
            list.append(failed);
        }
    }
    async checkoutComposerWorkspaceBranch(
        project: MobileProjectEntry,
        branch: string,
    ): Promise<void> {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            return;
        }
        try {
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/checkout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ root: cwd, branch }),
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const payload = await response.json() as { branch?: string };
            if (payload.branch) {
                this.host.composerWorkspaceBranchByProjectId.set(project.id, payload.branch);
            }
            this.host.closeStickyComposerSheets();
            this.remountComposerWithWorkspaceBar(project);
            MobileSnackbar.show(
                nls.localize('qaap/composerWorkspace/branchSwitched', 'Switched to {0}', payload.branch ?? branch),
                { kind: 'success', duration: 1600 },
            );
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            MobileSnackbar.show(
                nls.localize('qaap/composerWorkspace/branchSwitchFailed', 'Could not switch branch: {0}', detail),
                { kind: 'warning', duration: 2600 },
            );
        }
    }
}

