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

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry, QuickInputButton, QuickInputService, QuickPickItem } from '@theia/core';
import { Widget } from '@theia/core/lib/browser';
import { AI_CHAT_NEW_CHAT_WINDOW_COMMAND, AI_CHAT_SHOW_CHATS_COMMAND, ChatCommands } from './chat-view-commands';
import { ChatAgentLocation, ChatService } from '@theia/ai-chat';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ChatViewWidget } from './chat-view-widget';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { SecondaryWindowHandler } from '@theia/core/lib/browser/secondary-window-handler';

export const AI_CHAT_TOGGLE_COMMAND_ID = 'aiChat:toggle';

@injectable()
export class AIChatContribution extends AbstractViewContribution<ChatViewWidget> implements TabBarToolbarContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;
    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    protected static readonly REMOVE_CHAT_BUTTON: QuickInputButton = {
        iconClass: 'codicon-remove-close',
        tooltip: 'Remove Chat',
    };

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    constructor() {
        super({
            widgetId: ChatViewWidget.ID,
            widgetName: ChatViewWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 100
            },
            toggleCommandId: AI_CHAT_TOGGLE_COMMAND_ID,
            toggleKeybinding: 'ctrlcmd+shift+e'
        });
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(ChatCommands.SCROLL_LOCK_WIDGET, {
            isEnabled: widget => this.withWidget(widget, chatWidget => !chatWidget.isLocked),
            isVisible: widget => this.withWidget(widget, chatWidget => !chatWidget.isLocked),
            execute: widget => this.withWidget(widget, chatWidget => {
                chatWidget.lock();
                return true;
            })
        });
        registry.registerCommand(ChatCommands.SCROLL_UNLOCK_WIDGET, {
            isEnabled: widget => this.withWidget(widget, chatWidget => chatWidget.isLocked),
            isVisible: widget => this.withWidget(widget, chatWidget => chatWidget.isLocked),
            execute: widget => this.withWidget(widget, chatWidget => {
                chatWidget.unlock();
                return true;
            })
        });
        registry.registerCommand(AI_CHAT_NEW_CHAT_WINDOW_COMMAND, {
            execute: () => this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }),
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
        });
        registry.registerCommand(AI_CHAT_SHOW_CHATS_COMMAND, {
            execute: () => this.selectChat(),
            isEnabled: widget => this.withWidget(widget, () => true) && this.chatService.getSessions().length > 1,
            isVisible: widget => this.withWidget(widget, () => true)
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: AI_CHAT_NEW_CHAT_WINDOW_COMMAND.id,
            command: AI_CHAT_NEW_CHAT_WINDOW_COMMAND.id,
            tooltip: 'New Chat',
            isVisible: widget => this.isChatViewWidget(widget)
        });
        registry.registerItem({
            id: AI_CHAT_SHOW_CHATS_COMMAND.id,
            command: AI_CHAT_SHOW_CHATS_COMMAND.id,
            tooltip: 'Show Chats...',
            isVisible: widget => this.isChatViewWidget(widget),
        });
    }

    protected isChatViewWidget(widget?: Widget): boolean {
        return !!widget && ChatViewWidget.ID === widget.id;
    }

    protected async selectChat(sessionId?: string): Promise<void> {
        let activeSessionId = sessionId;

        if (!activeSessionId) {
            const item = await this.askForChatSession();
            if (item === undefined) {
                return;
            }
            activeSessionId = item.id;
        }

        this.chatService.setActiveSession(activeSessionId!, { focus: true });
    }

    protected askForChatSession(): Promise<QuickPickItem | undefined> {
        const getItems = () =>
            this.chatService.getSessions().filter(session => !session.isActive).map(session => <QuickPickItem>({
                label: session.title ?? 'New Chat',
                id: session.id,
                buttons: [AIChatContribution.REMOVE_CHAT_BUTTON]
            })).reverse();

        const defer = new Deferred<QuickPickItem | undefined>();
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.placeholder = 'Select chat';
        quickPick.canSelectMany = false;
        quickPick.items = getItems();

        quickPick.onDidTriggerItemButton(async context => {
            this.chatService.deleteSession(context.item.id!);
            quickPick.items = getItems();
            if (this.chatService.getSessions().length <= 1) {
                quickPick.hide();
            }
        });

        quickPick.onDidAccept(() => {
            const selectedItem = quickPick.selectedItems[0];
            defer.resolve(selectedItem);
            quickPick.hide();
        });

        quickPick.onDidHide(() => defer.resolve(undefined));

        quickPick.show();

        return defer.promise;
    }

    protected withWidget(
        widget: Widget | undefined = this.tryGetWidget(),
        predicate: (output: ChatViewWidget) => boolean = () => true
    ): boolean | false {
        return widget instanceof ChatViewWidget ? predicate(widget) : false;
    }

    protected extractChatView(chatView: ChatViewWidget): void {
        this.secondaryWindowHandler.moveWidgetToSecondaryWindow(chatView);
    }

    canExtractChatView(chatView: ChatViewWidget): boolean {
        return !chatView.secondaryWindow;
    }
}
