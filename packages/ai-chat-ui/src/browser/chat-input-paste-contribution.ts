// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { CommonCommands, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatInputFocusService } from './chat-input-focus-service';

/**
 * Handles Ctrl+V / Cmd+V in the chat input to paste images from the clipboard.
 *
 * In Electron, Theia's global paste command uses `document.execCommand('paste')`,
 * which does not produce a DOM paste event for image clipboard content.
 * In the browser, Monaco 1.108+'s EditContext API handles Ctrl+V internally
 * without firing a DOM paste event.
 *
 * This contribution registers a higher-priority keybinding (scoped to `chatInputFocus`)
 * that reads images from the clipboard via the async Clipboard API.
 * For non-image clipboard content, it falls through to the default paste behavior.
 */
export const CHAT_INPUT_PASTE_COMMAND = Command.toLocalizedCommand({
    id: 'chat-input:paste-with-image-support',
    label: 'Paste (with image support)'
}, 'theia/ai/chat-ui/chatInput/pasteWithImageSupport');

@injectable()
export class ChatInputPasteContribution implements CommandContribution, KeybindingContribution {

    @inject(ChatInputFocusService)
    protected readonly chatInputFocusService: ChatInputFocusService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CHAT_INPUT_PASTE_COMMAND, {
            execute: () => this.execute(),
            isEnabled: () => !!this.chatInputFocusService.getFocused()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHAT_INPUT_PASTE_COMMAND.id,
            keybinding: 'ctrlcmd+v',
            when: 'chatInputFocus'
        });
    }

    protected async execute(): Promise<void> {
        const widget = this.chatInputFocusService.getFocused();
        if (!widget) {
            return;
        }
        const imagesPasted = await widget.pasteFromClipboard();
        if (!imagesPasted) {
            // No images found — trigger the default paste for text content
            this.commandRegistry.executeCommand(CommonCommands.PASTE.id);
        }
    }
}
