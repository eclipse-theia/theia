// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import {
    mountEmbeddedAgentPreviewChrome,
    type EmbeddedAgentPreviewChrome,
} from '@theia/qaap-adapters/lib/browser/qaap-agent-preview-chrome';
import { normalizePreviewUrlForSameOrigin } from '@theia/qaap-adapters/lib/browser/qaap-preview-url-utils';
import type { QaapPreviewSurfaceRegistry } from '@theia/qaap-adapters/lib/browser/qaap-preview-surface-registry';
import type { QaapPreviewInspectorDeps } from '@theia/qaap-adapters/lib/browser/qaap-preview-inline-inspector';
import {
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
    type QaapAgentMessageSegmentDTO,
} from '../common/qaap-agent-conversation-client';
import { reconcileAgentApprovalPolicyId, type QaapAgentApprovalPolicyId } from '../common/qaap-sticky-composer-approval-policy';
import { resolveTranscriptWorkspaceCwd } from '../common/qaap-transcript-workspace-cwd';
import type { ExecutionSurfaceTabId } from '../common/qaap-execution-surface-tabs';
import { probeQaapDevPreviewPort, toDevPreviewUrl } from './qaap-dev-preview-client';
import { ensureTranscriptDevPreview, extractDevPreviewPortFromUrl } from './qaap-transcript-preview-bootstrap';
import type { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import type { QaapDiffReviewWidget } from './qaap-diff-review-widget';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import {
    mountTranscriptFilesView,
    type TranscriptFilesViewServices,
} from './qaap-transcript-files-view';
import {
    createTranscriptTerminalStagingHost,
    createTranscriptTerminalSurface,
    scheduleTranscriptTerminalResize,
    type TranscriptTerminalSurface,
    type TranscriptTerminalViewServices,
} from './qaap-transcript-terminal-view';
import {
    normalizeTranscriptWorkspaceKey,
    TranscriptWorkspaceSurfacesCache,
    type TranscriptWorkspaceSurfaceKey,
} from './qaap-transcript-workspace-surfaces-cache';
import type { MobileProjectsTranscriptHistoryUi } from './mobile-projects-transcript-history-ui';
import type { MobileProjectsTranscriptComposerUi } from './mobile-projects-transcript-composer-ui';
import type { MobileProjectsTranscriptHeaderUi } from './mobile-projects-transcript-header-ui';
import type { MobileProjectsExecutionSurfaceTabsUi } from './mobile-projects-execution-surface-tabs-ui';
import type { MobileProjectsTranscriptMessagesUi } from './mobile-projects-transcript-messages-ui';

type TranscriptTab = ExecutionSurfaceTabId;

interface TranscriptTerminalSliderState {
    surfaces: TranscriptTerminalSurface[];
    activeIndex: number;
}

/** Panel surface for Plan, Changes, Preview, Files, and Terminal execution tabs. */
export interface MobileProjectsTranscriptSurfacesHost {
    transcriptSheet: HTMLElement | undefined;
    agentsHubShellActive: boolean;
    transcriptPreviewHost: HTMLElement | undefined;
    transcriptFilesHost: HTMLElement | undefined;
    transcriptTerminalHost: HTMLElement | undefined;
    transcriptReviewHost: HTMLElement | undefined;
    transcriptReviewDiffHost: HTMLElement | undefined;
    transcriptReviewChecksHost: HTMLElement | undefined;
    transcriptHeaderSubtitle: HTMLElement | undefined;
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptEmbeddedPreview: EmbeddedAgentPreviewChrome | undefined;
    transcriptPreviewRequestRunning: boolean;
    transcriptPreviewRequestPending: boolean;
    readonly transcriptPreviewRecoveryRequests: Set<string>;
    transcriptHistoryPanelOpen: boolean;
    transcriptHistoryPanelHeightPx: number | undefined;
    transcriptHistoryRoot: string | undefined;
    transcriptHistoryLoading: boolean;
    transcriptFilesAttachedKey: TranscriptWorkspaceSurfaceKey | undefined;
    readonly transcriptWorkspaceSurfaces: TranscriptWorkspaceSurfacesCache;
    readonly transcriptTerminalSlidesByWorkspace: Map<TranscriptWorkspaceSurfaceKey, TranscriptTerminalSliderState>;
    transcriptTerminalToolbar: HTMLElement | undefined;
    transcriptTerminalSlider: HTMLElement | undefined;
    transcriptTerminalDots: HTMLElement | undefined;
    transcriptTerminalResizeObserver: ResizeObserver | undefined;
    transcriptComposerModeId: string | undefined;
    transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    transcriptScheduleRefresh: (() => void) | undefined;
    projectDetailSurfaceTargets: {
        chatHost: HTMLElement;
        planHost: HTMLElement;
        reviewHost: HTMLElement;
        previewHost: HTMLElement;
        filesHost: HTMLElement;
        terminalHost: HTMLElement;
    } | undefined;
    projects: MobileProjectEntry[];
    preparedCwdByProjectId: Map<string, string>;
    projectsService: MobileProjectsService;
    diffReviewWidget: QaapDiffReviewWidget | undefined;
    createDiffReviewWidget: (() => Promise<QaapDiffReviewWidget>) | undefined;
    createTranscriptFilesViewServices: (() => TranscriptFilesViewServices | undefined) | undefined;
    createTranscriptTerminalViewServices: (() => TranscriptTerminalViewServices | undefined) | undefined;
    messageService: MessageService | undefined;
    previewClipboard: ClipboardService;
    previewSurfaceRegistry: QaapPreviewSurfaceRegistry | undefined;
    previewInspectorDeps: QaapPreviewInspectorDeps | undefined;
    transcriptMessagesUi: MobileProjectsTranscriptMessagesUi;
    transcriptComposerUi: MobileProjectsTranscriptComposerUi;
    transcriptHeaderUi: MobileProjectsTranscriptHeaderUi;
    executionSurfaceTabsUi: MobileProjectsExecutionSurfaceTabsUi;

    renderChecksSection(
        host: HTMLElement | undefined,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        options?: { readonly embedded?: boolean },
    ): void;
    attachDiffReviewWidget(host: HTMLElement): void;
    detachDiffReviewWidgetFromHost(): void;
    selectTranscriptTab(tab: TranscriptTab, project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
    submitTranscriptViaBackendConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        message: string,
        options: {
            selectedAgentId?: string;
            modeId?: string;
            approvalPolicyId?: QaapAgentApprovalPolicyId;
        },
    ): Promise<void>;
    resolveTranscriptComposerPinnedAgentId(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string | undefined;
    refreshTranscriptChecksViews(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
    setAutoVerifyEnabled(cwd: string | undefined, on: boolean): void;
    onResumePreview?(project: MobileProjectEntry): void | Promise<void>;
    projectBootstrap?: QaapProjectBootstrapService;
}

/** Execution-surface tab content: plan, review, preview, files, and terminal. */
export class MobileProjectsTranscriptSurfacesUi {

    protected readonly transcriptPreviewEnsureRequests = new Set<string>();

    constructor(
        protected readonly host: MobileProjectsTranscriptSurfacesHost,
        protected readonly transcriptHistoryUi: MobileProjectsTranscriptHistoryUi,
    ) { }

    mountProjectDetailSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        switch (tab) {
            case 'plan':
                this.renderPlanTab(this.host.projectDetailSurfaceTargets?.planHost, undefined);
                break;
            case 'review':
                void this.mountProjectDetailReviewWidget(project);
                break;
            case 'preview':
                this.renderPreviewTab(project, summary);
                break;
            case 'files':
                this.ensureTranscriptFilesTab(project, summary);
                break;
            case 'terminal':
                void this.ensureTranscriptTerminalTab(project, summary);
                break;
            default:
                break;
        }
    }

    async mountProjectDetailReviewWidget(project: MobileProjectEntry): Promise<void> {
        const host = this.host.projectDetailSurfaceTargets?.reviewHost;
        if (!host || !this.host.createDiffReviewWidget) {
            return;
        }
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-review-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/reviewUnavailable',
                'Review is unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        host.replaceChildren();
        const diffHost = document.createElement('div');
        diffHost.className = 'theia-mobile-transcript-review-diff-host';
        host.append(diffHost);
        const rootUri = project.uri?.toString() ?? `file://${cwd}`;
        if (!this.host.diffReviewWidget) {
            this.host.diffReviewWidget = await this.host.createDiffReviewWidget();
        }
        if (!host.isConnected) {
            return;
        }
        this.host.diffReviewWidget.enableTranscriptEmbed({ externalChrome: true });
        this.host.diffReviewWidget.node.classList.add('theia-mobile-transcript-diff-embed');
        this.host.diffReviewWidget.setTranscriptAgentFeedbackHandler(async () => { /* project-level — use composer below */ });
        this.host.attachDiffReviewWidget(diffHost);
        this.host.diffReviewWidget.setRepositoryContext({
            rootUri,
            rootFsPath: cwd,
            isActiveWorkspace: project.isCurrent,
        });
    }

    /** Prefer transcript sheet hosts while the modal is open — project detail may still exist underneath. */
    executionSurfaceHost(
        transcriptHost: HTMLElement | undefined,
        projectDetailHost: HTMLElement | undefined,
    ): HTMLElement | undefined {
        if ((this.host.transcriptSheet || this.host.agentsHubShellActive) && transcriptHost) {
            return transcriptHost;
        }
        return projectDetailHost ?? transcriptHost;
    }

    executionPreviewHost(): HTMLElement | undefined {
        return this.executionSurfaceHost(
            this.host.transcriptPreviewHost,
            this.host.projectDetailSurfaceTargets?.previewHost,
        );
    }

    executionFilesHost(): HTMLElement | undefined {
        return this.executionSurfaceHost(
            this.host.transcriptFilesHost,
            this.host.projectDetailSurfaceTargets?.filesHost,
        );
    }

    executionTerminalHost(): HTMLElement | undefined {
        return this.executionSurfaceHost(
            this.host.transcriptTerminalHost,
            this.host.projectDetailSurfaceTargets?.terminalHost,
        );
    }

    renderPlanTab(host: HTMLElement | undefined, conv: QaapAgentConversationDTO | undefined): void {
        if (!host) {
            return;
        }
        host.replaceChildren();
        const segments = this.latestAgentSegments(conv);
        if (!segments || segments.length === 0) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-plan-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/planEmpty',
                'Plan appears here as soon as the agent starts thinking or using tools.',
            );
            host.append(note);
            return;
        }

        const items = this.host.transcriptMessagesUi.resolveTranscriptActivityItems(segments);
        if (items.length === 0) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-plan-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/planNoActivity',
                'No structured activity has been reported for this turn yet.',
            );
            host.append(note);
            return;
        }

        const done = items.filter(item => item.state === 'done').length;
        const ratio = Math.max(0, Math.min(1, done / Math.max(items.length, 1)));
        const head = document.createElement('div');
        head.className = 'theia-mobile-transcript-plan-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-transcript-plan-label';
        label.textContent = nls.localize('qaap/mobileProjects/planLabel', 'Execution plan');
        const stat = document.createElement('span');
        stat.className = 'theia-mobile-transcript-review-checks-stat';
        stat.textContent = nls.localize(
            'qaap/mobileProjects/planProgress',
            '{0}/{1}',
            String(done),
            String(items.length),
        );
        head.append(label, stat);

        const progress = document.createElement('div');
        progress.className = 'theia-mobile-transcript-plan-prog';
        const bar = document.createElement('i');
        bar.style.width = `${Math.round(ratio * 100)}%`;
        progress.append(bar);

        const list = document.createElement('div');
        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'theia-mobile-transcript-plan-step';
            if (item.state === 'done') {
                row.classList.add('theia-mod-done');
            }
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-transcript-plan-dot';
            if (item.state === 'done') {
                dot.classList.add('theia-mod-done');
            } else if (item.state === 'running' || item.state === 'thinking') {
                dot.classList.add('theia-mod-current');
            }
            const text = document.createElement('span');
            text.className = 'theia-mobile-transcript-plan-text';
            text.textContent = item.label;
            row.append(dot, text);
            list.append(row);
        }

        host.append(head, progress, list);
    }

    latestAgentSegments(conv: QaapAgentConversationDTO | undefined): QaapAgentMessageSegmentDTO[] | undefined {
        if (!conv) {
            return undefined;
        }
        for (let i = conv.messages.length - 1; i >= 0; i--) {
            const msg = conv.messages[i];
            if (msg.role !== 'agent') {
                continue;
            }
            const segments = this.host.transcriptMessagesUi.resolveTranscriptAgentSegments(conv, msg);
            if (segments && segments.length > 0) {
                return segments;
            }
        }
        return undefined;
    }

    transcriptConversationMeta(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        const agentLabel = summary.agentId ? `@${summary.agentId.replace(/^@/, '')}` : '';
        return agentLabel ? `${project.name} · ${agentLabel}` : project.name;
    }

    updateTranscriptHeader(
        project: MobileProjectEntry,
        summary = this.host.transcriptOpenSummary,
    ): void {
        const titleEl = this.host.transcriptSheet?.querySelector('.theia-mobile-agent-log-header h2');
        const subtitle = this.host.transcriptHeaderSubtitle;
        if (!titleEl || !subtitle) {
            return;
        }
        titleEl.textContent = summary
            ? this.host.transcriptHeaderUi.resolveTranscriptHeaderTitle(project, summary)
            : project.name;
        subtitle.hidden = false;
        this.host.transcriptHeaderUi.renderActiveChatHeaderSubtitle(subtitle, project, summary);
    }

    async mountTranscriptReviewWidget(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        const host = this.host.transcriptReviewHost;
        if (!host || !this.host.createDiffReviewWidget) {
            return;
        }
        const cwd = summary.cwd ?? this.host.projectsService.getProjectCwd(project);
        if (!cwd) {
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-review-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/reviewUnavailable',
                'Review is unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        host.replaceChildren();
        const diffHost = document.createElement('div');
        diffHost.className = 'theia-mobile-transcript-review-diff-host';
        const historyResizeHandle = document.createElement('div');
        historyResizeHandle.className = 'theia-mobile-transcript-history-resize';
        historyResizeHandle.setAttribute('role', 'separator');
        historyResizeHandle.setAttribute('aria-orientation', 'horizontal');
        historyResizeHandle.setAttribute('aria-label', nls.localize('qaap/mobileProjects/historyResizePanel', 'Resize history panel'));
        historyResizeHandle.hidden = !this.host.transcriptHistoryPanelOpen;
        const historyPanel = document.createElement('div');
        historyPanel.className = 'theia-mobile-transcript-history-panel';
        historyPanel.hidden = !this.host.transcriptHistoryPanelOpen;
        if (this.host.transcriptHistoryPanelHeightPx !== undefined) {
            historyPanel.style.setProperty('--qaap-transcript-history-height', `${this.host.transcriptHistoryPanelHeightPx}px`);
        }
        const dock = document.createElement('div');
        dock.className = 'theia-mobile-transcript-changes-dock';
        const dockControls = document.createElement('div');
        dockControls.className = 'theia-mobile-transcript-changes-controls';
        const checksHost = document.createElement('div');
        checksHost.className = 'theia-mobile-transcript-review-checks';
        const historyToggleHost = document.createElement('div');
        historyToggleHost.className = 'theia-mobile-transcript-history-toggle-host';
        dockControls.append(checksHost, historyToggleHost);
        dock.append(dockControls);
        host.append(diffHost, historyResizeHandle, historyPanel, dock);
        this.host.transcriptReviewDiffHost = diffHost;
        this.host.transcriptReviewChecksHost = checksHost;
        this.host.transcriptHistoryRoot = cwd;
        this.transcriptHistoryUi.installTranscriptHistoryResize(historyResizeHandle, historyPanel);

        const rootUri = project.uri?.toString() ?? `file://${cwd}`;
        if (!this.host.diffReviewWidget) {
            this.host.diffReviewWidget = await this.host.createDiffReviewWidget();
        }
        if (this.host.transcriptReviewHost !== host || !diffHost.isConnected) {
            return;
        }
        this.host.diffReviewWidget.enableTranscriptEmbed({ externalChrome: true });
        this.host.diffReviewWidget.node.classList.add('theia-mobile-transcript-diff-embed');
        this.host.diffReviewWidget.setTranscriptAgentFeedbackHandler(async message => {
            await this.submitTranscriptReviewFeedback(project, summary, message);
        });
        this.host.attachDiffReviewWidget(diffHost);
        this.host.diffReviewWidget.setRepositoryContext({
            rootUri,
            rootFsPath: cwd,
            isActiveWorkspace: project.isCurrent,
        });
        this.host.renderChecksSection(checksHost, project, summary, { embedded: true });
        this.transcriptHistoryUi.renderTranscriptHistoryToggle(historyToggleHost, historyPanel, historyResizeHandle, cwd);
        this.transcriptHistoryUi.renderTranscriptHistoryPanel(historyPanel, cwd);
    }

    async submitTranscriptReviewFeedback(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        message: string,
    ): Promise<void> {
        const chatHost = this.host.transcriptChatHost;
        if (!chatHost) {
            return;
        }
        try {
            await this.host.submitTranscriptViaBackendConversation(project, summary, message, {
                selectedAgentId: this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary),
                modeId: this.host.transcriptComposerModeId,
                approvalPolicyId: reconcileAgentApprovalPolicyId(
                    this.host.transcriptComposerApprovalPolicyId,
                    summary.cwd,
                ),
            });
            this.host.executionSurfaceTabsUi.selectTranscriptTab('messages', project, summary);
        } catch (error) {
            this.host.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    detachTranscriptReviewWidget(): void {
        if (!this.host.diffReviewWidget?.isAttached || !this.host.transcriptReviewDiffHost) {
            return;
        }
        if (this.host.transcriptReviewDiffHost.contains(this.host.diffReviewWidget.node)) {
            this.host.detachDiffReviewWidgetFromHost();
            this.host.diffReviewWidget.node.classList.remove('theia-mobile-transcript-diff-embed');
            this.host.diffReviewWidget.setTranscriptAgentFeedbackHandler(undefined);
            this.host.diffReviewWidget.setReviewStatsChangeHandler(undefined);
        }
        this.host.transcriptReviewDiffHost = undefined;
        this.host.transcriptReviewChecksHost = undefined;
        this.host.transcriptHistoryRoot = undefined;
        this.host.transcriptHistoryLoading = false;
    }

    disposeTranscriptEmbeddedPreview(): void {
        this.host.transcriptEmbeddedPreview?.dispose();
        this.host.transcriptEmbeddedPreview = undefined;
    }

    mountTranscriptEmbeddedPreview(host: HTMLElement, previewUrl: string): void {
        if (this.host.transcriptEmbeddedPreview) {
            this.host.transcriptEmbeddedPreview.setUrl(previewUrl);
            if (!host.contains(this.host.transcriptEmbeddedPreview.root)) {
                host.append(this.host.transcriptEmbeddedPreview.root);
            }
            return;
        }
        this.host.transcriptEmbeddedPreview = mountEmbeddedAgentPreviewChrome(host, {
            url: previewUrl,
            messageService: this.host.messageService,
            clipboard: this.host.previewClipboard,
            previewSurfaces: this.host.previewSurfaceRegistry,
            inspectorDeps: this.host.previewInspectorDeps,
            notify: (message, kind) => {
                MobileSnackbar.show(message, { kind: kind === 'warn' ? 'warning' : 'success' });
            },
            openExternal: target => {
                window.open(target, '_blank', 'noopener,noreferrer');
            },
        });
    }

    renderPreviewTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        const host = this.executionPreviewHost();
        if (!host) {
            return;
        }

        const conv = this.host.transcriptLastConv;
        const latestProject = this.host.projects.find(candidate => candidate.id === project.id) ?? project;
        const previewUrl = this.resolveTranscriptPreviewUrl(latestProject, conv);
        if (previewUrl) {
            this.host.transcriptPreviewRequestPending = false;
            this.host.transcriptPreviewRequestRunning = false;
            void this.ensureTranscriptPreviewServing(project, summary, previewUrl);
            if (latestProject.previewUrl !== previewUrl) {
                void this.host.projectsService.recordProjectPreviewUrl(latestProject, previewUrl)
                    .then(() => {
                        this.host.projects = this.host.projects.map(candidate => candidate.id === latestProject.id
                            ? { ...candidate, previewUrl }
                            : candidate);
                    });
            }
            host.replaceChildren();
            this.mountTranscriptEmbeddedPreview(host, previewUrl);
            return;
        }

        const waitingForPreview = this.isTranscriptPreviewWaiting(conv);
        if (waitingForPreview) {
            this.recoverTranscriptPreviewUrl(project, summary);
        }

        const canKeepEmptyPreview = this.host.transcriptEmbeddedPreview?.root.isConnected === true
            && host.contains(this.host.transcriptEmbeddedPreview.root)
            && this.host.transcriptEmbeddedPreview.root.classList.contains('theia-mod-empty-preview');
        if (canKeepEmptyPreview) {
            this.updateTranscriptPreviewRunButtonState(conv);
            return;
        }

        this.disposeTranscriptEmbeddedPreview();
        host.replaceChildren();
        this.mountTranscriptEmptyPreview(host, project, summary);
    }

    isTranscriptPreviewWaiting(conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv): boolean {
        return this.host.transcriptPreviewRequestRunning
            || this.host.transcriptPreviewRequestPending
            || conv?.status === 'streaming';
    }

    findTranscriptPreviewRunButton(): HTMLButtonElement | undefined {
        const button = this.host.transcriptEmbeddedPreview?.root.querySelector('.theia-mobile-transcript-preview-run');
        return button instanceof HTMLButtonElement ? button : undefined;
    }

    updateTranscriptPreviewRunButtonState(conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv): void {
        const button = this.findTranscriptPreviewRunButton();
        if (!button) {
            return;
        }
        const loading = this.isTranscriptPreviewWaiting(conv);
        button.disabled = loading;
        button.classList.toggle('theia-mod-loading', loading);
        const label = loading
            ? nls.localize('qaap/mobileProjects/previewLoading', 'Cargando...')
            : nls.localize('qaap/mobileProjects/previewButton', 'Vista previa');
        button.title = label;
        button.setAttribute('aria-label', label);
        if (loading) {
            button.setAttribute('aria-busy', 'true');
        } else {
            button.removeAttribute('aria-busy');
        }
    }

    recoverTranscriptPreviewUrl(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        if (this.host.transcriptPreviewRecoveryRequests.has(summary.id)) {
            return;
        }
        this.host.transcriptPreviewRecoveryRequests.add(summary.id);
        void this.refreshTranscriptPreviewProject(project, summary).then(latestProject => {
            const conv = this.host.transcriptLastConv;
            const previewUrl = latestProject.previewUrl ?? this.resolveTranscriptPreviewUrl(latestProject, conv);
            if (previewUrl) {
                void this.ensureTranscriptPreviewServing(latestProject, summary, previewUrl);
            }
            if (!previewUrl || this.host.transcriptOpenSummaryId !== summary.id || this.host.executionSurfaceTabsUi.activeExecutionTab(project) !== 'preview') {
                return;
            }
            this.host.projects = this.host.projects.map(candidate => candidate.id === latestProject.id
                ? { ...latestProject, previewUrl }
                : candidate);
            this.renderPreviewTab(latestProject, summary);
        }).finally(() => {
            this.host.transcriptPreviewRecoveryRequests.delete(summary.id);
        });
    }

    protected ensureTranscriptPreviewServing(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        previewUrl: string,
    ): void {
        const bootstrap = this.host.projectBootstrap;
        if (!bootstrap) {
            return;
        }
        const requestKey = `${summary.id}:${previewUrl}`;
        if (this.transcriptPreviewEnsureRequests.has(requestKey)) {
            return;
        }
        const port = extractDevPreviewPortFromUrl(previewUrl);
        this.transcriptPreviewEnsureRequests.add(requestKey);
        void (async () => {
            if (port !== undefined) {
                const probe = await probeQaapDevPreviewPort(port);
                if (probe.ready) {
                    return;
                }
            }
            const readyUrl = await ensureTranscriptDevPreview(bootstrap, {
                previewUrlHint: previewUrl,
                portHint: port,
            });
            if (!readyUrl || this.host.transcriptOpenSummaryId !== summary.id) {
                return;
            }
            if (this.host.executionSurfaceTabsUi.activeExecutionTab(project) !== 'preview') {
                return;
            }
            const latestProject = this.host.projects.find(candidate => candidate.id === project.id) ?? project;
            this.host.projects = this.host.projects.map(candidate => candidate.id === latestProject.id
                ? { ...candidate, previewUrl: readyUrl }
                : candidate);
            void this.host.projectsService.recordProjectPreviewUrl({ ...latestProject, previewUrl: readyUrl }, readyUrl);
            this.host.transcriptPreviewRequestPending = false;
            this.host.transcriptPreviewRequestRunning = false;
            this.renderPreviewTab({ ...latestProject, previewUrl: readyUrl }, summary);
        })().finally(() => {
            this.transcriptPreviewEnsureRequests.delete(requestKey);
        });
    }

    mountTranscriptEmptyPreview(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        const removeEmptyState = (): void => {
            this.host.transcriptEmbeddedPreview?.root.classList.remove('theia-mod-empty-preview');
            this.host.transcriptEmbeddedPreview?.root.querySelector('.theia-mobile-transcript-preview-empty-overlay')?.remove();
        };
        this.host.transcriptEmbeddedPreview = mountEmbeddedAgentPreviewChrome(host, {
            url: 'about:blank',
            messageService: this.host.messageService,
            clipboard: this.host.previewClipboard,
            previewSurfaces: this.host.previewSurfaceRegistry,
            inspectorDeps: this.host.previewInspectorDeps,
            onNavigate: removeEmptyState,
            notify: (message, kind) => {
                MobileSnackbar.show(message, { kind: kind === 'warn' ? 'warning' : 'success' });
            },
            openExternal: target => {
                window.open(target, '_blank', 'noopener,noreferrer');
            },
        });
        this.host.transcriptEmbeddedPreview.root.classList.add('theia-mod-empty-preview');
        const input = this.host.transcriptEmbeddedPreview.root.querySelector<HTMLInputElement>('.theia-mini-browser-url-field input');
        if (input) {
            input.value = '';
            input.placeholder = nls.localize('qaap/mobileProjects/previewUrlPlaceholder', 'Ingresa una URL');
        }
        const content = this.host.transcriptEmbeddedPreview.root.querySelector<HTMLElement>('.qaap-preview-content-area');
        if (!content) {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'theia-mobile-transcript-preview-empty-overlay';
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-transcript-preview-empty';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-transcript-preview-run';
        const ring = document.createElement('span');
        ring.className = 'theia-mobile-transcript-preview-run-ring';
        ring.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('i');
        icon.className = 'codicon codicon-play';
        icon.setAttribute('aria-hidden', 'true');
        btn.append(ring, icon);
        btn.addEventListener('click', () => { void this.requestTranscriptPreview(project, summary); });
        wrap.append(btn);
        overlay.append(wrap);
        content.append(overlay);
        this.updateTranscriptPreviewRunButtonState();
    }

    /**
     * Workspace path for transcript Files/Terminal.
     * Hub project URI locally; on the VPS, {@link QaapAgentConversationSummaryDTO.cwd} wins for agent tasks.
     */
    resolveTranscriptProjectCwd(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string | undefined {
        return resolveTranscriptWorkspaceCwd({
            summary,
            projectCwd: this.host.projectsService.getProjectCwd(project),
            preparedCwd: this.host.preparedCwdByProjectId.get(project.id),
        });
    }

    resolveTranscriptWorkspaceKey(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): TranscriptWorkspaceSurfaceKey | undefined {
        const cwd = this.resolveTranscriptProjectCwd(project, summary);
        if (!cwd) {
            return undefined;
        }
        const terminalServices = this.host.createTranscriptTerminalViewServices?.();
        const resolved = terminalServices ? terminalServices.resolveCwd(cwd) : cwd;
        return normalizeTranscriptWorkspaceKey(resolved);
    }

    ensureTranscriptFilesTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        const host = this.executionFilesHost();
        if (!host) {
            return;
        }
        const workspaceKey = this.resolveTranscriptWorkspaceKey(project, summary);
        if (!workspaceKey && project.github && this.host.projectsService) {
            void this.host.projectsService.prepareProjectCwd(project).then(prepared => {
                if (!prepared || !this.executionFilesHost()?.isConnected || this.host.executionSurfaceTabsUi.activeExecutionTab(project) !== 'files') {
                    return;
                }
                this.host.preparedCwdByProjectId.set(project.id, prepared);
                this.ensureTranscriptFilesTab(project, summary);
            });
        }
        if (!workspaceKey) {
            this.detachTranscriptFilesFromHost();
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-files-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/filesUnavailable',
                'Files are unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        if (this.host.transcriptFilesAttachedKey === workspaceKey && host.querySelector('.theia-mobile-transcript-files')) {
            return;
        }
        this.detachTranscriptFilesFromHost();
        const cwd = this.resolveTranscriptProjectCwd(project, summary);
        const services = this.host.createTranscriptFilesViewServices?.();
        if (!cwd || !services) {
            return;
        }
        const wrappedServices: TranscriptFilesViewServices = {
            ...services,
            renderMarkdownPreview: services.renderMarkdownPreview
                ? (resourcePath, markdown) => services.renderMarkdownPreview!(
                    resourcePath,
                    this.host.transcriptMessagesUi.cleanTranscriptDisplayText(markdown),
                )
                : undefined,
        };
        let mount = this.host.transcriptWorkspaceSurfaces.peekFiles(workspaceKey);
        if (!mount) {
            const stash = document.createElement('div');
            stash.className = 'theia-mobile-transcript-files-staging';
            stash.hidden = true;
            stash.setAttribute('aria-hidden', 'true');
            document.body.append(stash);
            mount = mountTranscriptFilesView(stash, cwd, wrappedServices);
            this.host.transcriptWorkspaceSurfaces.setFiles(workspaceKey, mount);
        }
        host.replaceChildren();
        host.append(mount.root);
        this.host.transcriptFilesAttachedKey = workspaceKey;
        mount.root.querySelector<HTMLElement>('.theia-mobile-transcript-files-preview-body')
            ?.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
    }

    async ensureTranscriptTerminalTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        const host = this.executionTerminalHost();
        if (!host) {
            return;
        }
        const workspaceKey = this.resolveTranscriptWorkspaceKey(project, summary);
        if (!workspaceKey && project.github && this.host.projectsService) {
            void this.host.projectsService.prepareProjectCwd(project).then(prepared => {
                if (!prepared || !this.executionTerminalHost()?.isConnected || this.host.executionSurfaceTabsUi.activeExecutionTab(project) !== 'terminal') {
                    return;
                }
                this.host.preparedCwdByProjectId.set(project.id, prepared);
                void this.ensureTranscriptTerminalTab(project, summary);
            });
        }
        if (!workspaceKey) {
            this.detachTranscriptTerminalFromHost();
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-terminal-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/terminalUnavailable',
                'Terminal is unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        const cwd = this.resolveTranscriptProjectCwd(project, summary);
        const services = this.host.createTranscriptTerminalViewServices?.();
        if (!cwd || !services) {
            return;
        }
        if (!host.isConnected) {
            return;
        }

        this.ensureTranscriptTerminalChrome(host, workspaceKey, cwd, services, project, summary);
        let state = this.host.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!state) {
            state = { surfaces: [], activeIndex: 0 };
            this.host.transcriptTerminalSlidesByWorkspace.set(workspaceKey, state);
        }
        if (state.surfaces.length === 0) {
            await this.createTranscriptTerminalSlide(workspaceKey, cwd, services, project, summary);
            state = this.host.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        }
        if (state && state.surfaces.length > 0) {
            this.renderTranscriptTerminalSlides(workspaceKey);
        }
    }

    ensureTranscriptTerminalChrome(
        host: HTMLElement,
        workspaceKey: TranscriptWorkspaceSurfaceKey,
        cwd: string,
        services: TranscriptTerminalViewServices,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (this.host.transcriptTerminalSlider?.parentElement === host
            && this.host.transcriptTerminalToolbar?.parentElement === host
            && this.host.transcriptTerminalDots?.parentElement === this.host.transcriptTerminalToolbar) {
            return;
        }
        host.classList.add('theia-mobile-transcript-terminal');
        host.replaceChildren();

        const toolbar = document.createElement('div');
        toolbar.className = 'theia-mobile-transcript-terminal-toolbar';
        const switcher = document.createElement('div');
        switcher.className = 'theia-mobile-transcript-terminal-switcher';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'theia-mobile-transcript-terminal-add codicon codicon-add';
        addBtn.title = services.localize('qaap/mobileProjects/transcriptTerminalNew', 'New terminal');
        addBtn.setAttribute('aria-label', addBtn.title);
        addBtn.addEventListener('click', () => {
            void this.createTranscriptTerminalSlide(workspaceKey, cwd, services, project, summary, true);
        });
        toolbar.append(switcher, addBtn);

        const slider = document.createElement('div');
        slider.className = 'theia-mobile-transcript-terminal-slider';
        host.append(toolbar, slider);
        this.host.transcriptTerminalToolbar = toolbar;
        this.host.transcriptTerminalSlider = slider;
        this.host.transcriptTerminalDots = switcher;
    }

    async createTranscriptTerminalSlide(
        workspaceKey: TranscriptWorkspaceSurfaceKey,
        cwd: string,
        services: TranscriptTerminalViewServices,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        activateNewest = false,
    ): Promise<void> {
        const host = this.executionTerminalHost();
        if (!host?.isConnected) {
            return;
        }
        try {
            const staging = createTranscriptTerminalStagingHost();
            const surface = await createTranscriptTerminalSurface(staging, cwd, services);
            const state = this.host.transcriptTerminalSlidesByWorkspace.get(workspaceKey) ?? { surfaces: [], activeIndex: 0 };
            state.surfaces.push(surface);
            state.activeIndex = activateNewest ? state.surfaces.length - 1 : Math.max(0, state.activeIndex);
            this.host.transcriptTerminalSlidesByWorkspace.set(workspaceKey, state);
            if (this.host.executionSurfaceTabsUi.activeExecutionTab(project) === 'terminal'
                && this.resolveTranscriptWorkspaceKey(project, summary) === workspaceKey) {
                this.renderTranscriptTerminalSlides(workspaceKey);
            }
        } catch (error) {
            if (!host.isConnected) {
                return;
            }
            const slider = this.host.transcriptTerminalSlider;
            if (slider) {
                slider.replaceChildren();
            }
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-terminal-error';
            const message = error instanceof Error ? error.message : String(error);
            note.textContent = services.localize(
                'qaap/mobileProjects/transcriptTerminalFailed',
                'Could not start the terminal: {0}',
                message,
            );
            slider?.append(note);
            console.error('[qaap-mobile-shell] transcript terminal failed', error);
        }
    }

    renderTranscriptTerminalSlides(workspaceKey: TranscriptWorkspaceSurfaceKey): void {
        const slider = this.host.transcriptTerminalSlider;
        const state = this.host.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!slider || !state) {
            return;
        }
        slider.replaceChildren();
        const active = state.surfaces[state.activeIndex];
        if (active) {
            const slide = document.createElement('div');
            slide.className = 'theia-mobile-transcript-terminal-slide theia-mod-active';
            slide.dataset.index = String(state.activeIndex);
            slide.append(active.mountHost);
            slider.append(slide);
            scheduleTranscriptTerminalResize(active.terminal);
            this.syncTranscriptTerminalResizeObserver(slider, active.terminal);
        } else {
            this.syncTranscriptTerminalResizeObserver(undefined, undefined);
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-transcript-terminal-note';
            empty.textContent = nls.localize(
                'qaap/mobileProjects/transcriptTerminalEmpty',
                'No terminals open. Create one with +.',
            );
            slider.append(empty);
        }
        this.renderTranscriptTerminalDots(workspaceKey);
    }

    syncTranscriptTerminalResizeObserver(
        slider: HTMLElement | undefined,
        terminal: TerminalWidget | undefined,
    ): void {
        this.host.transcriptTerminalResizeObserver?.disconnect();
        this.host.transcriptTerminalResizeObserver = undefined;
        if (!slider || !terminal || typeof ResizeObserver === 'undefined') {
            return;
        }
        this.host.transcriptTerminalResizeObserver = new ResizeObserver(() => {
            if (terminal.isAttached && !slider.hidden) {
                scheduleTranscriptTerminalResize(terminal);
            }
        });
        this.host.transcriptTerminalResizeObserver.observe(slider);
    }

    renderTranscriptTerminalDots(workspaceKey: TranscriptWorkspaceSurfaceKey): void {
        const dots = this.host.transcriptTerminalDots;
        const state = this.host.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!dots || !state) {
            return;
        }
        dots.replaceChildren();
        state.surfaces.forEach((surface, index) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'theia-mobile-transcript-terminal-tab';
            tab.classList.toggle('theia-mod-active', index === state.activeIndex);
            const title = this.resolveTranscriptTerminalTabTitle(surface, index);
            tab.title = title;
            tab.setAttribute('aria-label', title);
            tab.addEventListener('click', () => {
                state.activeIndex = index;
                this.renderTranscriptTerminalSlides(workspaceKey);
                this.renderTranscriptTerminalDots(workspaceKey);
            });

            const icon = document.createElement('span');
            icon.className = 'theia-mobile-transcript-terminal-tab-icon codicon codicon-terminal';
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'theia-mobile-transcript-terminal-tab-label';
            label.textContent = title;
            tab.append(icon, label);

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'theia-mobile-transcript-terminal-tab-close codicon codicon-close';
            close.title = nls.localize('qaap/mobileProjects/transcriptTerminalClose', 'Close terminal');
            close.setAttribute('aria-label', close.title);
            close.addEventListener('click', event => {
                event.stopPropagation();
                this.closeTranscriptTerminalTab(workspaceKey, index);
            });
            tab.append(close);

            dots.append(tab);
        });
    }

    resolveTranscriptTerminalTabTitle(surface: TranscriptTerminalSurface, index: number): string {
        const title = surface.terminal.title.label?.trim();
        if (title) {
            return title;
        }
        return nls.localize('qaap/mobileProjects/transcriptTerminalIndex', 'Terminal {0}', String(index + 1));
    }

    closeTranscriptTerminalTab(workspaceKey: TranscriptWorkspaceSurfaceKey, index: number): void {
        const state = this.host.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!state) {
            return;
        }
        const [removed] = state.surfaces.splice(index, 1);
        removed?.dispose.dispose();
        if (state.surfaces.length === 0) {
            state.activeIndex = 0;
        } else if (state.activeIndex >= state.surfaces.length) {
            state.activeIndex = state.surfaces.length - 1;
        }
        this.host.transcriptTerminalSlidesByWorkspace.set(workspaceKey, state);
        this.renderTranscriptTerminalSlides(workspaceKey);
    }

    detachTranscriptFilesFromHost(): void {
        const host = this.executionFilesHost();
        if (host) {
            host.querySelector('.theia-mobile-transcript-files')?.remove();
            host.querySelector('.theia-mobile-transcript-files-note')?.remove();
        }
        this.host.transcriptFilesAttachedKey = undefined;
    }

    detachTranscriptTerminalFromHost(): void {
        this.syncTranscriptTerminalResizeObserver(undefined, undefined);
        const host = this.executionTerminalHost();
        if (host) {
            host.replaceChildren();
            host.classList.remove('theia-mobile-transcript-terminal');
        }
        this.host.transcriptTerminalToolbar = undefined;
        this.host.transcriptTerminalSlider = undefined;
        this.host.transcriptTerminalDots = undefined;
    }

    detachTranscriptWorkspaceSurfacesFromSheet(): void {
        this.detachTranscriptFilesFromHost();
        this.detachTranscriptTerminalFromHost();
    }

    disposeTranscriptTerminalSlides(workspaceKey?: TranscriptWorkspaceSurfaceKey): void {
        if (workspaceKey) {
            const state = this.host.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
            if (state) {
                for (const surface of state.surfaces) {
                    surface.dispose.dispose();
                }
            }
            this.host.transcriptTerminalSlidesByWorkspace.delete(workspaceKey);
            return;
        }
        for (const state of this.host.transcriptTerminalSlidesByWorkspace.values()) {
            for (const surface of state.surfaces) {
                surface.dispose.dispose();
            }
        }
        this.host.transcriptTerminalSlidesByWorkspace.clear();
    }

    createTranscriptPreviewLoading(_conv: QaapAgentConversationDTO | undefined): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-transcript-preview-loading';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');

        const line = document.createElement('div');
        line.className = 'theia-mobile-agent-stream-line theia-mod-thinking';
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-agent-stream-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-stream-label';
        label.textContent = nls.localize('qaap/mobileProjects/previewLoading', 'Cargando...');
        line.append(dot, label);
        wrap.append(line);
        return wrap;
    }

    async syncTranscriptPreviewFromConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void> {
        if (this.host.executionSurfaceTabsUi.activeExecutionTab(project) !== 'preview' && !this.host.transcriptPreviewRequestPending) {
            return;
        }
        const latestProject = await this.refreshTranscriptPreviewProject(project, summary);
        if (this.resolveTranscriptPreviewUrl(latestProject, conv) || conv.status !== 'streaming') {
            this.host.transcriptPreviewRequestPending = false;
        }
        if (this.host.executionSurfaceTabsUi.activeExecutionTab(project) === 'preview' && (this.host.transcriptOpenSummaryId === summary.id || this.host.projectDetailSurfaceTargets)) {
            this.renderPreviewTab(latestProject, summary);
        }
    }

    async refreshTranscriptPreviewProject(project: MobileProjectEntry, summary?: QaapAgentConversationSummaryDTO): Promise<MobileProjectEntry> {
        try {
            const previousPreviewUrl = project.previewUrl
                ?? this.host.projects.find(candidate => candidate.id === project.id)?.previewUrl;
            this.host.projects = await this.host.projectsService.loadProjects();
            const loadedProject = this.host.projects.find(candidate => candidate.id === project.id) ?? project;
            const latestProject = previousPreviewUrl && !loadedProject.previewUrl
                ? { ...loadedProject, previewUrl: previousPreviewUrl }
                : loadedProject;
            if (latestProject.previewUrl) {
                if (await this.previewUrlMatchesProject(latestProject.previewUrl, latestProject)) {
                    return latestProject;
                }
            }
            const previewUrl = await this.host.projectsService.resolveProjectPreviewUrl(latestProject, summary?.cwd);
            if (previewUrl && await this.previewUrlMatchesProject(previewUrl, latestProject)) {
                return { ...latestProject, previewUrl };
            }
            const discoveredPreviewUrl = await this.discoverProjectDevPreviewUrl(latestProject);
            return discoveredPreviewUrl ? { ...latestProject, previewUrl: discoveredPreviewUrl } : latestProject;
        } catch {
            const previewUrl = await this.host.projectsService.resolveProjectPreviewUrl(project, summary?.cwd).catch(() => undefined);
            if (previewUrl && await this.previewUrlMatchesProject(previewUrl, project).catch(() => false)) {
                return { ...project, previewUrl };
            }
            const discoveredPreviewUrl = await this.discoverProjectDevPreviewUrl(project).catch(() => undefined);
            if (discoveredPreviewUrl) {
                return { ...project, previewUrl: discoveredPreviewUrl };
            }
            return project;
        }
    }

    async previewUrlMatchesProject(previewUrl: string, project: MobileProjectEntry): Promise<boolean> {
        const projectName = project.name.trim().toLowerCase();
        if (!projectName) {
            return true;
        }
        try {
            const response = await fetch(normalizePreviewUrlForSameOrigin(previewUrl), { cache: 'no-store' });
            if (!response.ok) {
                return false;
            }
            const html = await response.text();
            const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim().toLowerCase();
            return !title || title.includes(projectName);
        } catch {
            return false;
        }
    }

    async discoverProjectDevPreviewUrl(project: MobileProjectEntry): Promise<string | undefined> {
        const ports = Array.from({ length: 18 }, (_, index) => 5173 + index);
        const probes = await Promise.all(ports.map(async port => {
            const probe = await probeQaapDevPreviewPort(port);
            if (!probe.ready || !await this.previewUrlMatchesProject(probe.previewUrl, project)) {
                return undefined;
            }
            return normalizePreviewUrlForSameOrigin(probe.previewUrl);
        }));
        const previewUrl = probes.find(Boolean);
        if (previewUrl) {
            void this.host.projectsService.recordProjectPreviewUrl(project, previewUrl);
        }
        return previewUrl;
    }

    resolveTranscriptPreviewUrl(
        project: MobileProjectEntry,
        conv: QaapAgentConversationDTO | undefined,
    ): string | undefined {
        if (conv) {
            for (const message of [...conv.messages].reverse()) {
                const fromContent = this.extractDevPreviewUrlFromText(message.content);
                if (fromContent) {
                    return normalizePreviewUrlForSameOrigin(fromContent);
                }
                for (const segment of [...(message.segments ?? [])].reverse()) {
                    const text = segment.type === 'tool'
                        ? `${segment.args}\n${segment.result ?? ''}`
                        : segment.content;
                    const fromSegment = this.extractDevPreviewUrlFromText(text);
                    if (fromSegment) {
                        return normalizePreviewUrlForSameOrigin(fromSegment);
                    }
                }
            }
        }
        return project.previewUrl ? normalizePreviewUrlForSameOrigin(project.previewUrl) : undefined;
    }

    extractDevPreviewUrlFromText(text: string | undefined): string | undefined {
        if (!text?.trim()) {
            return undefined;
        }
        const directUrl = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):(\d{2,5})(?:\/[^\s`*)\]]*)?/i);
        const port = directUrl?.[1] ?? text.match(/\bport(?:o|)\s+(\d{2,5})\b/i)?.[1] ?? text.match(/\bpuerto\s+(\d{2,5})\b/i)?.[1];
        if (!port) {
            return undefined;
        }
        const parsed = Number(port);
        if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
            return undefined;
        }
        return toDevPreviewUrl(parsed);
    }

    async requestTranscriptPreview(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.host.transcriptPreviewRequestRunning) {
            return;
        }
        const latestProject = this.host.projects.find(candidate => candidate.id === project.id) ?? project;
        if (latestProject.previewUrl && this.host.onResumePreview) {
            await this.host.onResumePreview(latestProject);
            return;
        }

        const bootstrap = this.host.projectBootstrap;
        if (bootstrap) {
            void ensureTranscriptDevPreview(bootstrap).then(readyUrl => {
                if (!readyUrl || this.host.transcriptOpenSummaryId !== summary.id) {
                    return;
                }
                if (this.host.executionSurfaceTabsUi.activeExecutionTab(project) !== 'preview') {
                    return;
                }
                const refreshed = this.host.projects.find(candidate => candidate.id === project.id) ?? project;
                this.host.projects = this.host.projects.map(candidate => candidate.id === refreshed.id
                    ? { ...candidate, previewUrl: readyUrl }
                    : candidate);
                void this.host.projectsService.recordProjectPreviewUrl({ ...refreshed, previewUrl: readyUrl }, readyUrl);
                this.renderPreviewTab({ ...refreshed, previewUrl: readyUrl }, summary);
            });
        }

        const message = nls.localize(
            'qaap/mobileProjects/previewAgentRequest',
            'Prepare this app for live in-IDE preview. Qaap starts and keeps the dev server running in a dedicated terminal with hot reload — do NOT run long-lived dev commands in shell (pnpm dev, npm start, vite, next dev, etc.); shell tools time out after ~30s and break preview. Install dependencies only if node_modules is missing. Fix build/typecheck issues with one-shot commands. When ready, reply with the expected local port (e.g. 5173) and confirm dependencies are installed.',
        );
        this.host.transcriptPreviewRequestRunning = true;
        this.host.transcriptPreviewRequestPending = true;
        this.updateTranscriptPreviewRunButtonState();
        if (summary.cwd) {
            this.host.setAutoVerifyEnabled(summary.cwd, true);
            this.host.refreshTranscriptChecksViews(project, summary);
        }
        this.renderPreviewTab(project, summary);
        try {
            await this.host.submitTranscriptViaBackendConversation(project, summary, message, {
                selectedAgentId: this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary),
                modeId: this.host.transcriptComposerModeId,
                approvalPolicyId: reconcileAgentApprovalPolicyId(
                    this.host.transcriptComposerApprovalPolicyId,
                    summary.cwd,
                ),
            });
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/previewRequestSent', 'Preview request sent to agent'),
                { kind: 'success', duration: 1600 },
            );
            this.host.transcriptScheduleRefresh?.();
        } catch (error) {
            this.host.transcriptPreviewRequestPending = false;
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        } finally {
            this.host.transcriptPreviewRequestRunning = false;
            if (this.host.transcriptOpenSummaryId === summary.id) {
                this.renderPreviewTab(project, summary);
            }
        }
    }
}
