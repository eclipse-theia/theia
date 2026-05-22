// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Command, CommandContribution, CommandRegistry, CommandService } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ChatService } from '@theia/ai-chat/lib/common/chat-service';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';

/** Source of truth: QAAP_AGENT_TASK_API_PATH in @theia/qaap-cloud-workspace. */
const AGENT_TASK_API_PATH = '/qaap/api/agent-tasks';

/** Sends the latest chat task to the background runner so it survives the tab closing. */
export const QAAP_CHAT_RUN_IN_BACKGROUND: Command = {
    id: 'qaap.chat.runInBackground',
    label: nls.localize('qaap/chat/runInBackground', 'Run in Background'),
    iconClass: codicon('server-process'),
};

/**
 * Bridges the AI chat to the background-task runner: a toolbar button on the chat view turns
 * the last task asked of the agent into a {@link AGENT_TASK_API_PATH} job, which keeps running
 * on the VPS after the tab is closed and pushes the user when it is done.
 */
@injectable()
export class QaapChatToBackgroundContribution implements CommandContribution, TabBarToolbarContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(CommandService)
    protected readonly commands: CommandService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(QAAP_CHAT_RUN_IN_BACKGROUND, {
            isVisible: widget => widget instanceof ChatViewWidget,
            isEnabled: widget => widget instanceof ChatViewWidget,
            execute: () => this.runLatestTaskInBackground(),
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: QAAP_CHAT_RUN_IN_BACKGROUND.id,
            command: QAAP_CHAT_RUN_IN_BACKGROUND.id,
            tooltip: nls.localize('qaap/chat/runInBackgroundTooltip', 'Run this task in the background'),
            priority: 5,
        });
    }

    protected async runLatestTaskInBackground(): Promise<void> {
        const requests = this.chatService.getActiveSession()?.model.getRequests() ?? [];
        const prompt = requests[requests.length - 1]?.request.text?.trim();
        if (!prompt) {
            this.messages.warn(nls.localize('qaap/chat/noTask', 'Ask the agent a task first, then send it to the background.'));
            return;
        }
        const root = this.workspaceService.tryGetRoots()[0];
        if (!root) {
            this.messages.warn(nls.localize('qaap/chat/noProject', 'Open a project before starting a background task.'));
            return;
        }
        try {
            const cwd = await this.fileService.fsPath(root.resource);
            const response = await fetch(AGENT_TASK_API_PATH, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, cwd }),
            });
            if (!response.ok) {
                throw new Error(`request failed (${response.status})`);
            }
        } catch (error) {
            this.messages.error(nls.localize(
                'qaap/chat/backgroundFailed',
                'Could not start the background task: {0}',
                error instanceof Error ? error.message : String(error),
            ));
            return;
        }
        const open = nls.localize('qaap/chat/openJobs', 'Open Jobs');
        const choice = await this.messages.info(
            nls.localize('qaap/chat/backgroundStarted', 'Task sent to the background. It runs on the server even if you close the app.'),
            open,
        );
        if (choice === open) {
            void this.commands.executeCommand('qaap.agentTasks.open');
        }
    }
}
