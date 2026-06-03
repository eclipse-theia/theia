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
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PendingToolConfirmationTracker } from '@theia/ai-chat/lib/browser/pending-tool-confirmation-tracker';

export const HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY = 'theiaAi.hasPendingToolConfirmation';

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

    protected hasPendingKey: ContextKey<boolean>;

    @postConstruct()
    protected init(): void {
        this.hasPendingKey = this.contextKeyService.createKey<boolean>(HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY, false);
        this.pendingTracker.onChanged(() => this.hasPendingKey.set(this.pendingTracker.hasPending()));
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND, {
            isEnabled: () => this.pendingTracker.hasPending(),
            execute: () => this.pendingTracker.getLatest()?.allow()
        });
        commands.registerCommand(DENY_LATEST_TOOL_CONFIRMATION_COMMAND, {
            isEnabled: () => this.pendingTracker.hasPending(),
            execute: () => this.pendingTracker.getLatest()?.deny()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND.id,
            keybinding: 'ctrlcmd+enter',
            when: HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY
        });
        keybindings.registerKeybinding({
            command: DENY_LATEST_TOOL_CONFIRMATION_COMMAND.id,
            keybinding: 'ctrlcmd+shift+backspace',
            when: HAS_PENDING_TOOL_CONFIRMATION_CONTEXT_KEY
        });
    }
}
