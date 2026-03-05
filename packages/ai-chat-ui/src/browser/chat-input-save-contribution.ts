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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { ChatInputFocusService } from './chat-input-focus-service';
import { AIChatInputWidget } from './chat-input-widget';

const CHAT_INPUT_SAVE_SETTINGS_COMMAND = Command.toLocalizedCommand({
    id: 'chat-input:save-capability-settings',
    label: 'Save Capability Settings'
}, 'theia/ai/chat-ui/chatInput/saveCurrentSelectionsToSettings');

@injectable()
export class ChatInputSaveContribution implements CommandContribution, KeybindingContribution {

    @inject(ChatInputFocusService)
    protected readonly chatInputFocusService: ChatInputFocusService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CHAT_INPUT_SAVE_SETTINGS_COMMAND, {
            execute: () => {
                const widget = this.findFocusedChatInput();
                if (widget) {
                    widget.saveCurrentSelectionsToSettings();
                }
            },
            isEnabled: () => {
                const widget = this.findFocusedChatInput();
                return widget !== undefined && widget.hasAnyChangesFromSaved();
            }
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHAT_INPUT_SAVE_SETTINGS_COMMAND.id,
            keybinding: 'ctrlcmd+s',
            when: 'chatInputFocus'
        });
    }

    protected findFocusedChatInput(): AIChatInputWidget | undefined {
        const widget = this.chatInputFocusService.getFocused();
        if (widget?.editor?.getControl().hasWidgetFocus()) {
            return widget;
        }
        return undefined;
    }
}
