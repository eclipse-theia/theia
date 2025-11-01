// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { AiTerminalSummaryAgent } from './ai-terminal-summary-agent';
import { AICommandHandlerFactory, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { AgentService } from '@theia/ai-core';
import { ApplicationShell, codicon, KeybindingContribution, KeybindingRegistry, WidgetManager } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { TerminalMenus } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { SUMMARY_VIEW_WIDGET_ID } from '../common/summary-view-widget';

export const AI_TERMINAL_SUMMARY_TOGGLE_COMMAND_ID = 'aiTerminalSummary:toggle';

const AI_TERMINAL_SUMMARY_COMMAND = Command.toLocalizedCommand({
    id: 'ai-terminal:toggle',
    label: 'Terminal AI Summary',
    iconClass: codicon('sparkle')
}, 'theia/ai/terminal/summarize');

@injectable()
export class AiTerminalSummaryContribution implements CommandContribution, MenuContribution, KeybindingContribution {
    static SUMMARY_VIEW_WIDGET_ID = SUMMARY_VIEW_WIDGET_ID;

    @inject(TerminalService)
    protected terminalService: TerminalService;

    @inject(AiTerminalSummaryAgent)
    protected terminalAgent: AiTerminalSummaryAgent;

    @inject(AICommandHandlerFactory)
    protected commandHandlerFactory: AICommandHandlerFactory;

    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...TerminalMenus.TERMINAL_CONTEXT_MENU, '_5'], {
            when: ENABLE_AI_CONTEXT_KEY,
            commandId: AI_TERMINAL_SUMMARY_COMMAND.id,
            icon: AI_TERMINAL_SUMMARY_COMMAND.iconClass
        });
    }
    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AI_TERMINAL_SUMMARY_COMMAND, this.commandHandlerFactory({
            execute: async () => {
                const currentTerminal = this.terminalService.currentTerminal;
                if (currentTerminal instanceof TerminalWidgetImpl && currentTerminal.kind === 'user') {

                    const summaryWidget = await this.widgetManager.getOrCreateWidget(AiTerminalSummaryContribution.SUMMARY_VIEW_WIDGET_ID, {
                        terminalId: AiTerminalSummaryContribution.SUMMARY_VIEW_WIDGET_ID,
                    });
                    summaryWidget.title.closable = true;
                    summaryWidget.title.label = nls.localize('theia/ai/terminal/summaryTitle', 'AI Terminal Summary');
                    await this.shell.addWidget(summaryWidget, {
                        area: 'bottom',
                        mode: 'split-bottom'
                    });
                    this.shell.activateWidget(summaryWidget.id);
                }
            },
            isEnabled: () =>
                // Ensure it is only enabled for terminals explicitly launched by the user, not to terminals created e.g. for running tasks
                this.agentService.isEnabled(this.terminalAgent.id)
                && this.shell.currentWidget instanceof TerminalWidgetImpl
                && (this.shell.currentWidget as TerminalWidgetImpl).kind === 'user'
        }));
    }
    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: AI_TERMINAL_SUMMARY_COMMAND.id,
            keybinding: 'ctrlcmd+e',
            when: `terminalFocus && ${ENABLE_AI_CONTEXT_KEY}`
        });
    }

}
