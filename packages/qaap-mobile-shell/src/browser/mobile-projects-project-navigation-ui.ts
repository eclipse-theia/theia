// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { disposeComposerContextEntries } from '../common/qaap-composer-context-entry';
import {
    markMobileProjectReadmeForOpen,
    markMobileProjectsPanelDismiss,
} from './mobile-projects-open';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';
import type { TranscriptWorkspaceSurfacesCache } from './qaap-transcript-workspace-surfaces-cache';

export interface MobileProjectsProjectNavigationHost {
    hubView: MobileProjectsHubView;
    expandedId: string | undefined;
    soloExpanded: boolean;
    suppressCurrentAutoExpand: boolean;
    stickyComposerContext: import('../common/qaap-composer-context-entry').StickyComposerContextEntry[];
    stickyComposerPinnedAgentId: string | undefined;
    stickyComposerModeId: string | undefined;
    stickyComposerDraft: string;
    projectDetailExpandedId: string | undefined;
    projectDetailTabStrip: HTMLElement | undefined;
    projectDetailSurfaceTargets: {
        readonly chatHost: HTMLElement;
        readonly planHost: HTMLElement;
        readonly reviewHost: HTMLElement;
        readonly previewHost: HTMLElement;
        readonly filesHost: HTMLElement;
        readonly terminalHost: HTMLElement;
    } | undefined;
    headerExecutionTabsProjectId: string | undefined;
    headerExecutionTabsHost: HTMLElement;
    projects: MobileProjectEntry[];
    projectsService: MobileProjectsService;
    commands: CommandRegistry;
    transcriptWorkspaceSurfaces: TranscriptWorkspaceSurfacesCache;
    homeMode: boolean;
    delegate: {
        onProjectsChanged?(): void;
        onDismiss(): void;
        onCurrentProjectActivated?(project: MobileProjectEntry): void | Promise<void>;
        onWorkspaceOpened?(): void;
    };

    closeCardMenu(): void;
    closeStickyComposerSheets(): void;
    closeExecutionTabOverflowMenu(): void;
    refreshChatServiceSessionSummaries(): Promise<void>;
    render(): void;
    syncLandingHubListChrome(): void;
    renderList(): void;
    projectsForCurrentHubList(): MobileProjectEntry[];
    disposeTranscriptTerminalSlides(workspaceKey?: import('./qaap-transcript-workspace-surfaces-cache').TranscriptWorkspaceSurfaceKey): void;
    refreshProjects(): Promise<void>;
    hide(): void;
    dismissPanelIfSheet(): void;
}

export class MobileProjectsProjectNavigationUi {
    constructor(protected readonly host: MobileProjectsProjectNavigationHost) { }

    async openProjectDetail(project: MobileProjectEntry): Promise<void> {
        this.host.closeCardMenu();
        if (this.host.hubView !== 'repos') {
            this.host.hubView = 'repos';
            this.host.projectsService.setHubView('repos');
        }
        if (this.host.expandedId === project.id) {
            return;
        }
        this.host.expandedId = project.id;
        this.host.soloExpanded = true;
        this.host.closeStickyComposerSheets();
        disposeComposerContextEntries(this.host.stickyComposerContext);
        this.host.stickyComposerContext = [];
        this.host.stickyComposerPinnedAgentId = undefined;
        this.host.stickyComposerModeId = undefined;
        await this.host.refreshChatServiceSessionSummaries();
        this.host.render();
        this.host.syncLandingHubListChrome();
        this.host.delegate.onProjectsChanged?.();
    }

    async toggleRowExpanded(project: MobileProjectEntry): Promise<void> {
        this.host.closeCardMenu();
        const wasExpanded = this.host.expandedId === project.id;
        this.host.expandedId = wasExpanded ? undefined : project.id;
        this.host.suppressCurrentAutoExpand = wasExpanded && project.isCurrent;
        this.host.soloExpanded = this.host.expandedId !== undefined;
        this.host.closeStickyComposerSheets();
        disposeComposerContextEntries(this.host.stickyComposerContext);
        this.host.stickyComposerContext = [];
        this.host.stickyComposerPinnedAgentId = undefined;
        this.host.stickyComposerModeId = undefined;
        if (wasExpanded) {
            this.host.stickyComposerDraft = '';
        }
        await this.host.refreshChatServiceSessionSummaries();
        this.host.renderList();
    }

    closeProjectDetail(): void {
        if (!this.host.expandedId) {
            return;
        }
        const wasCurrent = this.host.projects.some(p => p.id === this.host.expandedId && p.isCurrent);
        this.host.expandedId = undefined;
        this.host.soloExpanded = false;
        if (wasCurrent) {
            this.host.suppressCurrentAutoExpand = true;
        }
        this.host.closeStickyComposerSheets();
        disposeComposerContextEntries(this.host.stickyComposerContext);
        this.host.stickyComposerContext = [];
        this.host.stickyComposerPinnedAgentId = undefined;
        this.host.stickyComposerModeId = undefined;
        this.resetProjectDetailSurfaces();
        this.host.render();
        this.host.syncLandingHubListChrome();
        this.host.delegate.onProjectsChanged?.();
    }

    resetProjectDetailSurfaces(): void {
        this.host.closeExecutionTabOverflowMenu();
        this.host.projectDetailExpandedId = undefined;
        this.host.projectDetailTabStrip = undefined;
        this.host.projectDetailSurfaceTargets = undefined;
        this.host.headerExecutionTabsProjectId = undefined;
        this.host.headerExecutionTabsHost.hidden = true;
        this.host.headerExecutionTabsHost.replaceChildren();
    }

    resolveSelectedProject(
        projects: MobileProjectEntry[] = this.host.projectsForCurrentHubList(),
    ): MobileProjectEntry | undefined {
        if (this.host.expandedId === undefined) {
            return undefined;
        }
        return projects.find(p => p.id === this.host.expandedId)
            ?? this.host.projects.find(p => p.id === this.host.expandedId);
    }

    async openProject(project: MobileProjectEntry): Promise<void> {
        if (project.isCurrent) {
            this.host.hide();
            this.host.delegate.onDismiss();
            await this.host.delegate.onCurrentProjectActivated?.(project);
            return;
        }
        markMobileProjectsPanelDismiss();
        let openedViaReload = false;
        try {
            if (project.github || project.uri) {
                openedViaReload = true;
                await this.host.projectsService.openInCurrentWindowAsync(project);
            } else {
                const openFolder = WorkspaceCommands.OPEN_FOLDER.id;
                if (this.host.commands.getCommand(openFolder)) {
                    markMobileProjectReadmeForOpen();
                    await this.host.commands.executeCommand(openFolder);
                }
            }
        } finally {
            if (openedViaReload) {
                return;
            }
            this.host.dismissPanelIfSheet();
            if (this.host.homeMode) {
                this.host.delegate.onWorkspaceOpened?.();
            }
        }
    }

    async closeCurrentWorkspace(): Promise<void> {
        const commandId = WorkspaceCommands.CLOSE.id;
        if (!this.host.commands.getCommand(commandId) || !this.host.commands.isEnabled(commandId)) {
            return;
        }
        try {
            await this.host.commands.executeCommand(commandId);
            this.host.disposeTranscriptTerminalSlides();
            this.host.transcriptWorkspaceSurfaces.disposeAll();
            await this.host.refreshProjects();
        } catch (error) {
            console.error('[qaap-mobile-projects] close workspace failed:', error);
        }
    }

}
