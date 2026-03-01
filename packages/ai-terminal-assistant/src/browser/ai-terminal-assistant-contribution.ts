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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { AiTerminalSummaryAgent } from './terminal-output-analysis-agent';
import { ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser/ai-command-handler-factory';
import { AgentService } from '@theia/ai-core';
import { AbstractViewContribution, codicon, FrontendApplicationContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { Command, CommandRegistry, MenuModelRegistry, nls } from '@theia/core';
import { TerminalMenus } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { SummaryService } from './ai-terminal-assistant-service';
import { AiTerminalAssistantViewWidget } from './ai-terminal-assistant-view-widget';

export const AI_TERMINAL_SUMMARY_TOGGLE_COMMAND_ID = 'aiTerminalSummary:toggle';

const AI_TERMINAL_SUMMARY_COMMAND = Command.toLocalizedCommand({
    id: 'ai-terminal-output-summary:toggle',
    label: nls.localize('', 'New AI Terminal Assistant'),
    iconClass: codicon('sparkle')
}, 'theia/ai/terminal/summarize');

/**
 * Contribution for the AI Terminal Assistant widget.
 * Uses AbstractViewContribution pattern for standardized widget registration and management.
 * Implements FrontendApplicationContribution for lifecycle hooks.
 */
@injectable()
export class AiTerminalAssistantContribution extends AbstractViewContribution<AiTerminalAssistantViewWidget>
    implements FrontendApplicationContribution {

    @inject(TerminalService)
    protected terminalService: TerminalService;

    @inject(AiTerminalSummaryAgent)
    protected terminalAgent: AiTerminalSummaryAgent;

    @inject(AICommandHandlerFactory)
    protected commandHandlerFactory: AICommandHandlerFactory;

    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(SummaryService)
    protected readonly summaryService: SummaryService;

    constructor() {
        super({
            widgetId: AiTerminalAssistantViewWidget.ID,
            widgetName: AiTerminalAssistantViewWidget.LABEL,
            defaultWidgetOptions: {
                area: 'bottom',
                mode: 'split-right',
                rank: 500
            },
            toggleCommandId: AI_TERMINAL_SUMMARY_TOGGLE_COMMAND_ID,
            toggleKeybinding: 'ctrlcmd+shift+t'
        });
    }

    @postConstruct()
    protected init(): void {
        this.summaryService.onAllTerminalsClosed(() => {
            const widget = this.tryGetWidget();
            if (widget) {
                this.shell.closeWidget(widget.id);
            }
        });
    }

    async initializeLayout(): Promise<void> {
        // Widget is not opened by default, user opens it via command
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction([...TerminalMenus.TERMINAL_CONTEXT_MENU, '_5'], {
            when: ENABLE_AI_CONTEXT_KEY,
            commandId: AI_TERMINAL_SUMMARY_COMMAND.id,
        });
        menus.registerMenuAction([...TerminalMenus.TERMINAL_NEW], {
            when: ENABLE_AI_CONTEXT_KEY,
            commandId: AI_TERMINAL_SUMMARY_COMMAND.id,
            order: '4'
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(AI_TERMINAL_SUMMARY_COMMAND, this.commandHandlerFactory({
            execute: async () => {
                const widget = await this.openView({ activate: true });
                widget.title.closable = true;
                widget.title.label = nls.localize('theia/ai/terminal/summaryTitle', 'AI Terminal Assistant');
            },
            isEnabled: () => this.agentService.isEnabled(this.terminalAgent.id)
        }));
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: AI_TERMINAL_SUMMARY_COMMAND.id,
            keybinding: 'ctrlcmd+e',
            when: `terminalFocus && ${ENABLE_AI_CONTEXT_KEY}`
        });
    }


}
