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

export interface ComposerAgentPickerChrome {
    readonly sheet: HTMLElement;
    readonly header: HTMLElement;
    readonly title: HTMLElement;
    readonly backBtn: HTMLButtonElement;
    readonly list: HTMLElement;
}

type ComposerAgentPickerView = 'agents' | 'models';

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

    filterSelectableComposerAgents(agents: readonly QaapAgentTaskAgentOption[]): QaapAgentTaskAgentOption[];
    loadBackendAgentSnapshot(): Promise<{
        agents: QaapAgentTaskAgentOption[];
        qaiqModels: QaapQaiqModelOption[];
        defaultAgent?: string;
    }>;
    reconcileStickyComposerPinnedAgent(
        pinned: string | undefined,
        agents: readonly QaapAgentTaskAgentOption[],
        defaultAgent: string | undefined,
        cwd: string | undefined,
    ): string | undefined;
    remountTranscriptStickyComposer(): void;
    schedulePersistTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void;
    resolveConversationAgentLabel(summary: QaapAgentConversationSummaryDTO | undefined): string;
    createComposerAgentPickerChrome(options: {
        readonly sheetClassName: string;
        readonly closeTitle: string;
        readonly onClose: () => void;
    }): ComposerAgentPickerChrome;
    showComposerAgentPickerLoading(chrome: ComposerAgentPickerChrome): void;
    renderComposerAgentPicker(
        chrome: ComposerAgentPickerChrome,
        options: {
            readonly view: ComposerAgentPickerView;
            readonly modelPickerAgentId?: string;
            readonly cwd: string | undefined;
            readonly agents: readonly QaapAgentTaskAgentOption[];
            readonly selectedAgentId: string | undefined;
            readonly includeCoder: boolean;
            readonly onSelectAgent: (agentId: string, model?: QaapQaiqModelOption) => void;
        },
    ): Promise<void>;
    createModeSheetOption(
        label: string,
        id: string,
        selectedId: string | undefined,
        onSelect: (id: string) => void,
    ): HTMLElement;
    openApprovalPolicySheet(options: {
        readonly agentLabel: string;
        readonly cwd: string | undefined;
        readonly selectedId: QaapAgentApprovalPolicyId;
        readonly toolRules: QaapAgentToolApprovalRules;
        readonly transcriptOverlay?: boolean;
        readonly onSelect: (policyId: QaapAgentApprovalPolicyId) => void;
        readonly onToolRulesChange?: (rules: QaapAgentToolApprovalRules) => void;
        readonly onClose: () => void;
        readonly assignSheet: (sheet: HTMLElement) => void;
    }): void;
}

/** Transcript sticky-composer agent/mode/approval sheets and backend agent list refresh. */
export class MobileProjectsTranscriptComposerUi {

    constructor(protected readonly host: MobileProjectsTranscriptComposerHost) { }

    async ensureTranscriptComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]> {
        if (this.host.transcriptComposerBackendAgents.length === 0) {
            await this.refreshTranscriptComposerAgents(project);
        }
        return this.host.filterSelectableComposerAgents(this.host.transcriptComposerBackendAgents);
    }

    resolveTranscriptComposerPinnedAgentId(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        if (summary.source === 'theia-chat') {
            return QAAP_PRIMARY_AGENT_ID;
        }
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        if (this.host.transcriptComposerPrefsConvId === summary.id && this.host.transcriptComposerPinnedAgentId) {
            return this.host.transcriptComposerPinnedAgentId;
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
        return this.host.resolveConversationAgentLabel(this.host.transcriptComposerSummary);
    }

    async refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void> {
        const cwd = this.host.projectsService.getProjectCwd(project)
            ?? this.host.transcriptComposerSummary?.cwd
            ?? this.host.preparedCwdByProjectId.get(project.id);
        try {
            const snapshot = await this.host.loadBackendAgentSnapshot();
            const filteredAgents = this.host.filterSelectableComposerAgents(snapshot.agents);
            this.host.transcriptComposerBackendAgents = filteredAgents;
            this.host.transcriptComposerQaiqModels = snapshot.qaiqModels;
            const resolved = this.host.reconcileStickyComposerPinnedAgent(
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
                    this.host.remountTranscriptStickyComposer();
                } else {
                    this.host.transcriptComposerSendRefresh?.();
                }
            }
        } catch {
            this.host.transcriptComposerBackendAgents = this.host.filterSelectableComposerAgents(this.host.activeTasks?.getAgents() ?? []);
            this.host.transcriptComposerQaiqModels = [];
        }
    }

    openTranscriptComposerApprovalPolicySheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        agentLabel: string,
    ): void {
        this.closeTranscriptComposerSheets();
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        this.host.openApprovalPolicySheet({
            agentLabel,
            cwd,
            transcriptOverlay: true,
            selectedId: reconcileAgentApprovalPolicyId(this.host.transcriptComposerApprovalPolicyId, cwd),
            toolRules: reconcileAgentToolApprovalRules(
                reconcileAgentApprovalPolicyId(this.host.transcriptComposerApprovalPolicyId, cwd),
                cwd,
                this.host.transcriptComposerToolApprovalRules,
            ),
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
                this.host.schedulePersistTranscriptComposerPrefs(project, summary);
                this.closeTranscriptComposerSheets();
                this.host.remountTranscriptStickyComposer();
            },
            onToolRulesChange: rules => {
                this.host.transcriptComposerToolApprovalRules = rules;
                if (cwd) {
                    writeStoredAgentToolApprovalRules(cwd, rules);
                }
                this.host.schedulePersistTranscriptComposerPrefs(project, summary);
            },
            onClose: () => this.closeTranscriptComposerSheets(),
            assignSheet: sheet => { this.host.transcriptComposerApprovalSheet = sheet; },
        });
    }

    openTranscriptComposerAgentSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (summary.source === 'theia-chat') {
            return;
        }
        this.closeTranscriptComposerSheets();
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const chrome = this.host.createComposerAgentPickerChrome({
            sheetClassName: 'theia-mobile-sticky-composer-sheet theia-mod-agent theia-mod-transcript-overlay',
            closeTitle: nls.localize('qaap/mobileProjects/closeTranscript', 'Close'),
            onClose: () => this.closeTranscriptComposerSheets(),
        });
        document.body.append(chrome.sheet);
        this.host.transcriptComposerAgentSheet = chrome.sheet;
        this.host.showComposerAgentPickerLoading(chrome);
        void this.ensureTranscriptComposerAgentsLoaded(project).then(agents => {
            if (this.host.transcriptComposerAgentSheet !== chrome.sheet) {
                return;
            }
            void this.host.renderComposerAgentPicker(chrome, {
                view: 'agents',
                cwd,
                agents,
                selectedAgentId: this.host.transcriptComposerPinnedAgentId,
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
                    this.host.schedulePersistTranscriptComposerPrefs(project, summary);
                    this.closeTranscriptComposerSheets();
                    this.host.remountTranscriptStickyComposer();
                },
            });
        });
    }

    openTranscriptComposerModeSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        modes: readonly ChatMode[],
    ): void {
        this.closeTranscriptComposerSheets();
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-mode theia-mod-transcript-overlay';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeTranscriptComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickMode', 'Choose mode');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeTranscriptComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        for (const mode of modes) {
            list.append(this.host.createModeSheetOption(
                mode.name,
                mode.id,
                this.host.transcriptComposerModeId,
                id => {
                    this.host.transcriptComposerModeId = id;
                    if (cwd) {
                        writeStoredComposerMode(cwd, id);
                    }
                    this.host.schedulePersistTranscriptComposerPrefs(project, summary);
                    this.closeTranscriptComposerSheets();
                    this.host.remountTranscriptStickyComposer();
                },
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.host.transcriptComposerModeSheet = sheet;
    }

    closeTranscriptComposerSheets(): void {
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
            this.host.stickyComposerWorkspaceSheet.remove();
            this.host.stickyComposerWorkspaceSheet = undefined;
        }
    }
}
