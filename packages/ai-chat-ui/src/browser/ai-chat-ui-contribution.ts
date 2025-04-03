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
import { CommandRegistry, isOSX, nls, QuickInputButton, QuickInputService, QuickPickItem } from '@theia/core';
import { Widget } from '@theia/core/lib/browser';
import { AI_CHAT_NEW_CHAT_WINDOW_COMMAND, AI_CHAT_NEW_WITH_MEMORY, AI_CHAT_SHOW_CHATS_COMMAND, ChatCommands } from './chat-view-commands';
import { ChatAgentLocation, ChatService } from '@theia/ai-chat';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ChatViewWidget } from './chat-view-widget';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { SecondaryWindowHandler } from '@theia/core/lib/browser/secondary-window-handler';
import { formatDistance } from 'date-fns';
import * as locales from 'date-fns/locale';
import { AI_SHOW_SETTINGS_COMMAND } from '@theia/ai-core/lib/browser';
import { OPEN_AI_HISTORY_VIEW } from '@theia/ai-history/lib/browser/ai-history-contribution';
import { SESSION_SUMMARY_VARIABLE } from '@theia/ai-chat/lib/browser/session-summary-variable-contribution';

export const AI_CHAT_TOGGLE_COMMAND_ID = 'aiChat:toggle';

@injectable()
export class AIChatContribution extends AbstractViewContribution<ChatViewWidget> implements TabBarToolbarContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;
    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    protected static readonly RENAME_CHAT_BUTTON: QuickInputButton = {
        iconClass: 'codicon-edit',
        tooltip: nls.localize('theia/ai/chat-ui/renameChat', 'Rename Chat'),
    };
    protected static readonly REMOVE_CHAT_BUTTON: QuickInputButton = {
        iconClass: 'codicon-remove-close',
        tooltip: nls.localize('theia/ai/chat-ui/removeChat', 'Remove Chat'),
    };

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    constructor() {
        super({
            widgetId: ChatViewWidget.ID,
            widgetName: ChatViewWidget.LABEL,
            defaultWidgetOptions: {
                area: 'right',
                rank: 100
            },
            toggleCommandId: AI_CHAT_TOGGLE_COMMAND_ID,
            toggleKeybinding: isOSX ? 'ctrl+cmd+i' : 'ctrl+alt+i'
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
            execute: () => this.openView().then(() => this.chatService.createSession(ChatAgentLocation.Panel, { focus: true })),
            isVisible: widget => this.withWidget(widget, () => true),
        });
        registry.registerCommand(AI_CHAT_NEW_WITH_MEMORY, {
            execute: () => {
                const activeSessions = this.chatService.getSessions().filter(candidate => candidate.isActive);
                if (activeSessions.length !== 1) {
                    return;
                }
                const activeSession = activeSessions[0];
                const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, activeSession.pinnedAgent);
                newSession.model.context.addVariables({ variable: SESSION_SUMMARY_VARIABLE, arg: activeSession.id });
            },
            isVisible: () => false
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
            tooltip: nls.localizeByDefault('New Chat'),
            isVisible: widget => this.withWidget(widget)
        });
        registry.registerItem({
            id: AI_CHAT_SHOW_CHATS_COMMAND.id,
            command: AI_CHAT_SHOW_CHATS_COMMAND.id,
            tooltip: nls.localizeByDefault('Show Chats...'),
            isVisible: widget => this.withWidget(widget),
        });
        registry.registerItem({
            id: 'chat-view.' + AI_SHOW_SETTINGS_COMMAND.id,
            command: AI_SHOW_SETTINGS_COMMAND.id,
            group: 'ai-settings',
            priority: 3,
            tooltip: nls.localize('theia/ai-chat-ui/open-settings-tooltip', 'Open AI settings...'),
            isVisible: widget => this.withWidget(widget),
        });
        registry.registerItem({
            id: 'chat-view.' + OPEN_AI_HISTORY_VIEW.id,
            command: OPEN_AI_HISTORY_VIEW.id,
            tooltip: nls.localize('theia/ai-chat-ui/open-history-tooltip', 'Open AI history...'),
            group: 'ai-settings',
            priority: 1,
            isVisible: widget => this.withWidget(widget),
        });
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
            this.chatService.getSessions()
                .filter(session => !session.isActive && session.title)
                .sort((a, b) => {
                    if (!a.lastInteraction) { return 1; }
                    if (!b.lastInteraction) { return -1; }
                    return b.lastInteraction.getTime() - a.lastInteraction.getTime();
                })
                .map(session => <QuickPickItem>({
                    label: session.title,
                    description: session.lastInteraction ? formatDistance(session.lastInteraction, new Date(), { addSuffix: false, locale: getDateFnsLocale() }) : undefined,
                    detail: session.model.getRequests().at(0)?.request.text,
                    id: session.id,
                    buttons: [AIChatContribution.RENAME_CHAT_BUTTON, AIChatContribution.REMOVE_CHAT_BUTTON]
                }));

        const defer = new Deferred<QuickPickItem | undefined>();
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.placeholder = nls.localize('theia/ai/chat-ui/selectChat', 'Select chat');
        quickPick.canSelectMany = false;
        quickPick.items = getItems();

        quickPick.onDidTriggerItemButton(async context => {
            if (context.button === AIChatContribution.RENAME_CHAT_BUTTON) {
                quickPick.hide();
                this.quickInputService.input({
                    placeHolder: nls.localize('theia/ai/chat-ui/enterChatName', 'Enter chat name')
                }).then(name => {
                    if (name && name.length > 0) {
                        const session = this.chatService.getSession(context.item.id!);
                        if (session) {
                            session.title = name;
                        }
                    }
                });
            } else if (context.button === AIChatContribution.REMOVE_CHAT_BUTTON) {
                this.chatService.deleteSession(context.item.id!);
                quickPick.items = getItems();
                if (this.chatService.getSessions().length <= 1) {
                    quickPick.hide();
                }
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

function getDateFnsLocale(): locales.Locale {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return nls.locale ? (locales as any)[nls.locale] ?? locales.enUS : locales.enUS;
}
