// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core';
import { ApplicationShell, codicon, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalMenus } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { AiTerminalAgent } from './ai-terminal-agent';
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser/ai-command-handler-factory';
import { AgentService } from '@theia/ai-core';
import { nls } from '@theia/core/lib/common/nls';

const AI_TERMINAL_COMMAND = Command.toLocalizedCommand({
    id: 'ai-terminal:open',
    label: 'Ask AI',
    iconClass: codicon('sparkle')
}, 'theia/ai/terminal/askAi');

@injectable()
export class AiTerminalCommandContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(TerminalService)
    protected terminalService: TerminalService;

    @inject(AiTerminalAgent)
    protected terminalAgent: AiTerminalAgent;

    @inject(AICommandHandlerFactory)
    protected commandHandlerFactory: AICommandHandlerFactory;

    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: AI_TERMINAL_COMMAND.id,
            keybinding: 'ctrlcmd+i',
            when: `terminalFocus && ${ENABLE_AI_CONTEXT_KEY}`
        });
    }
    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...TerminalMenus.TERMINAL_CONTEXT_MENU, '_5'], {
            when: ENABLE_AI_CONTEXT_KEY,
            commandId: AI_TERMINAL_COMMAND.id,
            icon: AI_TERMINAL_COMMAND.iconClass
        });
    }
    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AI_TERMINAL_COMMAND, this.commandHandlerFactory({
            execute: () => {
                const currentTerminal = this.terminalService.currentTerminal;
                if (currentTerminal instanceof TerminalWidgetImpl && currentTerminal.kind === 'user') {
                    new AiTerminalChatWidget(
                        currentTerminal,
                        this.terminalAgent
                    );
                }
            },
            isEnabled: () =>
                // Ensure it is only enabled for terminals explicitly launched by the user, not to terminals created e.g. for running tasks
                this.agentService.isEnabled(this.terminalAgent.id)
                && this.shell.currentWidget instanceof TerminalWidgetImpl
                && (this.shell.currentWidget as TerminalWidgetImpl).kind === 'user'
        }));
    }
}

class AiTerminalChatWidget {

    protected chatContainer: HTMLDivElement;
    protected chatInput: HTMLTextAreaElement;
    protected chatResultParagraph: HTMLParagraphElement;
    protected chatInputContainer: HTMLDivElement;

    protected haveResult = false;
    commands: string[];

    constructor(
        protected terminalWidget: TerminalWidgetImpl,
        protected terminalAgent: AiTerminalAgent
    ) {
        this.chatContainer = document.createElement('div');
        this.chatContainer.className = 'ai-terminal-chat-container';

        const chatCloseButton = document.createElement('span');
        chatCloseButton.className = 'closeButton codicon codicon-close';
        chatCloseButton.onclick = () => this.dispose();
        this.chatContainer.appendChild(chatCloseButton);

        const chatResultContainer = document.createElement('div');
        chatResultContainer.className = 'ai-terminal-chat-result';
        this.chatResultParagraph = document.createElement('p');
        this.chatResultParagraph.textContent = nls.localize('theia/ai/terminal/howCanIHelp', 'How can I help you?');
        chatResultContainer.appendChild(this.chatResultParagraph);
        this.chatContainer.appendChild(chatResultContainer);

        this.chatInputContainer = document.createElement('div');
        this.chatInputContainer.className = 'ai-terminal-chat-input-container';

        this.chatInput = document.createElement('textarea');
        this.chatInput.className = 'theia-input theia-ChatInput';
        this.chatInput.placeholder = nls.localize('theia/ai/terminal/askTerminalCommand', 'Ask about a terminal command...');
        this.chatInput.onkeydown = event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!this.haveResult) {
                    this.send();
                } else {
                    this.terminalWidget.sendText(this.chatResultParagraph.innerText);
                    this.dispose();
                }
            } else if (event.key === 'Escape') {
                this.dispose();
            } else if (event.key === 'ArrowUp' && this.haveResult) {
                this.updateChatResult(this.getNextCommandIndex(1));
            } else if (event.key === 'ArrowDown' && this.haveResult) {
                this.updateChatResult(this.getNextCommandIndex(-1));
            }
        };
        this.chatInputContainer.appendChild(this.chatInput);

        const chatInputOptionsContainer = document.createElement('div');
        const chatInputOptionsSpan = document.createElement('span');
        chatInputOptionsSpan.className = 'codicon codicon-send option';
        chatInputOptionsSpan.title = nls.localizeByDefault('Send');
        chatInputOptionsSpan.onclick = () => this.send();
        chatInputOptionsContainer.appendChild(chatInputOptionsSpan);
        this.chatInputContainer.appendChild(chatInputOptionsContainer);

        this.chatContainer.appendChild(this.chatInputContainer);

        terminalWidget.node.appendChild(this.chatContainer);

        this.chatInput.focus();
    }

    protected async send(): Promise<void> {
        const userRequest = this.chatInput.value;
        if (userRequest) {
            this.chatInput.value = '';

            this.chatResultParagraph.innerText = nls.localize('theia/ai/terminal/loading', 'Loading');
            this.chatResultParagraph.className = 'loading';

            const cwd = (await this.terminalWidget.cwd).toString();
            const processInfo = await this.terminalWidget.processInfo;
            const shell = processInfo.executable;
            const recentTerminalContents = this.getRecentTerminalCommands();

            this.commands = await this.terminalAgent.getCommands(userRequest, cwd, shell, recentTerminalContents);

            if (this.commands.length > 0) {
                this.chatResultParagraph.className = 'command';
                this.chatResultParagraph.innerText = this.commands[0];
                this.chatInput.placeholder = nls.localize('theia/ai/terminal/hitEnterConfirm', 'Hit enter to confirm');
                if (this.commands.length > 1) {
                    this.chatInput.placeholder += nls.localize('theia/ai/terminal/useArrowsAlternatives', ' or use ⇅ to show alternatives...');
                }
                this.haveResult = true;
            } else {
                this.chatResultParagraph.className = '';
                this.chatResultParagraph.innerText = nls.localizeByDefault('No results');
                this.chatInput.placeholder = nls.localize('theia/ai/terminal/tryAgain', 'Try again...');
            }
        }
    }

    protected getRecentTerminalCommands(): string[] {
        const maxLines = 100;
        return this.terminalWidget.buffer.getLines(0,
            this.terminalWidget.buffer.length > maxLines ? maxLines : this.terminalWidget.buffer.length
        );
    }

    protected getNextCommandIndex(step: number): number {
        const currentIndex = this.commands.indexOf(this.chatResultParagraph.innerText);
        const nextIndex = (currentIndex + step + this.commands.length) % this.commands.length;
        return nextIndex;
    }

    protected updateChatResult(index: number): void {
        this.chatResultParagraph.innerText = this.commands[index];
    }

    protected dispose(): void {
        this.chatInput.value = '';
        this.terminalWidget.node.removeChild(this.chatContainer);
        this.terminalWidget.getTerminal().focus();
    }
}
