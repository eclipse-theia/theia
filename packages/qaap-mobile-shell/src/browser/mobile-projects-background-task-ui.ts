// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { GenericCapabilitySelections } from '@theia/ai-core';
import {
    conversationToSummary,
    createConversation,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    extractBackendAgentMention,
    fetchAgentTaskListAll,
    isTheiaCoderAgent,
    isTheiaCoderMention,
    QAAP_PRIMARY_AGENT_ID,
    readStoredAgent,
    resolveBackendAgentForTurn,
    resolveStoredAgentModelForSubmit,
    writeStoredAgent,
    type QaapAgentTaskListSnapshot,
} from '../common/qaap-agent-task-client';
import { applyBackendInteractionModeToPrompt } from '../common/qaap-sticky-composer-mode';
import { reconcileAgentApprovalPolicyId } from '../common/qaap-sticky-composer-approval-policy';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { QaapBackgroundContextProvider } from './qaap-background-context-provider';
import type { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';
import { MobileSnackbar } from './mobile-snackbar';

export interface MobileProjectsBackgroundTaskHost {
    projects: MobileProjectEntry[];
    preparedCwdByProjectId: Map<string, string>;
    justAddedTaskId: string | undefined;
    agentsHubShellActive: boolean;
    projectsService: MobileProjectsService;
    conversations?: MobileProjectsConversations;
    backgroundContext?: QaapBackgroundContextProvider;
    messageService?: MessageService;
    activeTasks?: MobileProjectsActiveTasks;
    sessionsSidebar?: MobileWorkHubSessionsSidebar;
    delegate: { onProjectsChanged?: () => void };
    transcriptSheetUi: import('./mobile-projects-transcript-sheet-ui').MobileProjectsTranscriptSheetUi;
    shouldUseAgentsHubLanding(): boolean;
    renderSubtitle(): void;
    renderList(): void;
}

export class MobileProjectsBackgroundTaskUi {
    constructor(protected readonly host: MobileProjectsBackgroundTaskHost) { }

    async ensureInlineComposerCwd(project: MobileProjectEntry): Promise<string | undefined> {
        let cwd = this.host.projectsService.getProjectCwd(project);
        if (!cwd && project.github) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/preparingRepo', 'Preparing {0}…', project.name),
                { kind: 'loading' }
            );
            cwd = await this.host.projectsService.prepareProjectCwd(project);
            MobileSnackbar.dismiss();
        }
        if (!cwd) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/runTaskNoCwd', 'Open or clone this project before running a background task.'),
                { duration: 2800 }
            );
            return undefined;
        }
        this.host.preparedCwdByProjectId.set(project.id, cwd);
        return cwd;
    }
    async submitBackgroundAgentTask(
        project: MobileProjectEntry,
        draft: string,
        options: {
            openConversation?: boolean;
            forceVps?: boolean;
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            approvalPolicyId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        } = {},
    ): Promise<void> {
        const cwd = await this.ensureInlineComposerCwd(project);
        if (!cwd) {
            return;
        }
        try {
            const summary = await this.createProjectChatSession(project, cwd, draft, options);
            if (options.openConversation ?? true) {
                await this.host.transcriptSheetUi.openTranscriptSheet(project, summary);
            }
            this.applyTaskStartedToProject(cwd, draft, summary.id);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/taskStarted', 'Task started'),
                { kind: 'success', duration: 1400 }
            );
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/taskStartFailed',
                'Could not start task: {0}',
                detail
            ));
        }
    }
    async createProjectChatSession(
        project: MobileProjectEntry,
        cwd: string,
        draft: string,
        options: {
            forceVps?: boolean;
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            approvalPolicyId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        },
    ): Promise<QaapAgentConversationSummaryDTO> {
        const agent = await this.selectBackendConversationAgent(cwd, draft, options.selectedAgentId ?? QAAP_PRIMARY_AGENT_ID);
        const message = applyBackendInteractionModeToPrompt(draft, options.modeId);
        const agentModel = resolveStoredAgentModelForSubmit(agent, cwd);
        const approvalPolicyId = options.approvalPolicyId
            ?? reconcileAgentApprovalPolicyId(undefined, cwd);
        const contextPreamble = await this.host.backgroundContext?.resolve({
            text: draft,
            variables: options.variables,
        });
        const conversation = await createConversation({
            cwd,
            agent,
            title: draft,
            message,
            interactionModeId: options.modeId,
            approvalPolicyId,
            ...(contextPreamble ? { contextPreamble } : {}),
            ...(agentModel ? { agentModel, qaiqModel: agentModel } : {}),
            ...(options.autoApprove === false
                ? { autoApprove: false }
                : options.autoApprove === true
                    ? { autoApprove: true }
                    : {}),
        });
        const summary = conversationToSummary(conversation);
        this.host.conversations?.recordSnapshot(summary);
        return summary;
    }
    shouldUseTheiaCoder(content: string, selectedAgentId?: string): boolean {
        if (extractBackendAgentMention(content)) {
            return false;
        }
        return isTheiaCoderAgent(selectedAgentId) || isTheiaCoderMention(content);
    }
    async loadBackendAgentSnapshot(): Promise<QaapAgentTaskListSnapshot> {
        try {
            return await fetchAgentTaskListAll();
        } catch {
            return this.host.activeTasks
                ? { agents: this.host.activeTasks.getAgents(), defaultAgent: this.host.activeTasks.getDefaultAgent(), agentConfigured: true, qaiqModels: [] }
                : { agents: [], defaultAgent: undefined, agentConfigured: false, qaiqModels: [] };
        }
    }
    async selectBackendConversationAgent(
        cwd: string,
        prompt: string,
        selectedAgentId?: string,
        conversationAgentId?: string,
    ): Promise<string> {
        const snapshot = await this.loadBackendAgentSnapshot();
        const resolved = resolveBackendAgentForTurn(prompt, snapshot.agents, {
            explicitAgentId: selectedAgentId,
            storedAgentId: readStoredAgent(cwd),
            defaultAgentId: snapshot.defaultAgent,
            conversationAgentId,
        });
        writeStoredAgent(cwd, resolved);
        return resolved;
    }
    applyTaskStartedToProject(cwd: string, title: string, taskId: string): void {
        this.host.projects = this.host.projects.map(project => {
            const projectCwd = this.host.preparedCwdByProjectId.get(project.id)
                ?? this.host.projectsService.getProjectCwd(project);
            if (projectCwd !== cwd && !this.host.activeTasks?.findTasksForProject(project).some(task => task.id === taskId)) {
                return project;
            }
            this.host.preparedCwdByProjectId.set(project.id, cwd);
            return {
                ...project,
                status: 'working' as const,
                task: title,
                lastActive: nls.localize('qaap/mobileProjects/lastActiveNow', 'now'),
                progress: Math.max(project.progress, 0.04),
            };
        });
        this.host.justAddedTaskId = taskId;
        const preserveAgentsShell = this.host.agentsHubShellActive && this.host.shouldUseAgentsHubLanding();
        if (preserveAgentsShell) {
            this.host.renderSubtitle();
            this.host.delegate.onProjectsChanged?.();
            this.host.sessionsSidebar?.refreshList();
        } else {
            this.host.renderList();
            this.host.renderSubtitle();
            this.host.delegate.onProjectsChanged?.();
        }
        window.setTimeout(() => {
            if (this.host.justAddedTaskId === taskId) {
                this.host.justAddedTaskId = undefined;
                if (preserveAgentsShell) {
                    this.host.sessionsSidebar?.refreshList();
                } else {
                    this.host.renderList();
                }
            }
        }, 1400);
    }
}
