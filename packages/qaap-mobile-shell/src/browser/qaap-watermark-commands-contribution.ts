// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AI_CHAT_TOGGLE_COMMAND_ID,
    CHAT_VIEW_WIDGET_ID,
    QAAP_MAXIMIZE_CHAT_COMMAND_ID
} from './qaap-watermark-entries';

const QAAP_MAXIMIZE_CHAT_COMMAND = Command.toLocalizedCommand({
    id: QAAP_MAXIMIZE_CHAT_COMMAND_ID,
    category: 'Chat',
    label: 'Maximize Chat'
}, 'qaap/watermark/maximizeChat', 'Chat');

/** Cursor-aligned keybindings + maximize-chat for the empty workbench watermark. */
@injectable()
export class QaapWatermarkCommandsContribution implements CommandContribution, KeybindingContribution {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(QAAP_MAXIMIZE_CHAT_COMMAND, {
            execute: () => this.maximizeChat(),
            isEnabled: () => this.commands.getCommand(AI_CHAT_TOGGLE_COMMAND_ID) !== undefined
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        const chords: Array<{ command: string; keybinding: string }> = [
            { command: AI_CHAT_TOGGLE_COMMAND_ID, keybinding: 'ctrlcmd+shift+l' },
            { command: 'workbench.action.terminal.toggleTerminal', keybinding: 'ctrlcmd+j' },
            { command: 'fileNavigator:toggle', keybinding: 'ctrlcmd+shift+e' },
            { command: 'workbench.view.explorer', keybinding: 'ctrlcmd+shift+e' },
            { command: 'file-search.openFile', keybinding: 'ctrlcmd+p' },
            { command: 'workbench.action.quickOpen', keybinding: 'ctrlcmd+p' },
            { command: 'mini-browser.openUrl', keybinding: 'ctrlcmd+shift+b' },
            { command: QAAP_MAXIMIZE_CHAT_COMMAND_ID, keybinding: 'ctrlcmd+alt+e' }
        ];
        for (const { command, keybinding } of chords) {
            keybindings.registerKeybinding({ command, keybinding });
        }
    }

    protected async maximizeChat(): Promise<void> {
        if (!this.commands.getCommand(AI_CHAT_TOGGLE_COMMAND_ID)) {
            return;
        }
        await this.commands.executeCommand(AI_CHAT_TOGGLE_COMMAND_ID);
        const widget = await this.widgetManager.getWidget(CHAT_VIEW_WIDGET_ID);
        if (!widget) {
            return;
        }
        await this.shell.activateWidget(widget.id);
        this.shell.toggleMaximized(widget);
    }
}
