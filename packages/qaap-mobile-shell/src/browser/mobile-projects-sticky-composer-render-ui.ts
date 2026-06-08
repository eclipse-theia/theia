// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatMode, ChatModel, ChatService } from '@theia/ai-chat';
import {
    THEIA_CODER_AGENT_ID,
    resolveExplicitAgentForSubmit,
} from '../common/qaap-agent-task-client';
import {
    describeComposerInteractionMode,
    reconcileComposerModeId,
    resolveComposerModeLabel,
    resolveStickyComposerModes,
} from '../common/qaap-sticky-composer-mode';
import {
    agentSupportsApprovalPolicy,
    reconcileAgentApprovalPolicyId,
    resolveComposerAutoApprove,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import {
    composerContextRequests,
    disposeComposerContextEntries,
    revokeComposerContextPreview,
} from '../common/qaap-composer-context-entry';
import {
    bindContextUsageIndicator,
    isContextUsageIndicatorEnabled,
    resolveContextUsageIndicatorState,
    resolveContextUsageWarningThreshold,
    resolveContextUsageWarningThresholdPercentage,
    resolveVpsContextUsageIndicatorState,
} from './qaap-chat-context-usage-indicator';
import type { QaapAgentConversationSummaryDTO, QaapAgentConversationDTO } from '../common/qaap-agent-conversation-client';
import type { QaapAgentApprovalPolicyId } from '../common/qaap-sticky-composer-approval-policy';
import type { QaapAgentToolApprovalRules } from '../common/qaap-agent-tool-approval-rules';
import type { StickyComposerContextEntry } from '../common/qaap-composer-context-entry';
import type { QaapComposerSurface } from '../common/qaap-composer-surface';
import type { MobileProjectEntry, MobileProjectFilter } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileSnackbar } from './mobile-snackbar';
import type { StickyComposerColumnOptions } from './mobile-projects-sticky-composer-column-ui';

export interface MobileProjectsStickyComposerRenderHost {
root: HTMLElement;
stickyComposerHost: HTMLElement;
stickyComposerContextUsageDispose: Disposable;
projects: MobileProjectEntry[];
filter: MobileProjectFilter;
homeMode: boolean;
hubView: import('./mobile-projects-types').MobileProjectsHubView;
agentsHubShellActive: boolean;
agentsHubInlineChatHost: HTMLElement | undefined;
transcriptChatHost: HTMLElement | undefined;
transcriptComposerMountKey: string | undefined;
transcriptComposerHost: HTMLElement | undefined;
stickyComposerContext: StickyComposerContextEntry[];
stickyComposerFilesExpanded: boolean;
stickyComposerDraft: string;
stickyComposerSurface: QaapComposerSurface;
stickyComposerModeId: string | undefined;
stickyComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
stickyComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
            stickyComposerBackendAgents: import('../common/qaap-agent-task-client').QaapAgentTaskAgentOption[];
            transcriptComposerBackendAgents: import('../common/qaap-agent-task-client').QaapAgentTaskAgentOption[];
stickyComposerPinnedAgentId: string | undefined;
preparedCwdByProjectId: Map<string, string>;
chatService?: ChatService;
chatServiceSessionSummariesByProjectId: Map<string, QaapAgentConversationSummaryDTO[]>;
chatAgentService?: ChatAgentService;
conversations?: MobileProjectsConversations;
            readPreference?: (key: string) => unknown;
getComposerVariables?: unknown;
applySearch(projects: MobileProjectEntry[]): MobileProjectEntry[];
applyFilter(projects: MobileProjectEntry[], filter: MobileProjectFilter): MobileProjectEntry[];
resolveStickyComposerProject(projects: MobileProjectEntry[]): MobileProjectEntry | undefined;
resolveAgentsHubShellProject(): MobileProjectEntry | undefined;
resolveAgentsHubShellSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO | undefined;
executionSurfaceTabForProject(project: MobileProjectEntry): import('../common/qaap-execution-surface-tabs').ExecutionSurfaceTabId;
refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void>;
mountTranscriptStickyComposer(host: HTMLElement, project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, chatHost: HTMLElement): void;
syncHeaderComposerSurfacePicker(): void;
updateNewFabVisibility(): void;
updateStickyComposerFabLift(): void;
closeStickyComposerSheets(): void;
refreshStickyComposerAgents(project: MobileProjectEntry): Promise<void>;
resolveStickyComposerPinnedAgentId(project: MobileProjectEntry): string;
resolveStickyComposerAgentLabel(project?: MobileProjectEntry): string;
openStickyComposerModeSheet(project: MobileProjectEntry, modes: readonly ChatMode[]): void;
openStickyComposerApprovalPolicySheet(project: MobileProjectEntry, agentLabel: string): void;
openStickyComposerAgentSheet(project: MobileProjectEntry): void;
onStickyComposerAttach(project: MobileProjectEntry, anchor: HTMLElement): Promise<void>;
hasPendingComposerAttachments(): boolean;
notifyPendingComposerAttachments(): void;
formatComposerContextEntry(entry: StickyComposerContextEntry): import('./qaap-sticky-composer-context-ui').StickyComposerContextChipView;
resolveComposerMentionOptions(agents: readonly import('../common/qaap-agent-task-client').QaapAgentTaskAgentOption[], coderOnly?: boolean): readonly import('../common/qaap-sticky-composer-mention').StickyComposerTokenOption[];
resolveComposerVariableOptions(): readonly import('../common/qaap-sticky-composer-mention').StickyComposerTokenOption[];
mountStickyComposerContextUsage(badge: HTMLElement, resolveTarget: () => unknown): Disposable;
shouldShowComposerWorkspaceBar(summary?: QaapAgentConversationSummaryDTO): boolean;
submitBackgroundAgentTask(project: MobileProjectEntry, draft: string, options: Record<string, unknown>): Promise<void>;
buildStickyComposerColumn(options: StickyComposerColumnOptions): HTMLElement;
isProjectDetailView(): boolean;
projectsService: MobileProjectsService;
transcriptComposerSendRefresh: (() => void) | undefined;
}

export class MobileProjectsStickyComposerRenderUi {
    constructor(protected readonly host: MobileProjectsStickyComposerRenderHost) { }

    resolveProjectTheiaChatModel(project: MobileProjectEntry): ChatModel | undefined {
        if (!this.host.chatService) {
            return undefined;
        }
        const summaries = this.host.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
        for (let i = summaries.length - 1; i >= 0; i--) {
            const sessionId = summaries[i].sessionId;
            if (!sessionId) {
                continue;
            }
            const model = this.host.chatService.getSession(sessionId)?.model;
            if (model) {
                return model;
            }
        }
        return undefined;
    }

    renderStickyComposer(): void {
        this.host.stickyComposerContextUsageDispose.dispose();
        const filtered = this.host.applySearch(this.host.applyFilter(this.host.projects, this.host.filter));
        const project = this.host.resolveStickyComposerProject(filtered);
        if (this.host.agentsHubShellActive) {
            const shellProject = this.host.resolveAgentsHubShellProject();
            const shellSummary = shellProject ? this.host.resolveAgentsHubShellSummary(shellProject) : undefined;
            const chatHost = this.host.agentsHubInlineChatHost ?? this.host.transcriptChatHost;
            const showMessagesComposer = shellProject
                ? this.host.executionSurfaceTabForProject(shellProject) === 'messages'
                : false;
            const showComposer = !!(shellProject && shellSummary && chatHost?.isConnected && showMessagesComposer);
            this.host.stickyComposerHost.hidden = !showComposer;
            this.host.root.classList.toggle('theia-mod-sticky-composer', showComposer);
            if (showComposer) {
                const mountKey = `${shellProject!.id}|${shellSummary!.id}`;
                const composerStable = this.host.transcriptComposerMountKey === mountKey
                    && this.host.transcriptComposerHost === this.host.stickyComposerHost
                    && this.host.stickyComposerHost.childElementCount > 0;
                if (!composerStable) {
                    this.host.stickyComposerHost.replaceChildren();
                    if (this.host.transcriptComposerBackendAgents.length === 0) {
                        void this.host.refreshTranscriptComposerAgents(shellProject!);
                    }
                    this.host.mountTranscriptStickyComposer(this.host.stickyComposerHost, shellProject!, shellSummary!, chatHost!);
                } else {
                    this.host.transcriptComposerSendRefresh?.();
                }
            } else {
                this.host.transcriptComposerMountKey = undefined;
                this.host.stickyComposerHost.replaceChildren();
            }
            this.host.syncHeaderComposerSurfacePicker();
            this.host.updateNewFabVisibility();
            window.requestAnimationFrame(() => this.host.updateStickyComposerFabLift());
            return;
        }
        this.host.transcriptComposerMountKey = undefined;
        this.host.stickyComposerHost.replaceChildren();
        const showReposComposer = this.host.homeMode && !!this.host.conversations && !!project && this.host.hubView === 'repos';
        const showSurface = showReposComposer;
        const showComposer = showSurface
            && (!this.host.isProjectDetailView() || (project && this.host.executionSurfaceTabForProject(project) === 'messages'));
        this.host.stickyComposerHost.hidden = !showComposer;
        this.host.root.classList.toggle('theia-mod-sticky-composer', showComposer);
        if (!showSurface || !project) {
            this.host.closeStickyComposerSheets();
            return;
        }

        void this.host.refreshStickyComposerAgents(project);

        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        this.host.stickyComposerSurface = 'task';
        const isChatSurface = false;
        const canRunTask = !!project && (!!cwd || !!project.github);
        const canRunChat = !!this.host.chatService && !!project;
        const canSubmit = isChatSurface ? canRunChat : canRunTask;
        const pinnedId = this.host.resolveStickyComposerPinnedAgentId(project);
        const modes = resolveStickyComposerModes(pinnedId, this.host.chatAgentService);
        this.host.stickyComposerModeId = reconcileComposerModeId(
            this.host.stickyComposerModeId,
            modes,
            cwd,
        );
        const showApprovalPolicy = agentSupportsApprovalPolicy(pinnedId);
        if (showApprovalPolicy) {
            this.host.stickyComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
                this.host.stickyComposerApprovalPolicyId,
                cwd,
            );
            this.host.stickyComposerToolApprovalRules = reconcileAgentToolApprovalRules(
                this.host.stickyComposerApprovalPolicyId,
                cwd,
                this.host.stickyComposerToolApprovalRules,
            );
        } else {
            this.host.stickyComposerApprovalPolicyId = undefined;
            this.host.stickyComposerToolApprovalRules = undefined;
        }

        const column = this.host.buildStickyComposerColumn({
            project,
            surface: this.host.stickyComposerSurface,
            agentLocked: isChatSurface,
            getContext: () => this.host.stickyComposerContext,
            clearContext: () => {
                disposeComposerContextEntries(this.host.stickyComposerContext);
                this.host.stickyComposerContext = [];
                this.renderStickyComposer();
            },
            removeContextItem: index => {
                revokeComposerContextPreview(this.host.stickyComposerContext[index]);
                this.host.stickyComposerContext.splice(index, 1);
                this.renderStickyComposer();
            },
            formatContextChip: item => this.host.formatComposerContextEntry(item),
            filesExpanded: this.host.stickyComposerFilesExpanded,
            onFilesExpandedChange: expanded => { this.host.stickyComposerFilesExpanded = expanded; },
            getDraft: () => this.host.stickyComposerDraft,
            setDraft: value => { this.host.stickyComposerDraft = value; },
            resolveAgentLabel: () => this.host.resolveStickyComposerAgentLabel(project),
            resolveAgentId: () => this.host.resolveStickyComposerPinnedAgentId(project),
            modes,
            resolveModeLabel: () => resolveComposerModeLabel(modes, this.host.stickyComposerModeId),
            onOpenModeSheet: modes.length > 1
                ? () => { this.host.openStickyComposerModeSheet(project, modes); }
                : undefined,
            approvalPolicyId: showApprovalPolicy ? this.host.stickyComposerApprovalPolicyId : undefined,
            onOpenApprovalPolicySheet: showApprovalPolicy
                ? () => {
                    this.host.openStickyComposerApprovalPolicySheet(
                        project,
                        this.host.resolveStickyComposerAgentLabel(project),
                    );
                }
                : undefined,
            canSubmit,
            onAttach: anchor => { void this.host.onStickyComposerAttach(project, anchor); },
            onOpenAgentSheet: isChatSurface ? () => { /* Chat is Coder-only */ } : () => { this.host.openStickyComposerAgentSheet(project); },
            onSubmit: draft => {
                if (this.host.hasPendingComposerAttachments()) {
                    this.host.notifyPendingComposerAttachments();
                    return;
                }
                const resolvedPinnedId = isChatSurface
                    ? THEIA_CODER_AGENT_ID
                    : this.host.resolveStickyComposerPinnedAgentId(project);
                const selectedAgentId = isChatSurface
                    ? THEIA_CODER_AGENT_ID
                    : resolveExplicitAgentForSubmit(draft, {
                        pinnedChatAgentId: resolvedPinnedId,
                    }) ?? resolvedPinnedId;
                const variables = composerContextRequests(this.host.stickyComposerContext);
                const modeId = this.host.stickyComposerModeId;
                const autoApprove = resolveComposerAutoApprove(
                    showApprovalPolicy,
                    this.host.stickyComposerApprovalPolicyId,
                    cwd,
                );
                disposeComposerContextEntries(this.host.stickyComposerContext);
                this.host.stickyComposerContext = [];
                const submitOptions = {
                    openConversation: isChatSurface,
                    selectedAgentId,
                    modeId,
                    variables: variables.length > 0 ? variables : undefined,
                    autoApprove,
                };
                const done = this.host.submitBackgroundAgentTask(project, draft, {
                    ...submitOptions,
                    openConversation: false,
                    forceVps: true,
                    approvalPolicyId: showApprovalPolicy
                        ? reconcileAgentApprovalPolicyId(this.host.stickyComposerApprovalPolicyId, cwd)
                        : undefined,
                });
                void done.finally(() => this.renderStickyComposer());
            },
            onSubmitBlocked: () => {
                if (this.host.hasPendingComposerAttachments()) {
                    this.host.notifyPendingComposerAttachments();
                    return;
                }
                if (isChatSurface && !this.host.chatService) {
                    MobileSnackbar.show(
                        nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'),
                        { duration: 2400 },
                    );
                    return;
                }
                MobileSnackbar.show(
                    isChatSurface
                        ? nls.localize('qaap/mobileProjects/stickyComposerNoChat', 'Open this project in the workspace to start a local chat.')
                        : nls.localize('qaap/mobileProjects/stickyComposerNoProject', 'Add or open a repository first.'),
                    { duration: 2400 },
                );
            },
            afterInputChange: () => { /* sticky draft persisted in setDraft */ },
            getMentionOptions: () => this.host.resolveComposerMentionOptions(this.host.stickyComposerBackendAgents, isChatSurface),
            getVariableOptions: this.host.getComposerVariables
                ? () => this.host.resolveComposerVariableOptions()
                : undefined,
            inputPlaceholder: isChatSurface
                ? nls.localize('qaap/mobileProjects/stickyComposerNewChat', 'Message the workspace agent…')
                : nls.localize('qaap/mobileProjects/stickyComposerNewTask', 'Delegate a task…'),
            sendLabel: isChatSurface
                ? nls.localize('qaap/mobileProjects/chatSend', 'Send')
                : nls.localize('qaap/mobileProjects/taskCreate', 'Create'),
            onContextUsageBadgeMounted: badge => {
                this.host.stickyComposerContextUsageDispose = this.mountStickyComposerContextUsage(
                    badge,
                    () => isChatSurface
                        ? (() => {
                            const chatModel = this.resolveProjectTheiaChatModel(project);
                            return chatModel ? { chatModel } : undefined;
                        })()
                        : undefined,
                );
            },
            showWorkspaceBar: this.host.shouldShowComposerWorkspaceBar(),
        });
        const modeHint = describeComposerInteractionMode(this.host.stickyComposerModeId);
        if (modeHint) {
            const modeBanner = document.createElement('div');
            modeBanner.className = 'theia-mobile-sticky-composer-mode-banner';
            modeBanner.textContent = modeHint;
            this.host.stickyComposerHost.append(modeBanner);
        }
        this.host.stickyComposerHost.append(column);
        this.host.syncHeaderComposerSurfacePicker();
        this.host.updateNewFabVisibility();
        window.requestAnimationFrame(() => this.host.updateStickyComposerFabLift());
    }
    mountStickyComposerContextUsage(
        badge: HTMLElement,
        resolveTarget: () => {
            readonly summary?: QaapAgentConversationSummaryDTO;
            readonly chatModel?: ChatModel;
            readonly full?: QaapAgentConversationDTO;
        } | undefined,
    ): Disposable {
        const enabled = isContextUsageIndicatorEnabled(this.host.readPreference);
        const thresholdPercent = resolveContextUsageWarningThresholdPercentage(this.host.readPreference);
        const theiaThreshold = resolveContextUsageWarningThreshold(this.host.readPreference);
        return bindContextUsageIndicator(
            badge,
            () => {
                const target = resolveTarget();
                if (target?.chatModel) {
                    return resolveContextUsageIndicatorState(target.chatModel, {
                        enabled,
                        threshold: theiaThreshold,
                        showWhenEmpty: true,
                    });
                }
                return resolveVpsContextUsageIndicatorState(target?.summary, {
                    enabled,
                    threshold: theiaThreshold,
                    showWhenEmpty: true,
                    thresholdPercentBasis: thresholdPercent,
                }, target?.full);
            },
            onRefresh => {
                const disposables = new DisposableCollection();
                if (this.host.conversations) {
                    disposables.push(this.host.conversations.onDidChange(onRefresh));
                }
                const model = resolveTarget()?.chatModel;
                if (model) {
                    disposables.push(model.onDidChange(onRefresh));
                }
                return disposables;
            },
        );
    }
}

