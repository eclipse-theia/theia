// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { ApplicationShell, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PendingToolConfirmation, PendingToolConfirmationTracker } from '@theia/ai-chat/lib/browser/pending-tool-confirmation-tracker';
import { ChatViewWidget } from './chat-view-widget';

export const HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY = 'theiaAi.hasPendingToolConfirmation';

/**
 * Only fire the approve/deny shortcuts while the chat view is focused, so e.g. `Ctrl+Enter` in an
 * editor is never shadowed by a confirmation pending in some background chat.
 */
const CHAT_VIEW_FOCUS_WHEN = '(chatInputFocus || chatResponseFocus)';

export const APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND = Command.toLocalizedCommand({
    id: 'theia.ai.chat.approveLatestToolConfirmation',
    label: 'Approve Latest Tool Confirmation'
}, 'theia/ai/chat-ui/toolconfirmation/approveLatest');

export const DENY_LATEST_TOOL_CONFIRMATION_COMMAND = Command.toLocalizedCommand({
    id: 'theia.ai.chat.denyLatestToolConfirmation',
    label: 'Deny Latest Tool Confirmation'
}, 'theia/ai/chat-ui/toolconfirmation/denyLatest');

@injectable()
export class ToolConfirmationKeybindingContribution implements CommandContribution, KeybindingContribution {

    @inject(PendingToolConfirmationTracker)
    protected readonly pendingTracker: PendingToolConfirmationTracker;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected hasPendingKey: ContextKey<boolean>;

    @postConstruct()
    protected init(): void {
        this.hasPendingKey = this.contextKeyService.createKey<boolean>(HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY, false);
        this.pendingTracker.onChanged(() => this.hasPendingKey.set(this.pendingTracker.hasPending()));
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND, {
            isEnabled: () => this.hasPendingInActiveChat(),
            execute: () => this.getLatestInActiveChat()?.allow()
        });
        commands.registerCommand(DENY_LATEST_TOOL_CONFIRMATION_COMMAND, {
            isEnabled: () => this.hasPendingInActiveChat(),
            execute: () => this.getLatestInActiveChat()?.deny()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND.id,
            keybinding: 'ctrlcmd+enter',
            when: `${HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY} && ${CHAT_VIEW_FOCUS_WHEN}`
        });
        keybindings.registerKeybinding({
            command: DENY_LATEST_TOOL_CONFIRMATION_COMMAND.id,
            keybinding: 'ctrlcmd+shift+backspace',
            when: `${HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY} && ${CHAT_VIEW_FOCUS_WHEN}`
        });
    }

    /**
     * The id of the chat the user is currently interacting with, or `undefined` if no chat view is
     * focused. Used to target the shortcuts at the visible confirmation rather than the globally
     * newest one.
     */
    protected getActiveChatId(): string | undefined {
        return ChatViewWidget.findActive(this.shell)?.sessionId;
    }

    protected hasPendingInActiveChat(): boolean {
        const chatId = this.getActiveChatId();
        return chatId !== undefined && this.pendingTracker.hasPending(chatId);
    }

    protected getLatestInActiveChat(): PendingToolConfirmation | undefined {
        const chatId = this.getActiveChatId();
        return chatId === undefined ? undefined : this.pendingTracker.getLatest(chatId);
    }
}
