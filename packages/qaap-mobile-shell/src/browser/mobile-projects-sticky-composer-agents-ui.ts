// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ChatAgent } from '@theia/ai-chat';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import {
    agentSupportsModelPicker,
    filterQaapComposerAgents,
    isTheiaCoderAgent,
    QAAP_PRIMARY_AGENT_ID,
    readStoredAgent,
    readStoredAgentModel,
    reconcileStickyComposerAgent,
    THEIA_CODER_AGENT_ID,
    type QaapAgentTaskAgentOption,
    type QaapAgentTaskListSnapshot,
    type QaapQaiqModelOption,
} from '../common/qaap-agent-task-client';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { ComposerAgentPickerChrome } from './mobile-projects-sticky-composer-sheets-ui';

export interface MobileProjectsStickyComposerAgentsHost {
stickyComposerPinnedAgentId: string | undefined;
stickyComposerBackendAgents: QaapAgentTaskAgentOption[];
stickyComposerQaiqModels: QaapQaiqModelOption[];
preparedCwdByProjectId: Map<string, string>;
projectsService: MobileProjectsService;
chatAgentService?: ChatAgentService;
activeTasks?: MobileProjectsActiveTasks;
renderStickyComposer(): void;
loadBackendAgentSnapshot(): Promise<QaapAgentTaskListSnapshot>;
resolveConversationAgentLabel(agentId: string | undefined): string;
}

export class MobileProjectsStickyComposerAgentsUi {
    constructor(protected readonly host: MobileProjectsStickyComposerAgentsHost) { }

    /**
     * The local Theia Coder agent runs in the browser tab and stops when the mobile app is closed,
     * so it is not agentic. It is no longer offered or defaulted to in the mobile agent pickers —
     * only VPS-backed agents (QAIQ, Codex, …) are selectable.
     */
    getOfferableCoderAgent(): ChatAgent | undefined {
        return undefined;
    }

    resolveStickyComposerPinnedAgentId(project: MobileProjectEntry): string {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        const pinned = this.host.stickyComposerPinnedAgentId ?? readStoredAgent(cwd);
        if (pinned && pinned !== 'task') {
            return pinned;
        }
        return this.host.stickyComposerBackendAgents[0]?.id ?? QAAP_PRIMARY_AGENT_ID;
    }
    resolveStickyComposerAgentLabel(project?: MobileProjectEntry): string {
        const pinned = this.host.stickyComposerPinnedAgentId;
        if (isTheiaCoderAgent(pinned)) {
            return this.host.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)?.name ?? 'Coder';
        }
        const fromList = this.host.stickyComposerBackendAgents.find(a => a.id === pinned)?.label;
        if (fromList) {
            return fromList;
        }
        return this.host.resolveConversationAgentLabel(undefined);
    }
    resolveStickyComposerModelLabel(agentId: string, project?: MobileProjectEntry): string | undefined {
        if (!agentSupportsModelPicker(agentId)) {
            return undefined;
        }
        const cwd = project
            ? (this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id))
            : undefined;
        return readStoredAgentModel(cwd, agentId)?.modelId;
    }
    reconcileStickyComposerPinnedAgent(
        current: string | undefined,
        agents: readonly QaapAgentTaskAgentOption[],
        defaultAgent: string | undefined,
        cwd: string | undefined,
    ): string {
        return reconcileStickyComposerAgent(
            current,
            agents,
            defaultAgent,
            cwd,
            !!this.getOfferableCoderAgent(),
        );
    }
    filterSelectableComposerAgents(
        agents: readonly QaapAgentTaskAgentOption[],
    ): QaapAgentTaskAgentOption[] {
        return filterQaapComposerAgents(agents);
    }
    async refreshStickyComposerAgents(project: MobileProjectEntry): Promise<void> {
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        try {
            const snapshot = await this.host.loadBackendAgentSnapshot();
            const filteredAgents = this.filterSelectableComposerAgents(snapshot.agents);
            this.host.stickyComposerBackendAgents = filteredAgents;
            this.host.stickyComposerQaiqModels = snapshot.qaiqModels;
            const resolved = this.reconcileStickyComposerPinnedAgent(
                this.host.stickyComposerPinnedAgentId ?? readStoredAgent(cwd),
                filteredAgents,
                snapshot.defaultAgent,
                cwd,
            );
            if (this.host.stickyComposerPinnedAgentId !== resolved) {
                this.host.stickyComposerPinnedAgentId = resolved;
                this.host.renderStickyComposer();
            }
        } catch {
            this.host.stickyComposerBackendAgents = this.filterSelectableComposerAgents(this.host.activeTasks?.getAgents() ?? []);
            this.host.stickyComposerQaiqModels = [];
        }
    }
    showComposerAgentPickerLoading(chrome: ComposerAgentPickerChrome): void {
        chrome.list.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'theia-mobile-sticky-composer-sheet-loading';
        loading.textContent = nls.localize('qaap/mobileProjects/stickyComposerLoadingAgents', 'Loading agents…');
        chrome.list.append(loading);
    }
    async ensureStickyComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]> {
        if (this.host.stickyComposerBackendAgents.length === 0) {
            await this.refreshStickyComposerAgents(project);
        }
        return this.filterSelectableComposerAgents(this.host.stickyComposerBackendAgents);
    }
}

