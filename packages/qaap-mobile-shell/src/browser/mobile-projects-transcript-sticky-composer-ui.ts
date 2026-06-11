// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import type { CommandRegistry } from '@theia/core/lib/common/command';
import type { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatMode, ChatModel } from '@theia/ai-chat';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    conversationToSummary,
    getConversation,
    updateConversation,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    agentSupportsModelPicker,
    QAAP_PRIMARY_AGENT_ID,
    readStoredAgentModel,
    resolveExplicitAgentForSubmit,
    writeStoredAgent,
    writeStoredAgentModel,
    type QaapAgentTaskAgentOption,
} from '../common/qaap-agent-task-client';
import { warmAgentTurnPath } from '../common/qaap-agent-turn-warm';
import { createComposerContextEntry } from '../common/qaap-composer-context-entry';
import { isTranscriptDocumentVisible } from '../common/qaap-transcript-document-visibility';
import { resolveTranscriptEffectiveStatus } from '../common/qaap-transcript-turn-status';
import type { MobileComposerAttachHandlers } from './qaap-mobile-composer-device-attach';
import {
    resolveChatModelContextUsageBreakdown,
    resolveVpsContextUsageBreakdown,
} from './qaap-chat-context-usage-panel';
import {
    buildUpdateConversationComposerPatch,
    clearConversationComposerDraft,
    extractConversationComposerPrefs,
    readConversationComposerDraft,
    writeConversationComposerDraft,
} from '../common/qaap-conversation-composer-prefs';
import {
    describeComposerInteractionMode,
    reconcileComposerModeId,
    resolveComposerModeLabel,
    resolveStickyComposerModes,
    writeStoredComposerMode,
} from '../common/qaap-sticky-composer-mode';
import {
    agentSupportsApprovalPolicy,
    reconcileAgentApprovalPolicyId,
    resolveComposerAutoApprove,
    writeStoredAgentApprovalPolicy,
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    writeStoredAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import {
    MAX_TRANSCRIPT_FOLLOW_UP_QUEUE,
    TranscriptFollowUpQueue,
    type TranscriptFollowUpEntry,
} from '../common/qaap-transcript-follow-up-queue';
import { isAgentsHubIdleConversationSummary } from '../common/qaap-agents-hub-landing';
import type { StickyComposerContextChipView } from './qaap-sticky-composer-context-ui';
import {
    composerContextRequests,
    disposeComposerContextEntries,
    hasPendingComposerContextEntries,
    revokeComposerContextPreview,
    type StickyComposerContextEntry,
} from '../common/qaap-composer-context-entry';
import type { StickyComposerTokenOption } from '../common/qaap-sticky-composer-mention';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsTranscriptComposerUi } from './mobile-projects-transcript-composer-ui';
import type { WorkHubTranscriptBridge } from './work-hub-transcript-bridge';
import { MobileSnackbar } from './mobile-snackbar';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitChangedFile,
    type QaapGitCommitWorkflowAction,
} from '../common/qaap-git-review';
import {
    renderStickyComposerActivityStack,
    renderStickyComposerChangesPill,
    type StickyComposerActivityStackOptions,
    type StickyComposerChangedFileView,
} from './qaap-sticky-composer-activity-stack';

export interface TranscriptStickyComposerColumnOptions {
    project: MobileProjectEntry;
    surface?: string;
    agentLocked?: boolean;
    getContext: () => StickyComposerContextEntry[];
    clearContext: () => void;
    removeContextItem: (index: number) => void;
    formatContextChip: (item: StickyComposerContextEntry) => StickyComposerContextChipView;
    filesExpanded?: boolean;
    onFilesExpandedChange?: (expanded: boolean) => void;
    getDraft: () => string;
    setDraft: (value: string) => void;
    resolveAgentLabel: () => string;
    resolveAgentId: () => string;
    modes?: readonly ChatMode[];
    resolveModeLabel?: () => string;
    onOpenModeSheet?: (anchor: HTMLButtonElement) => void;
    approvalPolicyId?: QaapAgentApprovalPolicyId;
    onOpenApprovalPolicySheet?: (anchor: HTMLButtonElement) => void;
    canSubmit: boolean;
    isAgentWorking?: () => boolean;
    onStop?: () => void;
    onAttach: (anchor: HTMLElement) => void;
    onOpenAgentSheet: (anchor: HTMLButtonElement) => void;
    onSubmit: (draft: string) => void;
    sendLabel?: string;
    onSendControlMounted?: (refresh: () => void) => void;
    inputPlaceholder?: string;
    getMentionOptions?: () => readonly StickyComposerTokenOption[];
    getVariableOptions?: () => readonly StickyComposerTokenOption[];
    onContextUsageBadgeMounted?: (badge: HTMLElement) => void;
    showWorkspaceBar?: boolean;
    transcriptOverlay?: boolean;
}

/** Panel surface for transcript sticky composer mount, prefs persistence, and follow-up queue. */
export interface MobileProjectsTranscriptStickyComposerHost {
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerMountKey: string | undefined;
    transcriptComposerProject: MobileProjectEntry | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerContext: StickyComposerContextEntry[];
    transcriptComposerFilesExpanded: boolean;
    transcriptComposerQueueExpanded: boolean;
    transcriptComposerChangedFilesExpandedById: Map<string, boolean>;
    transcriptComposerDraft: string;
    transcriptComposerSendRefresh: (() => void) | undefined;
    stickyComposerContextUsageDispose: Disposable;
    transcriptComposerModeId: string | undefined;
    transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    transcriptComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    transcriptComposerPinnedAgentId: string | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerDraftPersistTimer: number | undefined;
    transcriptComposerPrefsPersistTimer: number | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptComposerBackendAgents: QaapAgentTaskAgentOption[];
    agentsHubShellActive: boolean;
    transcriptFollowUpFlushInFlight: boolean;
    transcriptFollowUpQueue: TranscriptFollowUpQueue;
    transcriptTheiaSessionByConversationId: ReadonlyMap<string, string>;
    projectsService: MobileProjectsService;
    chatAgentService?: ChatAgentService;
    chatService?: import('@theia/ai-chat').ChatService;
    messageService?: MessageService;
    /** Quick input for the commit split-button branch-name prompt (and message fallback). */
    quickInputService?: QuickInputService;
    /** Generates commit messages automatically from the diff (Cursor-agents style). */
    commitMessageAi?: import('./qaap-commit-message-ai').QaapCommitMessageAi;
    /** Command registry for opening the Create-PR flow after a commit. */
    commands?: CommandRegistry;
    conversations?: MobileProjectsConversations;
    getComposerVariables?: unknown;
    pickContextVariable?: (
        anchor: HTMLElement,
        handlers: MobileComposerAttachHandlers,
    ) => Promise<import('@theia/ai-core').AIVariableResolutionRequest[]>;
    transcriptComposerUi: MobileProjectsTranscriptComposerUi;

    onCancelConversation(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    submitBackgroundAgentTask(
        project: MobileProjectEntry,
        draft: string,
        options: Record<string, unknown>,
    ): Promise<void>;
    submitTranscriptViaBackendConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        draft: string,
        options: Record<string, unknown>,
    ): Promise<void>;
    resolveActiveTranscriptChatHost(): HTMLElement | undefined;
    stickyComposerColumnUi: import('./mobile-projects-sticky-composer-column-ui').MobileProjectsStickyComposerColumnUi;
    stickyComposerContextUi: import('./mobile-projects-sticky-composer-context-ui').MobileProjectsStickyComposerContextUi;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    stickyComposerSheetsUi: import('./mobile-projects-sticky-composer-sheets-ui').MobileProjectsStickyComposerSheetsUi;
    composerHeaderUi: import('./mobile-projects-composer-header-ui').MobileProjectsComposerHeaderUi;
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi;
    chatServiceSummariesUi: import('./mobile-projects-chat-service-summaries-ui').MobileProjectsChatServiceSummariesUi;
    transcriptMessagesUi: import('./mobile-projects-transcript-messages-ui').MobileProjectsTranscriptMessagesUi;
    executionSurfaceTabsUi: import('./mobile-projects-execution-surface-tabs-ui').MobileProjectsExecutionSurfaceTabsUi;
    transcriptLiveUi: import('./mobile-projects-transcript-live-ui').MobileProjectsTranscriptLiveUi;
}

/** Transcript overlay sticky composer: mount, prefs, follow-up queue, and submit wiring. */
export class MobileProjectsTranscriptStickyComposerUi {

    protected lastComposerActivityFingerprint = '';
    protected readonly composerActivityGitFilesByConversationId = new Map<string, StickyComposerChangedFileView[]>();
    protected composerChangedFilesBulkBusy = false;
    protected composerCommitBusy = false;

    constructor(
        protected readonly host: MobileProjectsTranscriptStickyComposerHost,
        protected readonly workHub: WorkHubTranscriptBridge,
    ) { }

    protected isComposerBackgroundWorkAllowed(): boolean {
        return isTranscriptDocumentVisible();
    }

    protected peekTranscriptComposerChangedFilesExpanded(summaryId: string): boolean {
        return this.host.transcriptComposerChangedFilesExpandedById.get(summaryId) ?? true;
    }

    protected setTranscriptComposerChangedFilesExpanded(summaryId: string, expanded: boolean): void {
        this.host.transcriptComposerChangedFilesExpandedById.set(summaryId, expanded);
    }

    /** Prefer the live inline/overlay host — mount-time chatHost can go stale after renderList(). */
    protected resolveComposerTranscriptChatHost(fallback?: HTMLElement): HTMLElement | undefined {
        return this.host.resolveActiveTranscriptChatHost() ?? fallback;
    }

    async onTranscriptComposerAttach(
        _project: MobileProjectEntry,
        anchor: HTMLElement,
    ): Promise<void> {
        if (!this.host.pickContextVariable) {
            return;
        }
        const variables = await this.host.pickContextVariable(anchor, this.host.stickyComposerContextUi.createTranscriptComposerAttachHandlers());
        if (variables.length === 0) {
            return;
        }
        for (const request of variables) {
            this.host.transcriptComposerContext.push(createComposerContextEntry(request));
        }
        this.remountTranscriptStickyComposer();
    }

    resolveTranscriptContextUsageTarget(
        summary: QaapAgentConversationSummaryDTO,
    ): {
        readonly summary?: QaapAgentConversationSummaryDTO;
        readonly chatModel?: ChatModel;
        readonly full?: QaapAgentConversationDTO;
    } {
        if (summary.source === 'theia-chat') {
            const chatModel = this.resolveTranscriptTheiaChatModel(summary);
            return chatModel ? { chatModel } : {};
        }
        const cwd = summary.cwd;
        const live = this.host.conversations?.getConversationsForCwd(cwd).find(c => c.id === summary.id) ?? summary;
        if (this.host.transcriptLastConv?.id === summary.id) {
            const effectiveStatus = resolveTranscriptEffectiveStatus(this.host.transcriptLastConv);
            return {
                summary: { ...live, status: effectiveStatus },
                full: this.host.transcriptLastConv,
            };
        }
        return { summary: live };
    }

    resolveTranscriptTheiaChatModel(summary: QaapAgentConversationSummaryDTO): ChatModel | undefined {
        if (summary.source !== 'theia-chat' || !summary.sessionId || !this.host.chatService) {
            return undefined;
        }
        return this.host.chatService.getSession(summary.sessionId)?.model;
    }

    enqueueTranscriptFollowUp(
        conversationId: string,
        entry: TranscriptFollowUpEntry,
    ): boolean {
        const ok = this.host.transcriptFollowUpQueue.enqueue(conversationId, entry);
        if (!ok) {
            MobileSnackbar.show(
                nls.localize(
                    'qaap/mobileProjects/transcriptFollowUpQueueFull',
                    'Queue is full ({0} messages). Wait for the agent to finish.',
                    String(MAX_TRANSCRIPT_FOLLOW_UP_QUEUE),
                ),
                { kind: 'warning', duration: 2800 },
            );
            return false;
        }
        const count = this.host.transcriptFollowUpQueue.size(conversationId);
        MobileSnackbar.show(
            nls.localize(
                'qaap/mobileProjects/transcriptFollowUpQueued',
                '{0} message(s) queued — will send when the agent finishes',
                String(count),
            ),
            { kind: 'success', duration: 1600 },
        );
        return true;
    }

    appendTranscriptFollowUpQueueBanner(_shell: HTMLElement, _conversationId: string): void {
        /* Replaced by composer activity stack inside the codex card. */
    }

    protected resolveComposerActivityFilesForStack(
        _project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        conv: QaapAgentConversationDTO | undefined,
    ): {
        readonly files: StickyComposerChangedFileView[];
        readonly stats?: { readonly added: number; readonly removed: number };
    } {
        const activityFiles = this.host.transcriptMessagesUi.resolveComposerActivityFiles(conv, summary);
        // The Changes pill + commit button only surface for edits the agent made in this
        // conversation. The gate needs evidence from the transcript itself (file-edit tool calls
        // or agent-reported diff stats): `summary.linesAdded` alone is not enough because the
        // backend stamps repo-wide `git diff` stats on every turn, so a tree left dirty by another
        // session would surface the buttons in conversations that never touched a file.
        const transcriptEvidence = this.host.transcriptMessagesUi.resolveComposerActivityFiles(conv, undefined, { allTurns: true });
        if (!this.hasComposerAgentActivity(transcriptEvidence)
            && !this.host.transcriptMessagesUi.hasComposerFileChangeToolCalls(conv)) {
            return { files: [] };
        }
        const gitFiles = this.composerActivityGitFilesByConversationId.get(summary.id);
        if (gitFiles) {
            if (gitFiles.length === 0) {
                // Working tree is clean (e.g. changes were just committed) — nothing left to review.
                return { files: [] };
            }
            return {
                files: gitFiles,
                stats: this.resolveChangedFilesStats(gitFiles, activityFiles.stats),
            };
        }
        return activityFiles;
    }

    protected hasComposerAgentActivity(activityFiles: {
        readonly files: readonly StickyComposerChangedFileView[];
        readonly stats?: { readonly added: number; readonly removed: number };
    }): boolean {
        return activityFiles.files.length > 0
            || (activityFiles.stats?.added ?? 0) > 0
            || (activityFiles.stats?.removed ?? 0) > 0;
    }

    protected resolveChangedFilesStats(
        files: readonly StickyComposerChangedFileView[],
        fallback?: { readonly added: number; readonly removed: number },
    ): { readonly added: number; readonly removed: number } | undefined {
        if (files.length === 0) {
            return fallback;
        }
        let added = 0;
        let removed = 0;
        for (const file of files) {
            added += file.added ?? 0;
            removed += file.removed ?? 0;
        }
        if (added > 0 || removed > 0) {
            return { added, removed };
        }
        return fallback;
    }

    protected resolveComposerWorkspaceRoot(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string | undefined {
        return this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
    }

    protected async fetchWorkspaceChangedFiles(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<StickyComposerChangedFileView[]> {
        const cwd = this.resolveComposerWorkspaceRoot(project, summary);
        if (!cwd) {
            return [];
        }
        const response = await fetch(
            `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(cwd)}`,
            { credentials: 'include' },
        );
        if (!response.ok) {
            throw new Error(`git changes request failed (${response.status})`);
        }
        const body = await response.json() as { files?: QaapGitChangedFile[] };
        return (body.files ?? []).map(file => this.mapGitChangedFileToComposerView(file));
    }

    protected async runComposerGitFileAction(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        endpoint: 'stage' | 'discard',
        files: readonly StickyComposerChangedFileView[],
    ): Promise<void> {
        const cwd = this.resolveComposerWorkspaceRoot(project, summary);
        if (!cwd || files.length === 0) {
            return;
        }
        for (const file of files) {
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ root: cwd, file: file.path }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? `${endpoint} failed (${response.status})`);
            }
        }
    }

    protected async syncComposerGitSnapshot(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<StickyComposerChangedFileView[]> {
        const files = await this.fetchWorkspaceChangedFiles(project, summary);
        this.composerActivityGitFilesByConversationId.set(summary.id, files);
        return files;
    }

    protected async undoAllComposerChangedFiles(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.composerChangedFilesBulkBusy) {
            return;
        }
        this.composerChangedFilesBulkBusy = true;
        this.refreshComposerActivityStack();
        try {
            const files = await this.fetchWorkspaceChangedFiles(project, summary);
            if (files.length === 0) {
                return;
            }
            await this.runComposerGitFileAction(project, summary, 'discard', files);
            await this.syncComposerGitSnapshot(project, summary);
            this.refreshComposerActivityStack();
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/stickyComposerUndoAllDone', 'All changes discarded'),
                { kind: 'success', duration: 1800 },
            );
        } catch {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/stickyComposerUndoAllFailed', 'Could not discard all changes'),
                { kind: 'warning', duration: 2800 },
            );
        } finally {
            this.composerChangedFilesBulkBusy = false;
            this.refreshComposerActivityStack();
        }
    }

    protected async keepAllComposerChangedFiles(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.composerChangedFilesBulkBusy) {
            return;
        }
        this.composerChangedFilesBulkBusy = true;
        this.refreshComposerActivityStack();
        try {
            const files = await this.fetchWorkspaceChangedFiles(project, summary);
            if (files.length === 0) {
                return;
            }
            await this.runComposerGitFileAction(project, summary, 'stage', files);
            await this.syncComposerGitSnapshot(project, summary);
            this.refreshComposerActivityStack();
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/stickyComposerKeepAllDone', 'All changes kept'),
                { kind: 'success', duration: 1800 },
            );
        } catch {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/stickyComposerKeepAllFailed', 'Could not keep all changes'),
                { kind: 'warning', duration: 2800 },
            );
        } finally {
            this.composerChangedFilesBulkBusy = false;
            this.refreshComposerActivityStack();
        }
    }

    protected mapGitChangedFileToComposerView(file: QaapGitChangedFile): StickyComposerChangedFileView {
        const untracked = file.status === 'U' || file.status === '?';
        const created = untracked || file.status === 'A';
        return {
            path: file.path,
            kind: created ? 'created' : 'edited',
            added: file.adds > 0 ? file.adds : undefined,
            removed: file.dels > 0 ? file.dels : undefined,
        };
    }

    protected async refreshComposerActivityGitFilesIfNeeded(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        conv: QaapAgentConversationDTO | undefined,
        activityFiles: {
            readonly files: readonly StickyComposerChangedFileView[];
            readonly stats?: { readonly added: number; readonly removed: number };
        },
    ): Promise<void> {
        if (!this.isComposerBackgroundWorkAllowed()) {
            return;
        }
        if (this.composerActivityGitFilesByConversationId.has(summary.id)) {
            return;
        }
        // Skip the repo-wide git snapshot until the agent has actually edited files here.
        // Tool-call evidence alone must count: some agent CLIs (e.g. opencode/QAIQ) report
        // Edit/Write tool calls without parseable paths or diff stats, leaving activityFiles
        // empty even though the agent did change files — same gate as the pill itself.
        if (!this.hasComposerAgentActivity(activityFiles)
            && !this.host.transcriptMessagesUi.hasComposerFileChangeToolCalls(conv)) {
            return;
        }
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        if (!cwd) {
            return;
        }
        try {
            const response = await fetch(
                `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(cwd)}`,
                { credentials: 'include' },
            );
            if (!response.ok) {
                return;
            }
            const body = await response.json() as { files?: QaapGitChangedFile[] };
            const files = (body.files ?? []).map(file => this.mapGitChangedFileToComposerView(file));
            this.composerActivityGitFilesByConversationId.set(summary.id, files);
            if (this.host.transcriptComposerSummary?.id !== summary.id) {
                return;
            }
            this.refreshComposerActivityStack();
        } catch {
            // Git review is optional — composer still shows aggregate diff stats.
        }
    }

    protected buildTranscriptComposerActivityOptions(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): StickyComposerActivityStackOptions {
        const conv = this.host.transcriptLastConv?.id === summary.id ? this.host.transcriptLastConv : undefined;
        const activityFiles = this.resolveComposerActivityFilesForStack(project, summary, conv);
        void this.refreshComposerActivityGitFilesIfNeeded(project, summary, conv, activityFiles);
        const agentWorking = this.isTranscriptStickyComposerAgentWorking();
        return {
            queueEntries: this.host.transcriptFollowUpQueue.peek(summary.id),
            queueExpanded: this.host.transcriptComposerQueueExpanded,
            onQueueExpandedChange: expanded => { this.host.transcriptComposerQueueExpanded = expanded; },
            onQueueEdit: (index, entry) => {
                this.host.transcriptComposerDraft = entry.draft;
                this.host.transcriptFollowUpQueue.removeAt(summary.id, index);
                this.remountTranscriptStickyComposer();
            },
            onQueueMoveUp: index => {
                if (this.host.transcriptFollowUpQueue.moveUp(summary.id, index)) {
                    this.refreshComposerActivityStack();
                }
            },
            onQueueRemove: index => {
                this.host.transcriptFollowUpQueue.removeAt(summary.id, index);
                this.refreshComposerActivityStack();
            },
            changedFiles: activityFiles.files,
            diffStats: activityFiles.stats,
            filesExpanded: this.peekTranscriptComposerChangedFilesExpanded(summary.id),
            onFilesExpandedChange: expanded => { this.setTranscriptComposerChangedFilesExpanded(summary.id, expanded); },
            agentWorking,
            onStop: () => { void this.host.onCancelConversation(project, summary); },
            onReview: () => {
                this.host.executionSurfaceTabsUi.selectTranscriptTab('review', project, summary);
            },
            onCommitAction: (this.host.commitMessageAi || this.host.quickInputService)
                ? action => { void this.runComposerCommitAction(project, summary, action); }
                : undefined,
            commitBusy: this.composerCommitBusy || this.composerChangedFilesBulkBusy,
        };
    }

    /** Same git workflows as the diff-review toolbar, surfaced beside the composer Changes pill. */
    protected async runComposerCommitAction(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        action: QaapGitCommitWorkflowAction,
    ): Promise<void> {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        if (!cwd || this.composerCommitBusy) {
            return;
        }
        this.composerCommitBusy = true;
        this.refreshComposerActivityStack();
        try {
            // The AI writes the commit message automatically from the diff (Cursor-agents style).
            const generated = await this.host.commitMessageAi?.generate(cwd);
            let message = generated?.message;
            if (!message) {
                message = (await this.host.quickInputService?.input({
                    title: nls.localize('qaap/mobileProjects/commitMessageTitle', 'Commit message'),
                    placeHolder: nls.localize('qaap/mobileProjects/commitMessagePlaceholder', 'Describe your changes'),
                    prompt: nls.localize('qaap/mobileProjects/commitMessagePrompt', 'Message for this commit'),
                }))?.trim();
            }
            if (!message) {
                return;
            }
            const needsBranch = action === 'create-branch-commit' || action === 'create-branch-commit-push';
            let branchName: string | undefined;
            if (needsBranch) {
                branchName = this.host.quickInputService
                    ? (await this.host.quickInputService.input({
                        title: nls.localize('qaap/mobileProjects/newBranchTitle', 'Create branch'),
                        value: generated?.branchName,
                        placeHolder: nls.localize('qaap/mobileProjects/newBranchPlaceholder', 'feature/my-change'),
                        prompt: nls.localize('qaap/mobileProjects/newBranchPrompt', 'Name for the new branch'),
                    }))?.trim()
                    : generated?.branchName;
                if (!branchName) {
                    return;
                }
            }
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/commit-workflow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ root: cwd, action, branchName, message }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? `commit workflow failed (${response.status})`);
            }
            if (action === 'commit-create-pr' && this.host.commands) {
                try {
                    await this.host.commands.executeCommand('pr.pushAndCreate', { repoPath: cwd });
                } catch {
                    await this.host.commands.executeCommand('pr.create', { repoPath: cwd });
                }
            }
            // `git add -A && git commit` leaves the tree clean — hide the Changes pill and the
            // commit buttons right away, then re-verify against the real working tree.
            this.composerActivityGitFilesByConversationId.set(summary.id, []);
            void this.syncComposerGitSnapshot(project, summary)
                .then(() => this.refreshComposerActivityStack())
                .catch(() => undefined);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/stickyComposerCommitDone', 'Changes committed'),
                { kind: 'success', duration: 1800 },
            );
        } catch (error) {
            MobileSnackbar.show(
                error instanceof Error && error.message
                    ? error.message
                    : nls.localize('qaap/mobileProjects/stickyComposerCommitFailed', 'Commit failed'),
                { kind: 'warning', duration: 3200 },
            );
        } finally {
            this.composerCommitBusy = false;
            this.refreshComposerActivityStack();
        }
    }

    buildTranscriptComposerActivityStack(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement | undefined {
        return renderStickyComposerActivityStack(this.buildTranscriptComposerActivityOptions(project, summary));
    }

    buildTranscriptComposerChangesPill(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement | undefined {
        return renderStickyComposerChangesPill(this.buildTranscriptComposerActivityOptions(project, summary));
    }

    syncComposerActivityFingerprint(
        summary: QaapAgentConversationSummaryDTO,
        project?: MobileProjectEntry,
    ): void {
        const conv = this.host.transcriptLastConv?.id === summary.id ? this.host.transcriptLastConv : undefined;
        const resolvedProject = project ?? this.host.transcriptComposerProject;
        const activityFiles = resolvedProject
            ? this.resolveComposerActivityFilesForStack(resolvedProject, summary, conv)
            : this.host.transcriptMessagesUi.resolveComposerActivityFiles(conv, summary);
        this.lastComposerActivityFingerprint = `${this.host.transcriptFollowUpQueue.size(summary.id)}|${activityFiles.files.map(file => file.path).join('\n')}|${activityFiles.stats?.added ?? 0}:${activityFiles.stats?.removed ?? 0}|${conv?.status ?? summary.status}`;
    }

    refreshComposerActivityStack(): void {
        const host = this.host.transcriptComposerHost;
        const project = this.host.transcriptComposerProject;
        const summary = this.host.transcriptComposerSummary;
        if (!host?.isConnected || !project || !summary) {
            return;
        }
        const wrap = host.querySelector('.theia-mobile-projects-sticky-composer-inner');
        const card = wrap?.querySelector('.theia-mobile-projects-sticky-composer-card.theia-mod-codex');
        if (!wrap || !card) {
            this.remountTranscriptStickyComposer();
            return;
        }
        const changesPill = this.buildTranscriptComposerChangesPill(project, summary);
        const existingPill = wrap.querySelector(':scope > .theia-mobile-sticky-composer-changes-pill-host');
        if (!changesPill) {
            existingPill?.remove();
        } else if (existingPill) {
            existingPill.replaceWith(changesPill);
        } else {
            wrap.insertBefore(changesPill, card);
        }
        const stack = this.buildTranscriptComposerActivityStack(project, summary);
        const existing = card.querySelector(':scope > .theia-mobile-sticky-composer-activity-stack');
        if (!stack) {
            existing?.remove();
            card.classList.remove('theia-mod-has-activity');
        } else if (existing) {
            existing.replaceWith(stack);
            card.classList.add('theia-mod-has-activity');
        } else {
            const stage = card.querySelector(':scope > .theia-mobile-projects-sticky-composer-stage');
            if (stage) {
                card.insertBefore(stack, stage);
            } else {
                card.append(stack);
            }
            card.classList.add('theia-mod-has-activity');
        }
        this.syncComposerActivityFingerprint(summary, project);
        this.host.composerHeaderUi.updateStickyComposerFabLift();
    }

    refreshTranscriptComposerActivityIfNeeded(conv: QaapAgentConversationDTO): void {
        if (!this.isComposerBackgroundWorkAllowed()) {
            return;
        }
        const summary = this.host.transcriptComposerSummary;
        const project = this.host.transcriptComposerProject;
        if (!summary || summary.id !== conv.id || !this.host.transcriptComposerHost?.isConnected) {
            return;
        }
        const queueSize = this.host.transcriptFollowUpQueue.size(summary.id);
        const activityFiles = project
            ? this.resolveComposerActivityFilesForStack(project, summary, conv)
            : this.host.transcriptMessagesUi.resolveComposerActivityFiles(conv, summary);
        const fingerprint = `${queueSize}|${activityFiles.files.map(file => file.path).join('\n')}|${activityFiles.stats?.added ?? 0}:${activityFiles.stats?.removed ?? 0}|${conv.status}`;
        if (fingerprint === this.lastComposerActivityFingerprint) {
            this.host.transcriptComposerSendRefresh?.();
            return;
        }
        this.lastComposerActivityFingerprint = fingerprint;
        // Activity changed (new agent edits, turn finished) — drop the cached git snapshot so the
        // Changes pill refetches instead of keeping a stale (possibly empty) file list.
        this.composerActivityGitFilesByConversationId.delete(conv.id);
        this.refreshComposerActivityStack();
        this.host.transcriptComposerSendRefresh?.();
    }

    isTranscriptFollowUpReady(summary: QaapAgentConversationSummaryDTO): boolean {
        if (this.host.transcriptFollowUpFlushInFlight) {
            return false;
        }
        if (this.host.transcriptLastConv?.id === summary.id) {
            return resolveTranscriptEffectiveStatus(this.host.transcriptLastConv) !== 'streaming';
        }
        return summary.status !== 'streaming';
    }

    async flushTranscriptFollowUpQueue(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (!this.isTranscriptFollowUpReady(summary)) {
            return;
        }
        const next = this.host.transcriptFollowUpQueue.shift(summary.id);
        if (!next) {
            return;
        }
        this.host.transcriptFollowUpFlushInFlight = true;
        try {
            await this.host.submitTranscriptViaBackendConversation(project, summary, next.draft, {
                selectedAgentId: next.selectedAgentId,
                modeId: next.modeId,
                autoApprove: next.autoApprove,
                approvalPolicyId: next.approvalPolicyId,
            });
        } catch (error) {
            this.host.transcriptFollowUpQueue.unshift(summary.id, next);
            const detail = error instanceof Error ? error.message : String(error);
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail,
            ));
        } finally {
            this.host.transcriptFollowUpFlushInFlight = false;
            this.remountTranscriptStickyComposer();
        }
    }

    isTranscriptStickyComposerAgentWorking(): boolean {
        const summary = this.host.transcriptComposerSummary;
        if (!summary || !this.host.transcriptComposerHost?.isConnected) {
            return false;
        }
        if (this.host.transcriptLastConv?.id === summary.id) {
            return resolveTranscriptEffectiveStatus(this.host.transcriptLastConv) === 'streaming';
        }
        if (summary.source === 'theia-chat' && this.host.chatService) {
            const sessionId = summary.sessionId ?? this.host.transcriptTheiaSessionByConversationId.get(summary.id);
            const session = sessionId ? this.host.chatService.getSession(sessionId) : undefined;
            if (session && this.host.chatServiceSummariesUi.isChatSessionWorking(session)) {
                return true;
            }
        }
        const project = this.host.transcriptComposerProject;
        if (project) {
            const latest = this.host.conversationIndexUi.conversationsForProject(project).find(candidate => candidate.id === summary.id);
            if (latest?.status === 'streaming') {
                return true;
            }
        }
        return this.host.transcriptOpenSummary?.id === summary.id && this.host.transcriptOpenSummary.status === 'streaming';
    }

    applyTranscriptComposerPrefsFromConversation(
        conv: QaapAgentConversationDTO,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return;
        }
        const prefs = extractConversationComposerPrefs(conv);
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        this.host.transcriptComposerPrefsConvId = conv.id;
        this.host.transcriptComposerPinnedAgentId = prefs.agentId;
        if (cwd) {
            writeStoredAgent(cwd, prefs.agentId);
            if (prefs.agentModel) {
                writeStoredAgentModel(cwd, prefs.agentId, prefs.agentModel);
            }
            if (prefs.interactionModeId) {
                writeStoredComposerMode(cwd, prefs.interactionModeId);
            }
            writeStoredAgentApprovalPolicy(cwd, prefs.approvalPolicyId);
            writeStoredAgentToolApprovalRules(cwd, prefs.toolApprovalRules);
        }
        const modes = resolveStickyComposerModes(prefs.agentId, this.host.chatAgentService);
        this.host.transcriptComposerModeId = reconcileComposerModeId(
            prefs.interactionModeId,
            modes,
            cwd,
        );
        this.host.transcriptComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
            prefs.approvalPolicyId,
            cwd,
        );
        this.host.transcriptComposerToolApprovalRules = prefs.toolApprovalRules;
        this.host.transcriptComposerDraft = readConversationComposerDraft(conv.id);
    }

    async hydrateTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<boolean> {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return false;
        }
        const conv = this.host.transcriptLastConv?.id === summary.id
            ? this.host.transcriptLastConv
            : await getConversation(summary.id).catch(() => undefined);
        if (!conv || conv.id !== summary.id) {
            return false;
        }
        if (this.host.transcriptComposerPrefsConvId === conv.id) {
            return false;
        }
        this.applyTranscriptComposerPrefsFromConversation(conv, project, summary);
        return true;
    }

    schedulePersistTranscriptComposerDraft(conversationId: string | undefined): void {
        if (!conversationId) {
            return;
        }
        if (this.host.transcriptComposerDraftPersistTimer !== undefined) {
            window.clearTimeout(this.host.transcriptComposerDraftPersistTimer);
        }
        this.host.transcriptComposerDraftPersistTimer = window.setTimeout(() => {
            this.host.transcriptComposerDraftPersistTimer = undefined;
            writeConversationComposerDraft(conversationId, this.host.transcriptComposerDraft);
        }, 280);
    }

    schedulePersistTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return;
        }
        if (this.host.transcriptComposerPrefsPersistTimer !== undefined) {
            window.clearTimeout(this.host.transcriptComposerPrefsPersistTimer);
        }
        this.host.transcriptComposerPrefsPersistTimer = window.setTimeout(() => {
            this.host.transcriptComposerPrefsPersistTimer = undefined;
            void this.persistTranscriptComposerPrefs(project, summary);
        }, 320);
    }

    async persistTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return;
        }
        const agentId = this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary);
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const patch = buildUpdateConversationComposerPatch({
            agentId,
            ...(agentSupportsModelPicker(agentId)
                ? { agentModel: readStoredAgentModel(cwd, agentId) }
                : {}),
            ...(this.host.transcriptComposerModeId ? { interactionModeId: this.host.transcriptComposerModeId } : {}),
            ...(this.host.transcriptComposerApprovalPolicyId
                ? {
                    approvalPolicyId: this.host.transcriptComposerApprovalPolicyId,
                    toolApprovalRules: reconcileAgentToolApprovalRules(
                        this.host.transcriptComposerApprovalPolicyId,
                        cwd,
                        this.host.transcriptComposerToolApprovalRules,
                    ),
                }
                : {}),
        });
        if (Object.keys(patch).length === 0) {
            return;
        }
        try {
            const updated = await updateConversation(summary.id, patch);
            this.host.transcriptComposerPrefsConvId = updated.id;
            if (this.host.transcriptLastConv?.id === updated.id) {
                this.host.transcriptLastConv = updated;
            }
            this.host.conversations?.recordSnapshot(conversationToSummary(updated));
        } catch {
            /* best-effort — composer still works for the current runtime */
        }
    }

    mountTranscriptStickyComposer(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        warmAgentTurnPath(cwd, {
            warmLiveTransport: () => this.host.conversations?.warmLiveTransport(),
        });
        const mountKey = `${project.id}|${summary.id}`;
        const composerStable = this.host.transcriptComposerMountKey === mountKey
            && this.host.transcriptComposerHost === host
            && host.childElementCount > 0;
        if (composerStable) {
            this.host.transcriptComposerSendRefresh?.();
            this.refreshComposerActivityStack();
            return;
        }
        this.host.transcriptComposerMountKey = mountKey;
        this.host.transcriptComposerHost = host;
        this.host.transcriptComposerProject = project;
        this.host.transcriptComposerSummary = summary;
        this.host.transcriptComposerSendRefresh = undefined;
        // Conversations share the project's working tree — a git snapshot cached while another
        // session was open can be stale (e.g. committed meanwhile). Refetch per (re)mount so the
        // Changes pill + commit button reflect this conversation's current pending changes.
        this.composerActivityGitFilesByConversationId.delete(summary.id);
        this.host.stickyComposerContextUsageDispose.dispose();
        host.replaceChildren();
        if (this.host.transcriptLastConv?.id === summary.id
            && this.host.transcriptComposerPrefsConvId !== summary.id) {
            this.applyTranscriptComposerPrefsFromConversation(this.host.transcriptLastConv, project, summary);
        } else if (this.host.transcriptLastConv?.id !== summary.id) {
            void this.hydrateTranscriptComposerPrefs(project, summary).then(applied => {
                if (!applied) {
                    return;
                }
                this.host.transcriptComposerSendRefresh?.();
            });
        }
        const shell = document.createElement('div');
        shell.className = 'theia-mobile-projects-sticky-composer';
        const isLegacyTheiaChat = summary.source === 'theia-chat';
        const pinnedId = this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary);
        const modes = resolveStickyComposerModes(pinnedId, this.host.chatAgentService);
        this.host.transcriptComposerModeId = reconcileComposerModeId(
            this.host.transcriptComposerModeId,
            modes,
            cwd,
        );
        const showApprovalPolicy = !isLegacyTheiaChat && agentSupportsApprovalPolicy(pinnedId);
        if (showApprovalPolicy) {
            this.host.transcriptComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
                this.host.transcriptComposerApprovalPolicyId,
                cwd,
            );
            this.host.transcriptComposerToolApprovalRules = reconcileAgentToolApprovalRules(
                this.host.transcriptComposerApprovalPolicyId,
                cwd,
                this.host.transcriptComposerToolApprovalRules,
            );
        } else {
            this.host.transcriptComposerApprovalPolicyId = undefined;
            this.host.transcriptComposerToolApprovalRules = undefined;
        }
        const activityOptions = this.buildTranscriptComposerActivityOptions(project, summary);
        const column = this.host.stickyComposerColumnUi.buildStickyComposerColumn({
            project,
            composerCwd: cwd,
            surface: 'task',
            agentLocked: isLegacyTheiaChat,
            activityStack: renderStickyComposerActivityStack(activityOptions),
            changesPill: renderStickyComposerChangesPill(activityOptions),
            getContext: () => this.host.transcriptComposerContext,
            clearContext: () => {
                disposeComposerContextEntries(this.host.transcriptComposerContext);
                this.host.transcriptComposerContext = [];
                this.remountTranscriptStickyComposer();
            },
            removeContextItem: index => {
                revokeComposerContextPreview(this.host.transcriptComposerContext[index]);
                this.host.transcriptComposerContext.splice(index, 1);
                this.remountTranscriptStickyComposer();
            },
            formatContextChip: item => this.host.stickyComposerContextUi.formatComposerContextEntry(item),
            filesExpanded: this.host.transcriptComposerFilesExpanded,
            onFilesExpandedChange: expanded => { this.host.transcriptComposerFilesExpanded = expanded; },
            getDraft: () => this.host.transcriptComposerDraft,
            setDraft: value => {
                this.host.transcriptComposerDraft = value;
                this.schedulePersistTranscriptComposerDraft(summary.id);
            },
            resolveAgentLabel: () => this.host.transcriptComposerUi.resolveTranscriptComposerAgentLabel(),
            resolveAgentId: () => this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary),
            modes,
            resolveModeLabel: () => resolveComposerModeLabel(modes, this.host.transcriptComposerModeId),
            onOpenModeSheet: modes.length > 1
                ? anchor => { this.host.transcriptComposerUi.openTranscriptComposerModeSheet(project, summary, modes, anchor); }
                : undefined,
            approvalPolicyId: showApprovalPolicy ? this.host.transcriptComposerApprovalPolicyId : undefined,
            onOpenApprovalPolicySheet: showApprovalPolicy
                ? anchor => {
                    this.host.transcriptComposerUi.openTranscriptComposerApprovalPolicySheet(
                        project,
                        summary,
                        this.host.transcriptComposerUi.resolveTranscriptComposerAgentLabel(),
                        anchor,
                    );
                }
                : undefined,
            canSubmit: true,
            isAgentWorking: () => this.isTranscriptStickyComposerAgentWorking(),
            onStop: () => { void this.host.onCancelConversation(project, summary); },
            onSendControlMounted: refresh => { this.host.transcriptComposerSendRefresh = refresh; },
            onAttach: anchor => { void this.onTranscriptComposerAttach(project, anchor); },
            onOpenAgentSheet: isLegacyTheiaChat
                ? () => { /* Legacy Theia chat is not agent-switchable */ }
                : anchor => { this.host.transcriptComposerUi.openTranscriptComposerAgentSheet(project, summary, anchor); },
            sendLabel: this.isTranscriptStickyComposerAgentWorking()
                ? nls.localize('qaap/mobileProjects/transcriptQueue', 'Queue')
                : nls.localize('qaap/mobileProjects/transcriptSend', 'Send'),
            onSubmit: draft => {
                if (hasPendingComposerContextEntries(this.host.transcriptComposerContext)) {
                    this.host.stickyComposerContextUi.notifyPendingComposerAttachments();
                    return;
                }
                const resolvedPinnedId = this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary);
                const selectedAgentId = resolveExplicitAgentForSubmit(draft, {
                    pinnedChatAgentId: resolvedPinnedId,
                }) ?? resolvedPinnedId;
                const requests = composerContextRequests(this.host.transcriptComposerContext);
                const variables = requests.length > 0 ? requests : undefined;
                const modeId = this.host.transcriptComposerModeId;
                const autoApprove = resolveComposerAutoApprove(
                    showApprovalPolicy,
                    this.host.transcriptComposerApprovalPolicyId,
                    summary.cwd,
                );
                disposeComposerContextEntries(this.host.transcriptComposerContext);
                this.host.transcriptComposerContext = [];
                const clearComposerDraft = (): void => {
                    clearConversationComposerDraft(summary.id);
                    this.host.transcriptComposerDraft = '';
                };
                if (this.isTranscriptStickyComposerAgentWorking() && !isAgentsHubIdleConversationSummary(summary)) {
                    const queued = this.enqueueTranscriptFollowUp(summary.id, {
                        draft,
                        selectedAgentId,
                        modeId,
                        autoApprove,
                        approvalPolicyId: reconcileAgentApprovalPolicyId(
                            this.host.transcriptComposerApprovalPolicyId,
                            summary.cwd,
                        ),
                    });
                    if (queued) {
                        clearComposerDraft();
                        this.refreshComposerActivityStack();
                        const input = this.host.transcriptComposerHost?.querySelector('.theia-mobile-projects-sticky-composer-input');
                        if (input instanceof HTMLTextAreaElement) {
                            input.value = '';
                        }
                        this.host.transcriptComposerSendRefresh?.();
                    }
                    return;
                }
                clearComposerDraft();
                if (isAgentsHubIdleConversationSummary(summary)) {
                    const activeChatHost = this.resolveComposerTranscriptChatHost(chatHost);
                    if (activeChatHost) {
                        this.workHub.renderIdleSubmitOptimistic(activeChatHost, summary, draft, selectedAgentId);
                    }
                    this.host.transcriptComposerSendRefresh?.();
                    void (async () => {
                        try {
                            await this.host.submitBackgroundAgentTask(project, draft, {
                                openConversation: true,
                                forceVps: true,
                                selectedAgentId,
                                modeId,
                                variables,
                                autoApprove,
                                approvalPolicyId: reconcileAgentApprovalPolicyId(
                                    this.host.transcriptComposerApprovalPolicyId,
                                    summary.cwd,
                                ),
                            });
                        } catch {
                            /* submitBackgroundAgentTask surfaces errors */
                        } finally {
                            this.host.stickyComposerRenderUi.renderStickyComposer();
                        }
                    })();
                    return;
                }
                void (async () => {
                    try {
                        if (isLegacyTheiaChat) {
                            await this.host.submitBackgroundAgentTask(project, draft, {
                                openConversation: true,
                                forceVps: true,
                                selectedAgentId: QAAP_PRIMARY_AGENT_ID,
                                modeId,
                                variables,
                                autoApprove,
                                approvalPolicyId: reconcileAgentApprovalPolicyId(
                                    this.host.transcriptComposerApprovalPolicyId,
                                    summary.cwd,
                                ),
                            });
                        } else {
                            await this.host.submitTranscriptViaBackendConversation(project, summary, draft, {
                                selectedAgentId,
                                modeId,
                                variables,
                                autoApprove,
                                approvalPolicyId: reconcileAgentApprovalPolicyId(
                                    this.host.transcriptComposerApprovalPolicyId,
                                    summary.cwd,
                                ),
                            });
                        }
                    } catch (error) {
                        const detail = error instanceof Error ? error.message : String(error);
                        this.host.messageService?.error(nls.localize(
                            'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail
                        ));
                    } finally {
                        this.remountTranscriptStickyComposer();
                    }
                })();
            },
            getMentionOptions: () => this.host.stickyComposerContextUi.resolveComposerMentionOptions(this.host.transcriptComposerBackendAgents, false),
            getVariableOptions: this.host.getComposerVariables
                ? () => this.host.stickyComposerContextUi.resolveComposerVariableOptions()
                : undefined,
            inputPlaceholder: isAgentsHubIdleConversationSummary(summary)
                ? nls.localize('qaap/mobileProjects/stickyComposerNewTask', 'Delegate a task…')
                : isLegacyTheiaChat
                    ? nls.localize('qaap/mobileProjects/transcriptLegacyTheiaPlaceholder', 'Start a new QAIQ session…')
                    : nls.localize('qaap/mobileProjects/transcriptTaskPlaceholder', 'Follow up on this task…'),
            onContextUsageBadgeMounted: badge => {
                this.host.stickyComposerContextUsageDispose = this.host.stickyComposerRenderUi.mountStickyComposerContextUsage(
                    badge,
                    () => this.resolveTranscriptContextUsageTarget(summary),
                );
            },
            onOpenContextUsageSheet: anchor => {
                this.host.stickyComposerSheetsUi.openStickyComposerContextUsageSheet(
                    () => {
                        const target = this.resolveTranscriptContextUsageTarget(summary);
                        if (target?.chatModel) {
                            return resolveChatModelContextUsageBreakdown(target.chatModel);
                        }
                        return resolveVpsContextUsageBreakdown(target?.summary, target?.full);
                    },
                    !this.host.agentsHubShellActive,
                    anchor,
                );
            },
            showWorkspaceBar: this.host.composerHeaderUi.shouldShowComposerWorkspaceBar(summary),
            transcriptOverlay: !this.host.agentsHubShellActive,
        });
        const modeHint = describeComposerInteractionMode(this.host.transcriptComposerModeId);
        if (modeHint) {
            const modeBanner = document.createElement('div');
            modeBanner.className = 'theia-mobile-sticky-composer-mode-banner';
            modeBanner.textContent = modeHint;
            shell.append(modeBanner);
        }
        if (isLegacyTheiaChat) {
            const legacyBanner = document.createElement('div');
            legacyBanner.className = 'theia-mobile-sticky-composer-legacy-banner';
            legacyBanner.textContent = nls.localize(
                'qaap/mobileProjects/transcriptLegacyTheiaBanner',
                'Legacy local chat — replies start a new QAIQ session in the cloud.',
            );
            shell.append(legacyBanner);
        }
        shell.append(column);
        host.append(shell);
        this.syncComposerActivityFingerprint(summary, project);
        if (this.host.transcriptLastConv?.id === summary.id) {
            this.host.transcriptLiveUi.syncTranscriptPendingApproval(this.host.transcriptLastConv);
        }
    }

    remountTranscriptStickyComposer(): void {
        const host = this.host.transcriptComposerHost;
        const project = this.host.transcriptComposerProject;
        const summary = this.host.transcriptComposerSummary;
        const chatHost = this.resolveComposerTranscriptChatHost(this.host.transcriptChatHost);
        if (!host?.isConnected || !project || !summary) {
            return;
        }
        this.host.transcriptComposerMountKey = undefined;
        this.mountTranscriptStickyComposer(host, project, summary, chatHost ?? host);
    }
}
