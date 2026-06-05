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
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIChatInputWidget } from './chat-input-widget';

export const CHAT_INPUT_TOGGLE_CAPABILITIES_COMMAND = Command.toLocalizedCommand({
    id: 'chat-input:toggle-capabilities',
    label: 'Toggle Capabilities Configuration'
}, 'theia/ai/chat-ui/chatInput/toggleCapabilities');

@injectable()
export class ChatInputCapabilitiesContribution implements CommandContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CHAT_INPUT_TOGGLE_CAPABILITIES_COMMAND, {
            execute: () => this.executeToggle(),
            isEnabled: () => this.isToggleEnabled()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHAT_INPUT_TOGGLE_CAPABILITIES_COMMAND.id,
            keybinding: 'ctrlcmd+shift+.',
            when: 'chatInputFocus'
        });
    }

    protected executeToggle(): void {
        const chatInputWidget = this.findFocusedChatInput();
        if (!chatInputWidget) {
            return;
        }
        chatInputWidget.toggleCapabilities();
    }

    protected isToggleEnabled(): boolean {
        const chatInputWidget = this.findFocusedChatInput();
        return chatInputWidget !== undefined;
    }

    protected findFocusedChatInput(): AIChatInputWidget | undefined {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) {
            return;
        }
        const activeWidget = this.shell.findWidgetForElement(activeElement);
        if (!(activeWidget instanceof AIChatInputWidget)) {
            return;
        }
        if (!activeWidget.editor?.getControl().hasWidgetFocus()) {
            return;
        }
        return activeWidget;
    }
}
