// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { ChatService } from '@theia/ai-chat/lib/common';
import { AI_CHAT_TOGGLE_COMMAND_ID } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { CoderAgentId } from '@theia/ai-ide/lib/browser/coder-agent';
import { MobileProjectEntry } from '@theia/qaap-mobile-shell/lib/browser/mobile-projects-types';
import { MobileProjectsService } from '@theia/qaap-mobile-shell/lib/browser/mobile-projects-service';
import { QaapProjectBootstrapService } from '@theia/qaap-mobile-shell/lib/browser/qaap-project-bootstrap-service';

export const QAAP_HUB_RESUME_PREVIEW_COMMAND_ID = 'qaap.hub.resumePreview';
export const QAAP_HUB_OPEN_AGENT_ON_TASK_COMMAND_ID = 'qaap.hub.openAgentOnTask';

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
export class QaapHubActionsContribution implements CommandContribution {

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

    protected async resumePreview(project?: MobileProjectEntry): Promise<void> {
        if (project && !project.isCurrent) {
            this.projects.openInCurrentWindow(project);
        }
        const url = project?.previewUrl;
        if (url) {
            try {
                await this.commands.executeCommand('mini-browser.openUrl', url);
                return;
            } catch {
                /* fall through to bootstrap */
            }
        }
        await this.bootstrap.runDevServer();
    }

    protected async openAgentOnTask(project?: MobileProjectEntry): Promise<void> {
        if (project && !project.isCurrent) {
            this.projects.openInCurrentWindow(project);
        }
        const task = project?.task?.trim();
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
