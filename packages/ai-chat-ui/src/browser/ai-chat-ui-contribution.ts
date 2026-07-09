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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import {
    CommandRegistry, Disposable, Emitter, Event, isOSX, MessageService, nls, PreferenceService,
    QuickInputButton, QuickInputService, QuickPickItem, QuickPickSeparator
} from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import { ConfirmDialog, FrontendApplicationContribution, KeybindingRegistry, Widget } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import {
    AI_CHAT_HOME,
    AI_CHAT_SHOW_CHATS_COMMAND,
    ChatCommands
} from './chat-view-commands';
import { ChatAgent, ChatAgentLocation, ChatService, ChatSessionMetadata, isActiveSessionChangedEvent } from '@theia/ai-chat';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ChatViewWidget } from './chat-view-widget';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { SecondaryWindowHandler } from '@theia/core/lib/browser/secondary-window-handler';
import { formatTimeAgo } from './chat-date-utils';
import { AI_SHOW_SETTINGS_COMMAND, AIActivationService, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { ChatNodeToolbarCommands } from './chat-node-toolbar-action-contribution';
import { isEditableRequestNode, isResponseNode, type EditableRequestNode, type ResponseNode } from './chat-tree-view';
import { TASK_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/browser/task-context-variable';
import { TaskContextService } from '@theia/ai-chat/lib/browser/task-context-service';
import { SESSION_STORAGE_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';

export const AI_CHAT_TOGGLE_COMMAND_ID = 'aiChat:toggle';

@injectable()
export class AIChatContribution extends AbstractViewContribution<ChatViewWidget>
    implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;
    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;
    @inject(TaskContextService)
    protected readonly taskContextService: TaskContextService;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;
    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    /**
     * Context key set to true while the chat view widget is the active widget in the shell.
     * Broader than `chatInputFocus`/`chatResponseFocus` (which require DOM focus on a specific
     * sub-widget): clicks on non-focusable parts of the chat view still flip this key, so chat
     * view keybindings remain available.
     */
    protected chatViewActiveKey: ContextKey<boolean>;
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;
    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;
    @inject(ILogger) @named('ai-chat-ui:AIChatContribution')
    protected readonly logger: ILogger;
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    /**
     * Store whether there are persisted sessions to make this information available in
     * command enablement checks which are synchronous.
     */
    protected hasPersistedSessions = false;

    /**
     * Tracks whether the currently active session is empty (= the home / overview is shown).
     * Used to hide toolbar items that only make sense within an open chat (Home,
     * lock/unlock auto-scroll, Summarize Current Session, ...).
     */
    protected activeSessionEmpty = true;
    /** Model listener for the active session; disposed and re-bound on active-session changes. */
    protected activeSessionModelListener: Disposable | undefined;
    protected readonly onActiveSessionEmptyChangedEmitter = new Emitter<void>();
    /** Fires when {@link isActiveSessionEmpty} flips. Consumed by toolbar items that hide on the overview. */
    readonly onActiveSessionEmptyChanged: Event<void> = this.onActiveSessionEmptyChangedEmitter.event;

    /** True when the chat view currently displays the home/overview (the active session has no requests). */
    get isActiveSessionEmpty(): boolean {
        return this.activeSessionEmpty;
    }

    protected static readonly RENAME_CHAT_BUTTON: QuickInputButton = {
        iconClass: 'codicon-edit',
        tooltip: nls.localizeByDefault('Rename Chat'),
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

    @postConstruct()
    initialize(): void {
        this.chatService.onSessionEvent(event => {
            if (!isActiveSessionChangedEvent(event)) {
                return;
            }
            if (event.focus) {
                this.openView({ activate: true });
            }
            this.attachToActiveSession();
        });

        // Re-check persisted sessions when storage preferences change
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === SESSION_STORAGE_PREF) {
                this.checkPersistedSessions();
            }
        });

        this.checkPersistedSessions();
        this.attachToActiveSession();

        this.chatViewActiveKey = this.contextKeyService.createKey<boolean>('chatViewActive', false);
        this.updateChatViewActiveKey();
        this.shell.onDidChangeActiveWidget(() => this.updateChatViewActiveKey());
        this.shell.onDidChangeCurrentWidget(() => this.updateChatViewActiveKey());
    }

    protected updateChatViewActiveKey(): void {
        const active = this.shell.activeWidget instanceof ChatViewWidget
            || this.shell.currentWidget instanceof ChatViewWidget;
        this.chatViewActiveKey.set(active);
    }

    /**
     * (Re-)attach a model listener to the currently active session so the Home
     * toolbar item can react when the user submits the first message and the welcome view
     * is replaced by the chat tree.
     */
    protected attachToActiveSession(): void {
        this.activeSessionModelListener?.dispose();
        this.activeSessionModelListener = undefined;
        const session = this.chatService.getActiveSession();
        if (!session) {
            this.setActiveSessionEmpty(true);
            return;
        }
        this.setActiveSessionEmpty(session.model.isEmpty());
        this.activeSessionModelListener = session.model.onDidChange(() => {
            this.setActiveSessionEmpty(session.model.isEmpty());
        });
    }

    protected setActiveSessionEmpty(empty: boolean): void {
        if (this.activeSessionEmpty !== empty) {
            this.activeSessionEmpty = empty;
            this.onActiveSessionEmptyChangedEmitter.fire();
        }
    }

    async initializeLayout(): Promise<void> {
        try {
            await this.openView({ activate: false });
        } catch (error) {
            console.error('Failed to initialize AI Chat view in default layout', error);
        }
    }

    protected async checkPersistedSessions(): Promise<void> {
        try {
            this.hasPersistedSessions = await this.chatService.hasPersistedSessions();
        } catch (e) {
            this.logger.error('Failed to check persisted AI sessions', e);
            this.hasPersistedSessions = false;
        }
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(ChatCommands.SCROLL_LOCK_WIDGET, {
            isEnabled: widget => this.withWidget(widget, chatWidget => !chatWidget.isLocked) && !this.activeSessionEmpty,
            isVisible: widget => this.withWidget(widget, chatWidget => !chatWidget.isLocked) && !this.activeSessionEmpty,
            execute: widget => this.withWidget(widget, chatWidget => {
                chatWidget.lock();
                return true;
            })
        });
        registry.registerCommand(ChatCommands.SCROLL_UNLOCK_WIDGET, {
            isEnabled: widget => this.withWidget(widget, chatWidget => chatWidget.isLocked) && !this.activeSessionEmpty,
            isVisible: widget => this.withWidget(widget, chatWidget => chatWidget.isLocked) && !this.activeSessionEmpty,
            execute: widget => this.withWidget(widget, chatWidget => {
                chatWidget.unlock();
                return true;
            })
        });
        registry.registerCommand(AI_CHAT_HOME, {
            execute: async () => {
                await this.openView();
                const activeSession = this.chatService.getActiveSession();
                // If the active session is already empty we are on the overview: just focus it
                // instead of spawning another redundant empty session.
                if (activeSession?.model.isEmpty()) {
                    this.chatService.setActiveSession(activeSession.id, { focus: true });
                } else {
                    this.chatService.createSession(ChatAgentLocation.Panel, { focus: true });
                }
            },
            isVisible: widget => this.activationService.isActive,
            isEnabled: widget => this.activationService.canRun,
        });
        registry.registerCommand(ChatCommands.AI_CHAT_NEW_WITH_TASK_CONTEXT, {
            execute: async () => {
                const activeSession = this.chatService.getActiveSession();
                const id = await this.summarizeActiveSession();
                if (!id || !activeSession) { return; }
                const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, activeSession.pinnedAgent);
                const summaryVariable = { variable: TASK_CONTEXT_VARIABLE, arg: id };
                newSession.model.context.addVariables(summaryVariable);
            },
            isVisible: () => false
        });
        registry.registerCommand(ChatCommands.AI_CHAT_SUMMARIZE_CURRENT_SESSION, {
            execute: async () => this.summarizeActiveSession(),
            isVisible: widget => {
                if (!this.activationService.isActive) { return false; }
                if (widget && !this.withWidget(widget)) { return false; }
                const activeSession = this.chatService.getActiveSession();
                return activeSession?.model.location === ChatAgentLocation.Panel
                    && !activeSession.model.isEmpty()
                    && !this.taskContextService.hasSummary(activeSession);
            },
            isEnabled: widget => {
                if (!this.activationService.canRun) { return false; }
                if (widget && !this.withWidget(widget)) { return false; }
                const activeSession = this.chatService.getActiveSession();
                return activeSession?.model.location === ChatAgentLocation.Panel
                    && !activeSession.model.isEmpty()
                    && !this.taskContextService.hasSummary(activeSession);
            }
        });
        registry.registerCommand(ChatCommands.AI_CHAT_OPEN_SUMMARY_FOR_CURRENT_SESSION, {
            execute: async () => {
                const id = await this.summarizeActiveSession();
                if (!id) { return; }
                await this.taskContextService.open(id);
            },
            isVisible: widget => {
                if (!this.activationService.isActive) { return false; }
                if (widget && !this.withWidget(widget)) { return false; }
                const activeSession = this.chatService.getActiveSession();
                return !!activeSession && this.taskContextService.hasSummary(activeSession);
            },
            isEnabled: widget => {
                if (!this.activationService.canRun) { return false; }
                return this.withWidget(widget, () => true);
            }
        });
        registry.registerCommand(ChatCommands.AI_CHAT_INITIATE_SESSION_WITH_TASK_CONTEXT, {
            execute: async () => {
                const selectedContextId = await this.selectTaskContextWithMarking();
                if (!selectedContextId) { return; }
                const selectedAgent = await this.selectAgent('Coder');
                if (!selectedAgent) { return; }
                const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, selectedAgent);
                newSession.model.context.addVariables({ variable: TASK_CONTEXT_VARIABLE, arg: selectedContextId });
            },
            isVisible: () => this.activationService.isActive,
            isEnabled: () => this.activationService.canRun
        });
        registry.registerCommand(AI_CHAT_SHOW_CHATS_COMMAND, {
            execute: async () => {
                await this.openView();
                return this.selectChat();
            },
            isEnabled: () => {
                if (!this.activationService.canRun) {
                    return false;
                }
                // Enable if there are active sessions with titles OR persisted sessions
                return this.chatService.getSessions().some(session => !!session.title) || this.hasPersistedSessions;
            },
            isVisible: () => this.activationService.isActive
        });
        registry.registerCommand(ChatCommands.AI_CHAT_RENAME_SESSION, {
            execute: (session: ChatSessionMetadata | string) => this.renameSession(typeof session === 'string' ? session : session.sessionId),
            isVisible: () => this.activationService.isActive,
            isEnabled: () => this.activationService.canRun
        });
        registry.registerCommand(ChatCommands.AI_CHAT_DELETE_SESSION, {
            execute: (session: ChatSessionMetadata | string, confirm?: boolean) =>
                this.deleteSession(typeof session === 'string' ? session : session.sessionId, typeof session === 'string' ? confirm : true),
            isVisible: () => this.activationService.isActive,
            isEnabled: () => this.activationService.canRun
        });
        registry.registerCommand(ChatNodeToolbarCommands.EDIT, {
            isEnabled: node => isEditableRequestNode(node) && !node.request.isEditing,
            isVisible: node => isEditableRequestNode(node) && !node.request.isEditing,
            execute: (node: EditableRequestNode) => {
                node.request.enableEdit();
            }
        });
        registry.registerCommand(ChatNodeToolbarCommands.CANCEL, {
            isEnabled: node => isEditableRequestNode(node) && node.request.isEditing,
            isVisible: node => isEditableRequestNode(node) && node.request.isEditing,
            execute: (node: EditableRequestNode) => {
                node.request.cancelEdit();
            }
        });
        registry.registerCommand(ChatNodeToolbarCommands.RETRY, {
            isEnabled: node => isResponseNode(node) && (node.response.isError || node.response.isCanceled),
            isVisible: node => isResponseNode(node) && (node.response.isError || node.response.isCanceled),
            execute: async (node: ResponseNode) => {
                try {
                    // Get the session for this response node
                    const session = this.chatService.getActiveSession();
                    if (!session) {
                        this.messageService.error(nls.localize('theia/ai/chat-ui/sessionNotFoundForRetry', 'Session not found for retry'));
                        return;
                    }

                    // Find the request associated with this response
                    const request = session.model.getRequests().find(req => req.response.id === node.response.id);
                    if (!request) {
                        this.messageService.error(nls.localize('theia/ai/chat-ui/requestNotFoundForRetry', 'Request not found for retry'));
                        return;
                    }

                    // Send the same request again using the chat service
                    await this.chatService.sendRequest(node.sessionId, request.request);
                } catch (error) {
                    this.logger.error('Failed to retry chat message:', error);
                    this.messageService.error(nls.localize('theia/ai/chat-ui/failedToRetry', 'Failed to retry message'));
                }
            }
        });
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        // Scoped to chat view active so we don't shadow global bindings (e.g. ctrl+shift+l =
        // "Select All Occurrences" in editors). We use chatViewActive in addition to the more
        // specific input/response focus keys so clicks on non-focusable parts of the chat view
        // (e.g. plain markdown text in a response) don't silently disable the keybindings.
        // Avoid plain Ctrl+L: Monaco binds it to "Expand Line Selection" inside the chat input
        // (a Monaco editor) and wins when the input has focus.
        const chatScope = '(chatInputFocus || chatResponseFocus || chatViewActive)';
        keybindings.registerKeybinding({
            command: AI_CHAT_HOME.id,
            keybinding: 'ctrlcmd+shift+l',
            when: chatScope
        });
        keybindings.registerKeybinding({
            command: AI_CHAT_SHOW_CHATS_COMMAND.id,
            keybinding: 'ctrlcmd+alt+l',
            when: chatScope
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        // No explicit `tooltip`: the toolbar framework falls back to the command label and appends
        // the command's keybinding accelerator itself (see RenderedToolbarItemImpl.renderItem).
        registry.registerItem({
            id: AI_CHAT_HOME.id,
            command: AI_CHAT_HOME.id,
            onDidChange: this.onActiveSessionEmptyChangedEmitter.event,
            // Hide on the overview itself (the active session is empty); only show when there
            // is an actual chat to return from.
            isVisible: widget => this.activationService.isActive && this.withWidget(widget) && !this.activeSessionEmpty,
            when: ENABLE_AI_CONTEXT_KEY
        });
        registry.registerItem({
            id: AI_CHAT_SHOW_CHATS_COMMAND.id,
            command: AI_CHAT_SHOW_CHATS_COMMAND.id,
            isVisible: widget => this.activationService.isActive && this.withWidget(widget),
            when: ENABLE_AI_CONTEXT_KEY
        });
        registry.registerItem({
            id: 'chat-view.' + AI_SHOW_SETTINGS_COMMAND.id,
            command: AI_SHOW_SETTINGS_COMMAND.id,
            group: 'ai-settings',
            priority: 3,
            tooltip: nls.localize('theia/ai-chat-ui/open-settings-tooltip', 'Open AI Settings'),
            isVisible: widget => this.activationService.isActive && this.withWidget(widget),
            when: ENABLE_AI_CONTEXT_KEY
        });
        const sessionSummarizibilityChangedEmitter = new Emitter<void>();
        this.taskContextService.onDidChange(() => sessionSummarizibilityChangedEmitter.fire());
        this.chatService.onSessionEvent(event => event.type === 'activeChange' && sessionSummarizibilityChangedEmitter.fire());
        this.activationService.onDidChangeActiveStatus(() => sessionSummarizibilityChangedEmitter.fire());
        this.activationService.onDidChangeCanRun(() => sessionSummarizibilityChangedEmitter.fire());
        this.onActiveSessionEmptyChanged(() => sessionSummarizibilityChangedEmitter.fire());
        registry.registerItem({
            id: 'chat-view.' + ChatCommands.AI_CHAT_SUMMARIZE_CURRENT_SESSION.id,
            command: ChatCommands.AI_CHAT_SUMMARIZE_CURRENT_SESSION.id,
            onDidChange: sessionSummarizibilityChangedEmitter.event,
            when: ENABLE_AI_CONTEXT_KEY
        });
        registry.registerItem({
            id: 'chat-view.' + ChatCommands.AI_CHAT_OPEN_SUMMARY_FOR_CURRENT_SESSION.id,
            command: ChatCommands.AI_CHAT_OPEN_SUMMARY_FOR_CURRENT_SESSION.id,
            onDidChange: sessionSummarizibilityChangedEmitter.event,
            when: ENABLE_AI_CONTEXT_KEY
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

    protected async askForChatSession(): Promise<QuickPickItem | undefined> {
        const getItems = async (): Promise<(QuickPickItem | QuickPickSeparator)[]> => {
            const activeSessions = this.chatService.getSessions()
                .filter(session => session.title && !session.rootSessionId)
                .map(session => ({
                    isActive: true as const,
                    id: session.id,
                    title: session.title!,
                    lastDate: session.lastInteraction ? session.lastInteraction.getTime() : 0,
                    firstRequestText: session.model.getRequests().at(0)?.request.text,
                    agentIconClass: session.pinnedAgent?.iconClass,
                    agentName: session.pinnedAgent?.name
                }))
                .sort((a, b) => b.lastDate - a.lastDate);

            // Try to load persisted sessions, but don't fail if it doesn't work
            interface PersistedSessionPickItem {
                isActive: false;
                id: string;
                title: string;
                lastDate: number;
                firstRequestText: undefined;
                agentIconClass: string | undefined;
                agentName: string | undefined;
            }
            let persistedSessions: PersistedSessionPickItem[] = [];
            try {
                const persistedIndex = await this.chatService.getPersistedSessions();
                const activeIds = new Set(activeSessions.map(s => s.id));
                persistedSessions = Object.values(persistedIndex)
                    .filter(metadata => !activeIds.has(metadata.sessionId) && !metadata.rootSessionId)
                    .map(metadata => {
                        const agent = metadata.pinnedAgentId ? this.chatAgentService.getAgent(metadata.pinnedAgentId) : undefined;
                        return {
                            isActive: false as const,
                            id: metadata.sessionId,
                            title: metadata.title,
                            lastDate: metadata.saveDate,
                            firstRequestText: undefined,
                            agentIconClass: agent?.iconClass,
                            agentName: agent?.name
                        };
                    })
                    .sort((a, b) => b.lastDate - a.lastDate);
            } catch (error) {
                this.logger.error('Failed to load persisted sessions, showing only active sessions', error);
                // Continue with just active sessions
            }

            interface SessionPickItem {
                isActive: boolean;
                id: string;
                title: string;
                lastDate: number;
                firstRequestText: string | undefined;
                agentIconClass: string | undefined;
                agentName: string | undefined;
            }
            const toItem = (session: SessionPickItem): QuickPickItem => {
                // Mark restored sessions with an archive icon; active sessions get the pinned agent's icon
                // to match the home view. QuickPick labels support inline codicons via `$(name)`, so we
                // extract the codicon name from the agent's iconClass (e.g. "codicon codicon-foo" -> "foo").
                let icon: string;
                if (session.isActive) {
                    const codiconName = session.agentIconClass?.match(/codicon-([\w-]+)/)?.[1] ?? 'comment-discussion';
                    icon = `$(${codiconName}) `;
                } else {
                    icon = '$(archive) ';
                }
                const label = `${icon}${session.title}`;
                // Mirror the home-view item subtitle: "@Agent · time ago"
                const timeAgo = formatTimeAgo(session.lastDate);
                const description = session.agentName ? `@${session.agentName} · ${timeAgo}` : timeAgo;
                return {
                    label,
                    description,
                    detail: session.firstRequestText || (session.isActive ? undefined : nls.localize('theia/ai/chat-ui/persistedSession', 'Persisted session (click to restore)')),
                    id: session.id,
                    buttons: [AIChatContribution.RENAME_CHAT_BUTTON, AIChatContribution.REMOVE_CHAT_BUTTON]
                };
            };

            const items: (QuickPickItem | QuickPickSeparator)[] = [];
            if (activeSessions.length > 0) {
                items.push({ type: 'separator', label: nls.localizeByDefault('Active') });
                items.push(...activeSessions.map(toItem));
            }
            if (persistedSessions.length > 0) {
                items.push({ type: 'separator', label: nls.localize('theia/ai/chat-ui/sectionRestored', 'Restored') });
                items.push(...persistedSessions.map(toItem));
            }
            return items;
        };

        const defer = new Deferred<QuickPickItem | undefined>();
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.placeholder = nls.localize('theia/ai/chat-ui/selectChat', 'Select chat');
        quickPick.canSelectMany = false;
        quickPick.busy = true;
        quickPick.show();

        // Load items asynchronously
        getItems().then(items => {
            quickPick.items = items;
            quickPick.busy = false;
        }).catch(error => {
            this.logger.error('Failed to load chat sessions', error);
            quickPick.busy = false;
            quickPick.placeholder = nls.localize('theia/ai/chat-ui/failedToLoadChats', 'Failed to load chat sessions');
        });

        quickPick.onDidTriggerItemButton(async context => {
            if (context.button === AIChatContribution.RENAME_CHAT_BUTTON) {
                quickPick.hide();
                await this.renameSession(context.item.id!);
            } else if (context.button === AIChatContribution.REMOVE_CHAT_BUTTON) {
                await this.deleteSession(context.item.id!);
                const items = await getItems();
                quickPick.items = items;
                if (items.length === 0) {
                    quickPick.hide();
                }
            }
        });

        quickPick.onDidAccept(async () => {
            const selectedItem = quickPick.selectedItems[0];
            if (selectedItem) {
                // Restore session if not already loaded
                const session = this.chatService.getSession(selectedItem.id!);
                if (!session) {
                    try {
                        await this.chatService.getOrRestoreSession(selectedItem.id!);
                        // Update persisted sessions flag after restoration
                        this.checkPersistedSessions();
                    } catch (error) {
                        this.logger.error('Failed to restore chat session', error);
                        this.messageService.error(nls.localize('theia/ai/chat-ui/failedToRestoreSession', 'Failed to restore chat session'));
                        defer.resolve(undefined);
                        quickPick.hide();
                        return;
                    }
                }
            }
            defer.resolve(selectedItem);
            quickPick.hide();
        });

        quickPick.onDidHide(() => defer.resolve(undefined));

        return defer.promise;
    }

    protected async renameSession(sessionId: string): Promise<void> {
        const name = await this.quickInputService.input({
            placeHolder: nls.localize('theia/ai/chat-ui/enterChatName', 'Enter chat name')
        });
        if (name && name.length > 0) {
            await this.chatService.renameSession(sessionId, name);
        }
    }

    protected async deleteSession(sessionId: string, confirm = false): Promise<void> {
        if (confirm) {
            const confirmed = await new ConfirmDialog({
                title: nls.localize('theia/ai/chat-ui/deleteChat', 'Delete Chat'),
                msg: nls.localizeByDefault('Are you sure you want to delete this chat?')
            }).open();
            if (!confirmed) {
                return;
            }
        }
        const activeSession = this.chatService.getActiveSession();
        try {
            await this.chatService.deleteSession(sessionId);
            this.checkPersistedSessions();
            if (activeSession && activeSession.id === sessionId) {
                this.chatService.createSession(ChatAgentLocation.Panel, { focus: true });
            }
        } catch (error) {
            this.logger.error('Failed to delete chat session', error);
            this.messageService.error(
                nls.localize('theia/ai/chat-ui/failedToDeleteSession', 'Failed to delete chat session')
            );
        }
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

    protected async summarizeActiveSession(): Promise<string | undefined> {
        const activeSession = this.chatService.getActiveSession();
        if (!activeSession) { return; }
        return this.taskContextService.summarize(activeSession).catch(err => {
            this.logger.warn('Error while summarizing session:', err);
            this.messageService.error(nls.localize('theia/ai/chat-ui/unableToSummarizeCurrentSession',
                'Unable to summarize current session. Please confirm that the summary agent is not disabled.'));
            return undefined;
        });
    }

    /**
     * Prompts the user to select a chat agent with an optional default (pre-selected) agent.
     * @param defaultAgentId The id of the agent to pre-select, if present
     * @returns The selected agent or undefined if cancelled
     */
    protected async selectAgent(defaultAgentId?: string): Promise<ChatAgent | undefined> {
        const agents = this.chatAgentService.getAgents();
        if (agents.length === 0) {
            this.messageService.warn(nls.localize('theia/ai/chat-ui/noChatAgentsAvailable', 'No chat agents available.'));
            return undefined;
        }

        const items: QuickPickItem[] = agents.map(agent => ({
            label: agent.name || agent.id,
            description: agent.description,
            id: agent.id
        }));

        let preselected: QuickPickItem | undefined = undefined;
        if (defaultAgentId) {
            preselected = items.find(item => item.id === defaultAgentId);
        }

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: nls.localize('theia/ai/chat-ui/selectAgentQuickPickPlaceholder', 'Select an agent for the new session'),
            activeItem: preselected
        });

        if (!selected) {
            return undefined;
        }

        return this.chatAgentService.getAgent(selected.id!);
    }

    /**
     * Prompts the user to select a task context with special marking for currently opened files
     * @returns The selected task context ID or undefined if cancelled
     */
    protected async selectTaskContextWithMarking(): Promise<string | undefined> {
        const contexts = this.taskContextService.getAll();
        const openedFilesInfo = this.getOpenedTaskContextFiles();

        // Create items with opened files marked and prioritized
        const items: QuickPickItem[] = contexts.map(summary => {
            const isOpened = openedFilesInfo.openedIds.includes(summary.id);
            const isActive = openedFilesInfo.activeId === summary.id;
            return {
                label: isOpened ? `📄 ${summary.label} (${nls.localize('theia/ai/chat-ui/selectTaskContextQuickPickItem/currentlyOpen', 'currently open')})` : summary.label,
                description: summary.id,
                id: summary.id,
                // We'll sort active file first, then opened files, then others
                sortText: isActive ? `0-${summary.label}` : isOpened ? `1-${summary.label}` : `2-${summary.label}`
            };
        }).sort((a, b) => a.sortText!.localeCompare(b.sortText!));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: nls.localize('theia/ai/chat-ui/selectTaskContextQuickPickPlaceholder', 'Select a task context to attach')
        });

        return selected?.id;
    }

    /**
     * Returns information about task context files that are currently opened
     * @returns Object with arrays of opened context IDs and the active context ID
     */
    protected getOpenedTaskContextFiles(): { openedIds: string[], activeId?: string } {
        // Get all contexts with their URIs
        const allContexts = this.taskContextService.getAll();
        const contextMap = new Map<string, string>(); // Map of URI -> ID
        // Create a map of URI string -> context ID for lookup
        for (const context of allContexts) {
            if (context.uri) {
                contextMap.set(context.uri.toString(), context.id);
            }
        }

        // Get all open editor URIs
        const openEditorUris = this.editorManager.all.map(widget => widget.editor.uri.toString());

        // Get the currently active/focused editor URI if any
        const activeEditorUri = this.editorManager.currentEditor?.editor.uri.toString();
        let activeContextId: string | undefined;

        if (activeEditorUri) {
            activeContextId = contextMap.get(activeEditorUri);
        }

        // Filter to only task context files that are currently opened
        const openedContextIds: string[] = [];
        for (const uri of openEditorUris) {
            const contextId = contextMap.get(uri);
            if (contextId) {
                openedContextIds.push(contextId);
            }
        }

        return { openedIds: openedContextIds, activeId: activeContextId };
    }
}
