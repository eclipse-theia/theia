// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ChatService } from '@theia/ai-chat/lib/common';
import { AI_CHAT_TOGGLE_COMMAND_ID } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { CoderAgentId } from '@theia/ai-ide/lib/browser/coder-agent';
import { MobileProjectEntry } from '@theia/qaap-mobile-shell/lib/browser/mobile-projects-types';
import { MobileProjectsService } from '@theia/qaap-mobile-shell/lib/browser/mobile-projects-service';
import { QaapProjectBootstrapService } from '@theia/qaap-mobile-shell/lib/browser/qaap-project-bootstrap-service';

export const QAAP_HUB_RESUME_PREVIEW_COMMAND_ID = 'qaap.hub.resumePreview';
export const QAAP_HUB_OPEN_AGENT_ON_TASK_COMMAND_ID = 'qaap.hub.openAgentOnTask';

const QAAP_HUB_PENDING_ACTION_KEY = 'qaap.hub.pendingAction';

type QaapHubPendingActionKind = 'resumePreview' | 'openAgentOnTask';

interface QaapHubPendingAction {
    readonly kind: QaapHubPendingActionKind;
    readonly targetKey?: string;
    readonly previewUrl?: string;
    readonly task?: string;
}

export namespace QaapHubCommands {
    export const RESUME_PREVIEW: Command = {
        id: QAAP_HUB_RESUME_PREVIEW_COMMAND_ID,
        label: nls.localize('qaap/hub/resumePreview', 'Resume preview'),
    };
    export const OPEN_AGENT_ON_TASK: Command = {
        id: QAAP_HUB_OPEN_AGENT_ON_TASK_COMMAND_ID,
        label: nls.localize('qaap/hub/openAgent', 'Open agent on task'),
    };
}

@injectable()
export class QaapHubActionsContribution implements CommandContribution, FrontendApplicationContribution {

    @inject(MobileProjectsService)
    protected readonly projects: MobileProjectsService;

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(QaapHubCommands.RESUME_PREVIEW, {
            execute: (project?: MobileProjectEntry) => this.resumePreview(project),
            isEnabled: () => true,
        });
        registry.registerCommand(QaapHubCommands.OPEN_AGENT_ON_TASK, {
            execute: (project?: MobileProjectEntry) => this.openAgentOnTask(project),
            isEnabled: () => true,
        });
    }

    onDidInitializeLayout(): void {
        void this.resumePendingAction();
    }

    protected async resumePreview(project?: MobileProjectEntry): Promise<void> {
        if (!this.ensureProjectReady('resumePreview', project)) {
            return;
        }
        await this.doResumePreview(project?.previewUrl);
    }

    protected async doResumePreview(previewUrl?: string): Promise<void> {
        if (previewUrl) {
            try {
                await this.commands.executeCommand('mini-browser.openUrl', previewUrl);
                return;
            } catch {
                /* fall through to bootstrap */
            }
        }
        await this.bootstrap.runDevServer();
    }

    protected async openAgentOnTask(project?: MobileProjectEntry): Promise<void> {
        if (!this.ensureProjectReady('openAgentOnTask', project)) {
            return;
        }
        await this.doOpenAgentOnTask(project?.task?.trim());
    }

    protected ensureProjectReady(kind: QaapHubPendingActionKind, project?: MobileProjectEntry): boolean {
        if (!project || this.projects.projectMatchesCurrentWorkspace(project)) {
            return true;
        }
        const targetKey = this.projects.getProjectWorkspaceMatchKey(project);
        if (targetKey) {
            this.writePendingAction({
                kind,
                targetKey,
                previewUrl: project.previewUrl,
                task: project.task?.trim(),
            });
            this.projects.openInCurrentWindow(project);
            return false;
        }
        return true;
    }

    protected async resumePendingAction(): Promise<void> {
        const pending = this.readPendingAction();
        if (!pending) {
            return;
        }
        const currentKey = this.projects.getCurrentWorkspaceMatchKey();
        if (pending.targetKey && pending.targetKey !== currentKey) {
            this.clearPendingAction();
            return;
        }
        this.clearPendingAction();
        if (pending.kind === 'resumePreview') {
            await this.doResumePreview(pending.previewUrl);
            return;
        }
        await this.doOpenAgentOnTask(pending.task);
    }

    protected readPendingAction(): QaapHubPendingAction | undefined {
        if (typeof sessionStorage === 'undefined') {
            return undefined;
        }
        try {
            const raw = sessionStorage.getItem(QAAP_HUB_PENDING_ACTION_KEY);
            if (!raw) {
                return undefined;
            }
            const parsed = JSON.parse(raw) as Partial<QaapHubPendingAction>;
            if (parsed.kind !== 'resumePreview' && parsed.kind !== 'openAgentOnTask') {
                return undefined;
            }
            return parsed as QaapHubPendingAction;
        } catch {
            return undefined;
        }
    }

    protected writePendingAction(action: QaapHubPendingAction): void {
        if (typeof sessionStorage === 'undefined') {
            return;
        }
        sessionStorage.setItem(QAAP_HUB_PENDING_ACTION_KEY, JSON.stringify(action));
    }

    protected clearPendingAction(): void {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(QAAP_HUB_PENDING_ACTION_KEY);
        }
    }

    protected async doOpenAgentOnTask(task: string | undefined): Promise<void> {
        try {
            await this.commands.executeCommand(AI_CHAT_TOGGLE_COMMAND_ID);
        } catch {
            /* chat may already be visible */
        }
        let session = this.chatService.getActiveSession();
        if (!session) {
            session = this.chatService.createSession();
            this.chatService.setActiveSession(session.id);
        }
        const prompt = task && task !== '—'
            ? `@${CoderAgentId} Continue this task for the current workspace:\n\n${task}`
            : `@${CoderAgentId} Help me continue work on this project.`;
        await this.chatService.sendRequest(session.id, { text: prompt });
        void this.projects.recordProjectSession({
            lastTask: task,
            agentState: 'working',
        });
    }
}
