// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QaapAgentTasksWidget } from './qaap-agent-tasks-widget';

/** Opens the background-tasks surface (launch + monitor VPS tasks). */
export const QAAP_OPEN_AGENT_TASKS: Command = {
    id: 'qaap.agentTasks.open',
    label: nls.localize('qaap/agentTasks/open', 'Background Tasks'),
};

@injectable()
export class QaapAgentTasksContribution implements CommandContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(QAAP_OPEN_AGENT_TASKS, {
            execute: () => this.open(),
        });
    }

    protected async open(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(QaapAgentTasksWidget.ID);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
