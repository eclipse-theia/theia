/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import {
    CommandContribution,
    KeybindingContribution,
    KeyCode,
    Key,
    Modifier,
    KeybindingRegistry,
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    Keybinding,
    KeybindingContextRegistry,
    isOSX
} from '@theia/core/lib/common';
import { CommonMenus, ApplicationShell } from '@theia/core/lib/browser';
import { TERMINAL_WIDGET_FACTORY_ID, TerminalWidgetFactoryOptions, TerminalWidget } from './terminal-widget';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export namespace TerminalCommands {
    export const NEW: Command = {
        id: 'terminal:new',
        label: 'New Terminal'
    };
}

const TERMINAL_ACTIVE_CONTEXT = "terminalActive";

@injectable()
export class TerminalFrontendContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    constructor(
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(KeybindingContextRegistry) protected readonly keybindingContextRegistry: KeybindingContextRegistry,
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TerminalCommands.NEW);
        commands.registerHandler(TerminalCommands.NEW.id, {
            isEnabled: () => true,
            execute: () => this.newTerminal()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_NEW, {
            commandId: TerminalCommands.NEW.id
        });
    }

    /* Return true if a TerminalWidget widget is currently in focus.  */

    isTerminalFocused(binding: Keybinding): boolean {
        return this.shell.currentWidget instanceof TerminalWidget;
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        this.keybindingContextRegistry.registerContext({
            id: TERMINAL_ACTIVE_CONTEXT,
            isEnabled: (binding: Keybinding) => this.isTerminalFocused(binding),
        });

        keybindings.registerKeybinding({
            commandId: TerminalCommands.NEW.id,
            keyCode: KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [Modifier.M1] }),
        });

        /* Register passthrough keybindings for combinations recognized by
           xterm.js and converted to control characters.

             See: https://github.com/xtermjs/xterm.js/blob/v3/src/Terminal.ts#L1684 */

        /* Register ctrl + k (the passed Key) as a passthrough command in the
           context of the terminal.  */
        const regCtrl = (k: Key) => {
            keybindings.registerKeybindings({
                commandId: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keyCode: KeyCode.createKeyCode({ first: k, modifiers: [Modifier.CTRL] }),
                contextId: TERMINAL_ACTIVE_CONTEXT,
            });
        };

        /* Register alt + k (the passed Key) as a passthrough command in the
           context of the terminal.  */
        const regAlt = (k: Key) => {
            keybindings.registerKeybinding({
                commandId: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keyCode: KeyCode.createKeyCode({ first: k, modifiers: [Modifier.M3] }),
                contextId: TERMINAL_ACTIVE_CONTEXT,
            });
        };

        /* ctrl-space (000 - NUL).  */
        regCtrl(Key.SPACE);

        /* ctrl-A (001/1/0x1) through ctrl-Z (032/26/0x1A).  */
        for (let i = 0; i < 26; i++) {
            regCtrl({
                keyCode: Key.KEY_A.keyCode + i,
                code: 'Key' + String.fromCharCode('A'.charCodeAt(0) + i)
            });
        }

        /* ctrl-[ or ctrl-3 (033/27/0x1B - ESC).  */
        regCtrl(Key.BRACKET_LEFT);
        regCtrl(Key.DIGIT3);

        /* ctrl-\ or ctrl-4 (034/28/0x1C - FS).  */
        regCtrl(Key.BACKSLASH);
        regCtrl(Key.DIGIT4);

        /* ctrl-] or ctrl-5 (035/29/0x1D - GS).  */
        regCtrl(Key.BRACKET_RIGHT);
        regCtrl(Key.DIGIT5);

        /* ctrl-6 (036/30/0x1E - RS).  */
        regCtrl(Key.DIGIT6);

        /* ctrl-7 (037/31/0x1F - US).  */
        regCtrl(Key.DIGIT7);

        /* ctrl-8 (177/127/0x7F - DEL).  */
        regCtrl(Key.DIGIT8);

        /* alt-A (0x1B 0x62) through alt-Z (0x1B 0x7A).  */
        for (let i = 0; i < 26; i++) {
            regAlt({
                keyCode: Key.KEY_A.keyCode + i,
                code: 'Key' + String.fromCharCode('A'.charCodeAt(0) + i)
            });
        }

        /* alt-` (0x1B 0x60).  */
        regAlt(Key.BACKQUOTE);

        /* alt-0 (0x1B 0x30) through alt-9 (0x1B 0x39).  */
        for (let i = 0; i < 10; i++) {
            regAlt({
                keyCode: Key.DIGIT0.keyCode + i,
                code: 'Digit' + String.fromCharCode('0'.charCodeAt(0) + i)
            });
        }
        if (isOSX) {
            // selectAll on OSX
            keybindings.registerKeybindings({
                commandId: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [Modifier.M1] }),
                contextId: TERMINAL_ACTIVE_CONTEXT,
            });
        }
    }

    protected async newTerminal(): Promise<void> {
        const widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(TERMINAL_WIDGET_FACTORY_ID, <TerminalWidgetFactoryOptions>{
            created: new Date().toString()
        });
        widget.start();
    }

}
