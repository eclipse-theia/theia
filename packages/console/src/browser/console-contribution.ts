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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, CommandHandler } from '@theia/core';
import { FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry, CommonCommands, ApplicationShell } from '@theia/core/lib/browser';
import { ConsoleManager } from './console-manager';
import { ConsoleWidget } from './console-widget';
import { ConsoleContentWidget } from './console-content-widget';
import { nls } from '@theia/core/lib/common/nls';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

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

    @inject(ApplicationShell)
    protected shell: ApplicationShell;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(ConsoleManager)
    protected readonly manager: ConsoleManager;

    @postConstruct()
    protected init(): void {

        const consoleContentFocusKey = this.contextKeyService.createKey<boolean>('consoleContentFocus', false);
        const updateConsoleContentFocusKey = () => consoleContentFocusKey.set(this.isConsoleContentFocused());
        updateConsoleContentFocusKey();

        const consoleInputFocusKey = this.contextKeyService.createKey<boolean>('consoleInputFocus', false);
        const updateConsoleInputFocusKey = () => consoleInputFocusKey.set(this.isConsoleInputFocused());
        updateConsoleInputFocusKey();

        const consoleNavigationBackEnabledKey = this.contextKeyService.createKey<boolean>('consoleNavigationBackEnabled', false);
        const updateConsoleNavigationBackEnabledKey = () => consoleNavigationBackEnabledKey.set(this.isConsoleBackEnabled());
        updateConsoleNavigationBackEnabledKey();

        const consoleNavigationForwardEnabledKey = this.contextKeyService.createKey<boolean>('consoleNavigationForwardEnabled', false);
        const updateConsoleNavigationForwardEnabledKey = () => consoleNavigationForwardEnabledKey.set(this.isConsoleForwardEnabled());
        updateConsoleNavigationForwardEnabledKey();

        this.shell.onDidChangeActiveWidget(() => {
            updateConsoleContentFocusKey();
            updateConsoleInputFocusKey();
            updateConsoleNavigationBackEnabledKey();
            updateConsoleNavigationForwardEnabledKey();
        });

    }

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
            when: 'consoleContentFocus'
        });
        keybindings.registerKeybinding({
            command: ConsoleCommands.EXECUTE.id,
            keybinding: 'enter',
            when: 'consoleInputFocus',
        });
        keybindings.registerKeybinding({
            command: ConsoleCommands.NAVIGATE_BACK.id,
            keybinding: 'up',
            when: 'consoleNavigationBackEnabled'
        });
        keybindings.registerKeybinding({
            command: ConsoleCommands.NAVIGATE_FORWARD.id,
            keybinding: 'down',
            when: 'consoleNavigationForwardEnabled'
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(ConsoleContextMenu.CLIPBOARD, {
            commandId: CommonCommands.COPY.id,
            label: CommonCommands.COPY.label,
            order: 'a1',
        });
        menus.registerMenuAction(ConsoleContextMenu.CLIPBOARD, {
            commandId: ConsoleCommands.SELECT_ALL.id,
            label: CommonCommands.SELECT_ALL.label,
            order: 'a2'
        });
        menus.registerMenuAction(ConsoleContextMenu.CLIPBOARD, {
            commandId: ConsoleCommands.COLLAPSE_ALL.id,
            label: nls.localizeByDefault('Collapse All'),
            order: 'a3'
        });
        menus.registerMenuAction(ConsoleContextMenu.CLEAR, {
            commandId: ConsoleCommands.CLEAR.id,
            label: nls.localizeByDefault('Clear Console')
        });
    }

    protected newCommandHandler(execute: ConsoleExecuteFunction): ConsoleCommandHandler {
        return new ConsoleCommandHandler(this.manager, execute);
    }

    protected isConsoleContentFocused(): boolean {
        const console = this.manager.activeConsole;
        return !!console && !console.hasInputFocus();
    }

    protected isConsoleInputFocused(): boolean {
        const console = this.manager.activeConsole;
        return !!console && console.hasInputFocus();
    }

    protected isConsoleBackEnabled(): boolean {
        const console = this.manager.activeConsole;
        if (!!console && console.hasInputFocus()) {
            const editor = console.input.getControl();
            return editor.getPosition()!.equals({ lineNumber: 1, column: 1 });
        }
        return false;
    }

    protected isConsoleForwardEnabled(): boolean {
        const console = this.manager.activeConsole;
        if (!!console && console.hasInputFocus()) {
            const editor = console.input.getControl();
            const model = console.input.getControl().getModel()!;
            const lineNumber = model.getLineCount();
            const column = model.getLineMaxColumn(lineNumber);
            return editor.getPosition()!.equals({ lineNumber, column });
        }
        return false;
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
