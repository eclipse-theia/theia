// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatMode } from '@theia/ai-chat';
import type {
    QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    isTheiaCoderAgent,
    isQaiqAgent,
    migrateLegacyBackendAgentId,
    QAAP_PRIMARY_AGENT_ID,
    readStoredAgent,
    THEIA_CODER_AGENT_ID,
    writeStoredAgent,
    writeStoredAgentModel,
    type QaapAgentTaskAgentOption,
    type QaapQaiqModelOption,
} from '../common/qaap-agent-task-client';
import {
    reconcileComposerModeId,
    resolveStickyComposerModes,
    writeStoredComposerMode,
} from '../common/qaap-sticky-composer-mode';
import {
    reconcileAgentApprovalPolicyId,
    writeStoredAgentApprovalPolicy,
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    writeStoredAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import { isAgentsHubIdleConversationSummary } from '../common/qaap-agents-hub-landing';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsTranscriptStickyComposerUi } from './mobile-projects-transcript-sticky-composer-ui';
import type { MobileProjectsStickyComposerSheetsUi } from './mobile-projects-sticky-composer-sheets-ui';

export interface ComposerAgentPickerChrome {
    readonly sheet: HTMLElement;
    readonly header: HTMLElement;
    readonly title: HTMLElement;
    readonly backBtn: HTMLButtonElement;
    readonly list: HTMLElement;
}

/** Panel surface for transcript overlay composer sheets and agent resolution. */
export interface MobileProjectsTranscriptComposerHost {
    transcriptComposerAgentSheet: HTMLElement | undefined;
    transcriptComposerQaiqModelSheet: HTMLElement | undefined;
    transcriptComposerModeSheet: HTMLElement | undefined;
    transcriptComposerApprovalSheet: HTMLElement | undefined;
    stickyComposerWorkspaceSheet: HTMLElement | undefined;
    transcriptComposerPinnedAgentId: string | undefined;
    transcriptComposerModeId: string | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    transcriptComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    transcriptComposerBackendAgents: QaapAgentTaskAgentOption[];
    transcriptComposerQaiqModels: QaapQaiqModelOption[];
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptComposerSendRefresh: (() => void) | undefined;
    preparedCwdByProjectId: ReadonlyMap<string, string>;
    projectsService: MobileProjectsService;
    chatAgentService?: ChatAgentService;
    activeTasks?: MobileProjectsActiveTasks;
    transcriptStickyComposerUi: MobileProjectsTranscriptStickyComposerUi;
    stickyComposerSheetsUi: MobileProjectsStickyComposerSheetsUi;
    stickyComposerAgentsUi: import('./mobile-projects-sticky-composer-agents-ui').MobileProjectsStickyComposerAgentsUi;
    stickyComposerWorkspaceUi: import('./mobile-projects-sticky-composer-workspace-ui').MobileProjectsStickyComposerWorkspaceUi;

    loadBackendAgentSnapshot(): Promise<{
        agents: QaapAgentTaskAgentOption[];
        qaiqModels: QaapQaiqModelOption[];
        defaultAgent?: string;
    }>;
    resolveConversationAgentLabel(summary: QaapAgentConversationSummaryDTO | undefined): string;
    projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
}

/** Transcript sticky-composer agent/mode/approval sheets and backend agent list refresh. */
export class MobileProjectsTranscriptComposerUi {

    constructor(protected readonly host: MobileProjectsTranscriptComposerHost) { }

    async ensureTranscriptComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]> {
        if (this.host.transcriptComposerBackendAgents.length === 0) {
            await this.refreshTranscriptComposerAgents(project);
        }
        return this.host.stickyComposerAgentsUi.filterSelectableComposerAgents(this.host.transcriptComposerBackendAgents);
    }

    resolveTranscriptComposerPinnedAgentId(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        if (summary.source === 'theia-chat') {
            return QAAP_PRIMARY_AGENT_ID;
        }
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        if (this.host.transcriptComposerPinnedAgentId) {
            const explicit = this.host.transcriptComposerPinnedAgentId;
            if (explicit !== 'task' && !isTheiaCoderAgent(explicit)) {
                return isQaiqAgent(explicit) ? QAAP_PRIMARY_AGENT_ID : explicit;
            }
        }
        const summaryAgent = isAgentsHubIdleConversationSummary(summary)
            ? undefined
            : migrateLegacyBackendAgentId(summary.agentId);
        const pinned = this.host.transcriptComposerPinnedAgentId
            ?? summaryAgent
            ?? readStoredAgent(cwd);
        if (pinned && pinned !== 'task' && !isTheiaCoderAgent(pinned)) {
            return isQaiqAgent(pinned) ? QAAP_PRIMARY_AGENT_ID : pinned;
        }
        return this.host.transcriptComposerBackendAgents[0]?.id ?? QAAP_PRIMARY_AGENT_ID;
    }

    resolveTranscriptComposerAgentLabel(): string {
        const pinned = this.host.transcriptComposerPinnedAgentId;
        if (isTheiaCoderAgent(pinned)) {
            return this.host.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)?.name ?? 'Coder';
        }
        const fromList = this.host.transcriptComposerBackendAgents.find(a => a.id === pinned)?.label;
        if (fromList) {
            return fromList;
        }
        return this.host.projectRowsUi.resolveConversationAgentLabel(this.host.transcriptComposerSummary);
    }

    async refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void> {
        const cwd = this.host.projectsService.getProjectCwd(project)
            ?? this.host.transcriptComposerSummary?.cwd
            ?? this.host.preparedCwdByProjectId.get(project.id);
        try {
            const snapshot = await this.host.loadBackendAgentSnapshot();
            const filteredAgents = this.host.stickyComposerAgentsUi.filterSelectableComposerAgents(snapshot.agents);
            this.host.transcriptComposerBackendAgents = filteredAgents;
            this.host.transcriptComposerQaiqModels = snapshot.qaiqModels;
            const resolved = this.host.stickyComposerAgentsUi.reconcileStickyComposerPinnedAgent(
                this.host.transcriptComposerPinnedAgentId ?? readStoredAgent(cwd),
                filteredAgents,
                snapshot.defaultAgent,
                cwd,
            );
            const summary = this.host.transcriptComposerSummary;
            const priorEffective = summary && this.host.transcriptOpenProject
                ? this.resolveTranscriptComposerPinnedAgentId(this.host.transcriptOpenProject, summary)
                : undefined;
            if (this.host.transcriptComposerPinnedAgentId !== resolved) {
                this.host.transcriptComposerPinnedAgentId = resolved;
                if (priorEffective !== undefined && priorEffective !== resolved) {
                    this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
                } else {
                    this.host.transcriptComposerSendRefresh?.();
                }
            }
        } catch {
            this.host.transcriptComposerBackendAgents = this.host.stickyComposerAgentsUi.filterSelectableComposerAgents(this.host.activeTasks?.getAgents() ?? []);
            this.host.transcriptComposerQaiqModels = [];
        }
    }

    openTranscriptComposerApprovalPolicySheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        agentLabel: string,
        anchor?: HTMLElement,
    ): void {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        this.host.stickyComposerSheetsUi.openApprovalPolicySheet({
            agentLabel,
            cwd,
            anchor,
            transcriptOverlay: true,
            selectedId: reconcileAgentApprovalPolicyId(this.host.transcriptComposerApprovalPolicyId, cwd),
            toolRules: reconcileAgentToolApprovalRules(
                reconcileAgentApprovalPolicyId(this.host.transcriptComposerApprovalPolicyId, cwd),
                cwd,
                this.host.transcriptComposerToolApprovalRules,
            ),
            isOpen: () => this.host.transcriptComposerApprovalSheet !== undefined,
            onSelect: policyId => {
                this.host.transcriptComposerApprovalPolicyId = policyId;
                this.host.transcriptComposerToolApprovalRules = reconcileAgentToolApprovalRules(
                    policyId,
                    cwd,
                    this.host.transcriptComposerToolApprovalRules,
                );
                if (cwd) {
                    writeStoredAgentApprovalPolicy(cwd, policyId);
                    writeStoredAgentToolApprovalRules(cwd, this.host.transcriptComposerToolApprovalRules);
                }
                this.host.transcriptStickyComposerUi.schedulePersistTranscriptComposerPrefs(project, summary);
                this.closeAllComposerSheets();
                this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
            },
            onToolRulesChange: rules => {
                this.host.transcriptComposerToolApprovalRules = rules;
                if (cwd) {
                    writeStoredAgentToolApprovalRules(cwd, rules);
                }
                this.host.transcriptStickyComposerUi.schedulePersistTranscriptComposerPrefs(project, summary);
            },
            onClose: () => this.closeAllComposerSheets(),
            assignSheet: sheet => { this.host.transcriptComposerApprovalSheet = sheet; },
        });
    }

    openTranscriptComposerAgentSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        anchor?: HTMLElement,
    ): void {
        if (summary.source === 'theia-chat') {
            return;
        }
        const usePopover = this.host.stickyComposerSheetsUi.shouldUseAgentPickerPopover(anchor);
        if (usePopover
            && this.host.stickyComposerSheetsUi.isAgentPickerPopoverAnchoredTo(anchor)
            && this.host.transcriptComposerAgentSheet) {
            this.closeAllComposerSheets();
            return;
        }
        this.closeAllComposerSheets();
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const onClose = (): void => { this.closeAllComposerSheets(); };
        const chrome = this.host.stickyComposerSheetsUi.createComposerAgentPickerChrome({
            closeTitle: nls.localize('qaap/mobileProjects/closeTranscript', 'Close'),
            onClose,
            anchor,
            transcriptOverlay: true,
        });
        document.body.append(chrome.sheet);
        this.host.transcriptComposerAgentSheet = chrome.sheet;
        if (this.host.stickyComposerSheetsUi.shouldUseAgentPickerPopover(anchor)) {
            this.host.stickyComposerSheetsUi.assignAgentPickerPopover(anchor, chrome.popoverCleanup);
            this.host.stickyComposerSheetsUi.syncAgentPickerPopoverPosition(chrome.sheet);
        }
        this.host.stickyComposerAgentsUi.showComposerAgentPickerLoading(chrome);
        this.host.stickyComposerSheetsUi.syncAgentPickerPopoverPosition(chrome.sheet);
        void this.ensureTranscriptComposerAgentsLoaded(project).then(agents => {
            if (this.host.transcriptComposerAgentSheet !== chrome.sheet) {
                return;
            }
            void this.host.stickyComposerSheetsUi.renderComposerAgentPicker(chrome, {
                view: 'agents',
                cwd,
                agents,
                selectedAgentId: this.resolveTranscriptComposerPinnedAgentId(project, summary),
                includeCoder: true,
                onSelectAgent: (agentId, model) => {
                    this.host.transcriptComposerPinnedAgentId = agentId;
                    this.host.transcriptComposerPrefsConvId = summary.id;
                    if (cwd) {
                        writeStoredAgent(cwd, agentId);
                        if (model) {
                            writeStoredAgentModel(cwd, agentId, model);
                        }
                    }
                    const modes = resolveStickyComposerModes(agentId, this.host.chatAgentService);
                    this.host.transcriptComposerModeId = reconcileComposerModeId(undefined, modes, cwd);
                    if (cwd && this.host.transcriptComposerModeId) {
                        writeStoredComposerMode(cwd, this.host.transcriptComposerModeId);
                    }
                    this.host.transcriptStickyComposerUi.schedulePersistTranscriptComposerPrefs(project, summary);
                    this.closeAllComposerSheets();
                    this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
                },
            });
        });
    }

    openTranscriptComposerModeSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        modes: readonly ChatMode[],
        anchor?: HTMLElement,
    ): void {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        this.host.stickyComposerSheetsUi.openComposerModeSheet({
            modes,
            selectedModeId: this.host.transcriptComposerModeId,
            cwd,
            anchor,
            transcriptOverlay: true,
            closeTitle: nls.localize('qaap/mobileProjects/closeTranscript', 'Close'),
            onClose: () => this.closeAllComposerSheets(),
            isOpen: () => this.host.transcriptComposerModeSheet !== undefined,
            assignSheet: sheet => { this.host.transcriptComposerModeSheet = sheet; },
            onSelect: id => {
                this.host.transcriptComposerModeId = id;
                if (cwd) {
                    writeStoredComposerMode(cwd, id);
                }
                this.host.transcriptStickyComposerUi.schedulePersistTranscriptComposerPrefs(project, summary);
                this.closeAllComposerSheets();
                this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
            },
        });
    }

    closeTranscriptComposerSheets(): void {
        this.host.stickyComposerSheetsUi.teardownAgentPickerPopover();
        this.host.stickyComposerSheetsUi.teardownModeSheetPopover();
        this.host.stickyComposerSheetsUi.teardownApprovalPolicySheetPopover();
        if (this.host.transcriptComposerAgentSheet) {
            this.host.transcriptComposerAgentSheet.remove();
            this.host.transcriptComposerAgentSheet = undefined;
        }
        if (this.host.transcriptComposerQaiqModelSheet) {
            this.host.transcriptComposerQaiqModelSheet.remove();
            this.host.transcriptComposerQaiqModelSheet = undefined;
        }
        if (this.host.transcriptComposerModeSheet) {
            this.host.transcriptComposerModeSheet.remove();
            this.host.transcriptComposerModeSheet = undefined;
        }
        if (this.host.transcriptComposerApprovalSheet) {
            this.host.transcriptComposerApprovalSheet.remove();
            this.host.transcriptComposerApprovalSheet = undefined;
        }
        if (this.host.stickyComposerWorkspaceSheet) {
            this.host.stickyComposerWorkspaceUi.closeComposerWorkspaceSheet();
        }
    }

    closeAllComposerSheets(): void {
        this.host.stickyComposerSheetsUi.closeStickyComposerSheets();
        this.closeTranscriptComposerSheets();
    }
}
