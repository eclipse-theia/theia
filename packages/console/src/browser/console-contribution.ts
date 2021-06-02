/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, CommandHandler } from '@theia/core';
import { FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry, CommonCommands } from '@theia/core/lib/browser';
import { ConsoleManager } from './console-manager';
import { ConsoleKeybindingContexts } from './console-keybinding-contexts';
import { ConsoleWidget } from './console-widget';
import { ConsoleContentWidget } from './console-content-widget';

export namespace ConsoleCommands {
    export const SELECT_ALL: Command = {
        id: 'console.selectAll'
    };
    export const COLLAPSE_ALL: Command = {
        id: 'console.collapseAll'
    };
    export const CLEAR: Command = {
        id: 'console.clear'
    };
    export const EXECUTE: Command = {
        id: 'console.execute'
    };
    export const NAVIGATE_BACK: Command = {
        id: 'console.navigatePrevious'
    };
    export const NAVIGATE_FORWARD: Command = {
        id: 'console.navigateNext'
    };
}

export namespace ConsoleContextMenu {
    export const CLIPBOARD = [...ConsoleContentWidget.CONTEXT_MENU, '1_clipboard'];
    export const CLEAR = [...ConsoleContentWidget.CONTEXT_MENU, '2_clear'];
}

@injectable()
export class ConsoleContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution, MenuContribution {

    @inject(ConsoleManager)
    protected readonly manager: ConsoleManager;

    initialize(): void { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ConsoleCommands.SELECT_ALL, this.newCommandHandler(console => console.selectAll()));
        commands.registerCommand(ConsoleCommands.COLLAPSE_ALL, this.newCommandHandler(console => console.collapseAll()));
        commands.registerCommand(ConsoleCommands.CLEAR, this.newCommandHandler(console => console.clear()));
        commands.registerCommand(ConsoleCommands.EXECUTE, this.newCommandHandler(console => console.execute()));
        commands.registerCommand(ConsoleCommands.NAVIGATE_BACK, this.newCommandHandler(console => console.navigateBack()));
        commands.registerCommand(ConsoleCommands.NAVIGATE_FORWARD, this.newCommandHandler(console => console.navigateForward()));
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: ConsoleCommands.SELECT_ALL.id,
            keybinding: 'ctrlcmd+a',
            context: ConsoleKeybindingContexts.consoleContentFocus
        });
        keybindings.registerKeybinding({
            command: ConsoleCommands.EXECUTE.id,
            keybinding: 'enter',
            context: ConsoleKeybindingContexts.consoleInputFocus
        });
        keybindings.registerKeybinding({
            command: ConsoleCommands.NAVIGATE_BACK.id,
            keybinding: 'up',
            context: ConsoleKeybindingContexts.consoleNavigationBackEnabled
        });
        keybindings.registerKeybinding({
            command: ConsoleCommands.NAVIGATE_FORWARD.id,
            keybinding: 'down',
            context: ConsoleKeybindingContexts.consoleNavigationForwardEnabled
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(ConsoleContextMenu.CLIPBOARD, {
            commandId: CommonCommands.COPY.id,
            label: 'Copy',
            order: 'a1',
        });
        menus.registerMenuAction(ConsoleContextMenu.CLIPBOARD, {
            commandId: ConsoleCommands.SELECT_ALL.id,
            label: 'Select All',
            order: 'a2'
        });
        menus.registerMenuAction(ConsoleContextMenu.CLIPBOARD, {
            commandId: ConsoleCommands.COLLAPSE_ALL.id,
            label: 'Collapse All',
            order: 'a3'
        });
        menus.registerMenuAction(ConsoleContextMenu.CLEAR, {
            commandId: ConsoleCommands.CLEAR.id,
            label: 'Clear Console'
        });
    }

    protected newCommandHandler(execute: ConsoleExecuteFunction): ConsoleCommandHandler {
        return new ConsoleCommandHandler(this.manager, execute);
    }

}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConsoleExecuteFunction = (console: ConsoleWidget, ...args: any[]) => any;
export class ConsoleCommandHandler implements CommandHandler {

    constructor(
        protected readonly manager: ConsoleManager,
        protected readonly doExecute: ConsoleExecuteFunction
    ) { }

    isEnabled(): boolean {
        return !!this.manager.currentConsole;
    }

    isVisible(): boolean {
        return !!this.manager.currentConsole;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute(...args: any[]): any {
        const { currentConsole } = this.manager;
        if (currentConsole) {
            return this.doExecute(currentConsole, ...args);
        }
    }

}
