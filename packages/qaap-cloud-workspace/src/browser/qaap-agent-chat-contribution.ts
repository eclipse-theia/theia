// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QaapAgentChatWidget } from './qaap-agent-chat-widget';

/** Opens the local Chat sessions surface (desktop Work Hub parity). */
export const QAAP_OPEN_AGENT_CHAT: Command = {
    id: 'qaap.agentChat.open',
    label: nls.localize('qaap/agentChat/open', 'Chat'),
};

@injectable()
export class QaapAgentChatContribution implements CommandContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(QAAP_OPEN_AGENT_CHAT, {
            execute: () => this.open(),
        });
    }

    protected async open(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(QaapAgentChatWidget.ID);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
